import { ConfigService } from '@nestjs/config';
import {
  DrawStatus,
  DrawType,
  PrismaClient,
  PurchaseStatus,
  SnapshotStatus,
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

describe('Snapshot finalizer integration', () => {
  let prisma: PrismaService;
  let fixturePrisma: PrismaClient;
  let drawPrisma: DrawPrismaService;
  let builder: SnapshotBuilderService;
  let cryptography: SnapshotCryptographyService;
  let finalizer: SnapshotFinalizerService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    fixturePrisma =
      await createTestAdminPrisma();
    drawPrisma =
      await createTestDrawPrisma();

    cryptography = new SnapshotCryptographyService();
    builder = new SnapshotBuilderService(
      drawPrisma,
      new ConfigService({
        SNAPSHOT_OWNER_SECRET: OWNER_SECRET,
      }),
    );
    finalizer = new SnapshotFinalizerService(
      drawPrisma,
      cryptography,
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

  async function createBuiltSnapshot(ticketCount = 3) {
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
        requestedTicketCount: ticketCount,
        ticketPriceMinor: 100n,
        totalAmountMinor: BigInt(ticketCount * 100),
        currency: 'USD',
        idempotencyKey: randomUUID(),
        paymentConfirmedAt: new Date(),
        completedAt: new Date(),
      },
    });

    for (let index = 1; index <= ticketCount; index += 1) {
      await ensureTestTicketAllocation(
        fixturePrisma,
        {
          purchaseId: purchase.id,
          drawId: draw.id,
          numberInDraw: BigInt(index),
        },
      );

      await fixturePrisma.ticket.create({
        data: {
          publicId: `TKT-${randomUUID()}`,
          userId: user.id,
          purchaseId: purchase.id,
          drawId: draw.id,
          numberInDraw: BigInt(index),
        },
      });
    }

    await fixturePrisma.lotteryDraw.update({
      where: { id: draw.id },
      data: { status: DrawStatus.SALES_CLOSED },
    });

    const built = await builder.build(draw.id);

    return { user, draw, purchase, built };
  }

  it('finalizes a built snapshot and advances the draw state', async () => {
    const scenario = await createBuiltSnapshot();

    const result = await finalizer.finalize(scenario.draw.id);

    expect(result).toMatchObject({
      snapshotId: scenario.built.snapshotId,
      drawId: scenario.draw.id,
      ticketCount: 3n,
      hashAlgorithm: 'SHA-256',
      alreadyFinalized: false,
    });
    expect(result.snapshotHash).toHaveLength(64);
    expect(result.merkleRoot).toHaveLength(64);
    expect(result.finalizedAt).toBeInstanceOf(Date);

    const snapshot =
      await prisma.ticketSnapshot.findUniqueOrThrow({
        where: { id: scenario.built.snapshotId },
      });

    expect(snapshot.status).toBe(SnapshotStatus.FINALIZED);
    expect(snapshot.snapshotHash).toBe(result.snapshotHash);
    expect(snapshot.merkleRoot).toBe(result.merkleRoot);
    expect(snapshot.finalizedAt).toEqual(result.finalizedAt);

    const draw =
      await prisma.lotteryDraw.findUniqueOrThrow({
        where: { id: scenario.draw.id },
      });

    expect(draw.status).toBe(DrawStatus.SNAPSHOT_FINALIZED);
  });

  it('stores the deterministic commitment calculated from ordered entries', async () => {
    const scenario = await createBuiltSnapshot();

    const snapshot =
      await prisma.ticketSnapshot.findUniqueOrThrow({
        where: { id: scenario.built.snapshotId },
        include: {
          entries: {
            orderBy: [
              { position: 'asc' },
              { id: 'asc' },
            ],
          },
        },
      });

    const expected = cryptography.createCommitment(
      snapshot.canonicalFormat,
      scenario.draw.id,
      snapshot.entries.map((entry) => ({
        position: entry.position,
        ticketPublicId: entry.ticketPublicId,
        ownerPublicRef: entry.ownerPublicRef,
      })),
    );

    const result = await finalizer.finalize(scenario.draw.id);

    expect(result.snapshotHash).toBe(expected.snapshotHash);
    expect(result.merkleRoot).toBe(expected.merkleRoot);
  });

  it('is idempotent for a repeated finalization request', async () => {
    const scenario = await createBuiltSnapshot();

    const first = await finalizer.finalize(scenario.draw.id);
    const second = await finalizer.finalize(scenario.draw.id);

    expect(second).toEqual({
      snapshotId: first.snapshotId,
      drawId: first.drawId,
      ticketCount: first.ticketCount,
      hashAlgorithm: first.hashAlgorithm,
      snapshotHash: first.snapshotHash,
      merkleRoot: first.merkleRoot,
      finalizedAt: first.finalizedAt,
      alreadyFinalized: true,
    });
  });

  it('rejects a snapshot with an inconsistent entry count', async () => {
    const scenario = await createBuiltSnapshot();

    await fixturePrisma.ticketSnapshot.update({
      where: { id: scenario.built.snapshotId },
      data: { ticketCount: 4n },
    });

    await expect(
      finalizer.finalize(scenario.draw.id),
    ).rejects.toThrow(
      'Snapshot entry count does not match ticket count',
    );
  });

  it('rejects a snapshot with a broken position sequence', async () => {
    const scenario = await createBuiltSnapshot();

    const secondEntry =
      await prisma.ticketSnapshotEntry.findFirstOrThrow({
        where: {
          snapshotId: scenario.built.snapshotId,
          position: 2n,
        },
      });

    await fixturePrisma.ticketSnapshotEntry.update({
      where: { id: secondEntry.id },
      data: { position: 4n },
    });

    await expect(
      finalizer.finalize(scenario.draw.id),
    ).rejects.toThrow(
      'Snapshot position sequence is invalid at 2',
    );
  });

  it('rejects finalization when the draw is in the wrong state', async () => {
    const scenario = await createBuiltSnapshot();

    await fixturePrisma.lotteryDraw.update({
      where: { id: scenario.draw.id },
      data: { status: DrawStatus.MANUAL_REVIEW },
    });

    await expect(
      finalizer.finalize(scenario.draw.id),
    ).rejects.toThrow(
      `Snapshot cannot be finalized for a draw in ${DrawStatus.MANUAL_REVIEW}`,
    );
  });

  it('rejects an unknown snapshot', async () => {
    const draw = await fixturePrisma.lotteryDraw.create({
      data: {
        publicId: `W-2026-${randomUUID()}`,
        type: DrawType.WEEKLY,
        status: DrawStatus.SNAPSHOT_BUILDING,
        sequenceNumber: Math.floor(Math.random() * 1_000_000),
        scheduledDrawAt: new Date(Date.now() + 86_400_000),
        currency: 'USD',
        ticketPriceMinor: 100n,
      },
    });

    await expect(
      finalizer.finalize(draw.id),
    ).rejects.toThrow('Ticket snapshot not found');
  });
});
