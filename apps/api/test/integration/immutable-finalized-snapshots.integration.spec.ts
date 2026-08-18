import { ConfigService } from '@nestjs/config';
import {
  DrawStatus,
  DrawType,
  PrismaClient,
  PurchaseStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import {
  DrawPrismaService,
  PrismaService,
} from '../../src/prisma/prisma.service';
import { SnapshotBuilderService } from '../../src/snapshots/snapshot-builder.service';
import { SnapshotCryptographyService } from '../../src/snapshots/snapshot-cryptography.service';
import { SnapshotFinalizerService } from '../../src/snapshots/snapshot-finalizer.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';
import {
  createTestAdminPrisma,
  createTestDrawPrisma,
} from './database-role.helper';
import {
  ensureTestTicketAllocation,
} from './ticket-fixture.helper';


const OWNER_SECRET =
  'integration-snapshot-owner-secret-at-least-32-bytes';

describe('Immutable finalized snapshots integration', () => {
  let prisma: PrismaService;
  let fixturePrisma: PrismaClient;
  let drawPrisma: DrawPrismaService;
  let builder: SnapshotBuilderService;
  let finalizer: SnapshotFinalizerService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    fixturePrisma = await createTestAdminPrisma();
    drawPrisma = await createTestDrawPrisma();

    builder = new SnapshotBuilderService(
      drawPrisma,
      new ConfigService({
        SNAPSHOT_OWNER_SECRET: OWNER_SECRET,
      }),
    );

    finalizer = new SnapshotFinalizerService(
      drawPrisma,
      new SnapshotCryptographyService(),
    );
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await Promise.all([
      prisma.$disconnect(),
      fixturePrisma.$disconnect(),
      drawPrisma.$disconnect(),
    ]);
  });

  async function createBuiltSnapshot() {
    const user = await fixturePrisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const draw = await fixturePrisma.lotteryDraw.create({
      data: {
        publicId: `W-2026-${randomUUID()}`,
        type: DrawType.WEEKLY,
        status: DrawStatus.SALES_OPEN,
        sequenceNumber: Math.floor(Math.random() * 1_000_000),
        scheduledDrawAt: new Date(Date.now() + 86_400_000),
        currency: 'USD',
        ticketPriceMinor: 100n,
      },
    });

    const purchase = await fixturePrisma.purchase.create({
      data: {
        publicId: `PUR-${randomUUID()}`,
        userId: user.id,
        drawId: draw.id,
        status: PurchaseStatus.COMPLETED,
        requestedTicketCount: 2,
        ticketPriceMinor: 100n,
        totalAmountMinor: 200n,
        currency: 'USD',
        idempotencyKey: randomUUID(),
        paymentConfirmedAt: new Date(),
        completedAt: new Date(),
      },
    });

    await ensureTestTicketAllocation(
      fixturePrisma,
      {
        purchaseId: purchase.id,
        drawId: draw.id,
        numberInDraw: 1n,
      },
    );

    const firstTicket = await fixturePrisma.ticket.create({
      data: {
        publicId: `TKT-${randomUUID()}`,
        userId: user.id,
        purchaseId: purchase.id,
        drawId: draw.id,
        numberInDraw: 1n,
      },
    });

    await ensureTestTicketAllocation(
      fixturePrisma,
      {
        purchaseId: purchase.id,
        drawId: draw.id,
        numberInDraw: 2n,
      },
    );

    const secondTicket = await fixturePrisma.ticket.create({
      data: {
        publicId: `TKT-${randomUUID()}`,
        userId: user.id,
        purchaseId: purchase.id,
        drawId: draw.id,
        numberInDraw: 2n,
      },
    });

    await fixturePrisma.lotteryDraw.update({
      where: { id: draw.id },
      data: { status: DrawStatus.SALES_CLOSED },
    });

    const built = await builder.build(draw.id);

    return {
      user,
      draw,
      purchase,
      firstTicket,
      secondTicket,
      built,
    };
  }

  async function createFinalizedSnapshot() {
    const scenario = await createBuiltSnapshot();

    const finalized = await finalizer.finalize(
      scenario.draw.id,
    );

    const entry =
      await prisma.ticketSnapshotEntry.findFirstOrThrow({
        where: {
          snapshotId: scenario.built.snapshotId,
        },
        orderBy: {
          position: 'asc',
        },
      });

    return {
      ...scenario,
      finalized,
      entry,
    };
  }

  it('rejects direct updates to a finalized snapshot', async () => {
    const scenario = await createFinalizedSnapshot();

    await expect(
      drawPrisma.$executeRaw`
        UPDATE "ticket_snapshots"
        SET "canonicalFormat" = 'CORRUPTED'
        WHERE "id" = ${scenario.built.snapshotId}::uuid
      `,
    ).rejects.toThrow(
      'Finalized snapshots are immutable and cannot be modified',
    );
  });

  it('rejects direct deletion of a finalized snapshot', async () => {
    const scenario = await createFinalizedSnapshot();

    await expect(
      fixturePrisma.$executeRaw`
        DELETE FROM "ticket_snapshots"
        WHERE "id" = ${scenario.built.snapshotId}::uuid
      `,
    ).rejects.toThrow(
      'Finalized snapshots are immutable and cannot be deleted',
    );
  });

  it('rejects inserting an entry into a finalized snapshot', async () => {
    const scenario = await createFinalizedSnapshot();

    await expect(
      drawPrisma.$executeRaw`
        INSERT INTO "ticket_snapshot_entries" (
          "id",
          "snapshotId",
          "ticketId",
          "position",
          "ticketPublicId",
          "ownerPublicRef"
        )
        VALUES (
          ${randomUUID()}::uuid,
          ${scenario.built.snapshotId}::uuid,
          ${scenario.secondTicket.id}::uuid,
          3,
          ${`TKT-${randomUUID()}`},
          ${'owner-corrupted'}
        )
      `,
    ).rejects.toThrow(
      'Entries of a finalized snapshot are immutable',
    );
  });

  it('rejects updating an entry of a finalized snapshot', async () => {
    const scenario = await createFinalizedSnapshot();

    await expect(
      fixturePrisma.$executeRaw`
        UPDATE "ticket_snapshot_entries"
        SET "ownerPublicRef" = 'owner-corrupted'
        WHERE "id" = ${scenario.entry.id}::uuid
      `,
    ).rejects.toThrow(
      'Entries of a finalized snapshot are immutable',
    );
  });

  it('rejects deleting an entry of a finalized snapshot', async () => {
    const scenario = await createFinalizedSnapshot();

    await expect(
      fixturePrisma.$executeRaw`
        DELETE FROM "ticket_snapshot_entries"
        WHERE "id" = ${scenario.entry.id}::uuid
      `,
    ).rejects.toThrow(
      'Entries of a finalized snapshot are immutable',
    );
  });

  it('rejects finalization without a valid snapshot hash', async () => {
    const scenario = await createBuiltSnapshot();

    await expect(
      drawPrisma.$executeRaw`
        UPDATE "ticket_snapshots"
        SET
          "status" = 'FINALIZED'::"SnapshotStatus",
          "snapshotHash" = 'invalid',
          "merkleRoot" = ${'a'.repeat(64)},
          "finalizedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${scenario.built.snapshotId}::uuid
      `,
    ).rejects.toThrow(
      'Finalized snapshots require a valid SHA-256 snapshotHash',
    );
  });

  it('rejects finalization without a valid Merkle root', async () => {
    const scenario = await createBuiltSnapshot();

    await expect(
      drawPrisma.$executeRaw`
        UPDATE "ticket_snapshots"
        SET
          "status" = 'FINALIZED'::"SnapshotStatus",
          "snapshotHash" = ${'b'.repeat(64)},
          "merkleRoot" = 'invalid',
          "finalizedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${scenario.built.snapshotId}::uuid
      `,
    ).rejects.toThrow(
      'Finalized snapshots require a valid SHA-256 merkleRoot',
    );
  });

  it('rejects finalization without finalizedAt', async () => {
    const scenario = await createBuiltSnapshot();

    await expect(
      drawPrisma.$executeRaw`
        UPDATE "ticket_snapshots"
        SET
          "status" = 'FINALIZED'::"SnapshotStatus",
          "snapshotHash" = ${'c'.repeat(64)},
          "merkleRoot" = ${'d'.repeat(64)},
          "finalizedAt" = NULL
        WHERE "id" = ${scenario.built.snapshotId}::uuid
      `,
    ).rejects.toThrow(
      'Finalized snapshots require finalizedAt',
    );
  });

  it('rejects changing canonical fields during finalization', async () => {
    const scenario = await createBuiltSnapshot();

    await expect(
      drawPrisma.$executeRaw`
        UPDATE "ticket_snapshots"
        SET
          "status" = 'FINALIZED'::"SnapshotStatus",
          "ticketCount" = 999,
          "snapshotHash" = ${'e'.repeat(64)},
          "merkleRoot" = ${'f'.repeat(64)},
          "finalizedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${scenario.built.snapshotId}::uuid
      `,
    ).rejects.toThrow(
      'Snapshot identity and canonical fields cannot change during finalization',
    );
  });
});
