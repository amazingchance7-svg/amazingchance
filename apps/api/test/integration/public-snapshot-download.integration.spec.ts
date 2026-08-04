import { ConfigService } from '@nestjs/config';
import {
  DrawStatus,
  DrawType,
  PurchaseStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../src/prisma/prisma.service';
import { PublicSnapshotService } from '../../src/snapshots/public-snapshot.service';
import { SnapshotBuilderService } from '../../src/snapshots/snapshot-builder.service';
import { SnapshotCryptographyService } from '../../src/snapshots/snapshot-cryptography.service';
import { SnapshotFinalizerService } from '../../src/snapshots/snapshot-finalizer.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

const OWNER_SECRET =
  'integration-snapshot-owner-secret-at-least-32-bytes';

describe('Public snapshot download integration', () => {
  let prisma: PrismaService;
  let builder: SnapshotBuilderService;
  let cryptography: SnapshotCryptographyService;
  let finalizer: SnapshotFinalizerService;
  let publicSnapshot: PublicSnapshotService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    cryptography = new SnapshotCryptographyService();

    builder = new SnapshotBuilderService(
      prisma,
      new ConfigService({
        SNAPSHOT_OWNER_SECRET: OWNER_SECRET,
      }),
    );

    finalizer = new SnapshotFinalizerService(
      prisma,
      cryptography,
    );

    publicSnapshot = new PublicSnapshotService(
      prisma,
      cryptography,
    );
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createBuiltSnapshot() {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const draw = await prisma.lotteryDraw.create({
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

    const purchase = await prisma.purchase.create({
      data: {
        publicId: `PUR-${randomUUID()}`,
        userId: user.id,
        drawId: draw.id,
        status: PurchaseStatus.COMPLETED,
        requestedTicketCount: 3,
        ticketPriceMinor: 100n,
        totalAmountMinor: 300n,
        currency: 'USD',
        idempotencyKey: randomUUID(),
        paymentConfirmedAt: new Date(),
        completedAt: new Date(),
      },
    });

    for (let index = 1; index <= 3; index += 1) {
      await prisma.ticket.create({
        data: {
          publicId: `TKT-${randomUUID()}`,
          userId: user.id,
          purchaseId: purchase.id,
          drawId: draw.id,
          numberInDraw: BigInt(index),
        },
      });
    }

    await prisma.lotteryDraw.update({
      where: { id: draw.id },
      data: { status: DrawStatus.SALES_CLOSED },
    });

    const built = await builder.build(draw.id);

    return {
      user,
      draw,
      purchase,
      built,
    };
  }

  async function createFinalizedSnapshot() {
    const scenario = await createBuiltSnapshot();
    const finalized = await finalizer.finalize(
      scenario.draw.id,
    );

    return {
      ...scenario,
      finalized,
    };
  }

  it('returns the exact canonical snapshot text', async () => {
    const scenario = await createFinalizedSnapshot();

    const snapshot =
      await prisma.ticketSnapshot.findUniqueOrThrow({
        where: {
          id: scenario.built.snapshotId,
        },
        include: {
          entries: {
            orderBy: [
              {
                position: 'asc',
              },
              {
                id: 'asc',
              },
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

    const download =
      await publicSnapshot.downloadFinalizedByDrawId(
        scenario.draw.id,
      );

    expect(download.canonicalSnapshot).toBe(
      expected.canonicalSnapshot,
    );
  });

  it('returns the stored SHA-256 snapshot hash', async () => {
    const scenario = await createFinalizedSnapshot();

    const download =
      await publicSnapshot.downloadFinalizedByDrawId(
        scenario.draw.id,
      );

    expect(download.snapshotHash).toBe(
      scenario.finalized.snapshotHash,
    );
    expect(download.snapshotHash).toHaveLength(64);
  });

  it('returns a safe filename and plain text content type', async () => {
    const scenario = await createFinalizedSnapshot();

    const download =
      await publicSnapshot.downloadFinalizedByDrawId(
        scenario.draw.id,
      );

    expect(download.filename).toBe(
      `${scenario.draw.publicId}-snapshot.txt`,
    );
    expect(download.contentType).toBe(
      'text/plain; charset=utf-8',
    );
  });

  it('returns not found for a non-finalized snapshot', async () => {
    const scenario = await createBuiltSnapshot();

    await expect(
      publicSnapshot.downloadFinalizedByDrawId(
        scenario.draw.id,
      ),
    ).rejects.toThrow(
      'Finalized ticket snapshot not found',
    );
  });

  it('rejects a finalized snapshot with a corrupted commitment', async () => {
    const scenario = await createBuiltSnapshot();

    await prisma.$executeRaw`
      UPDATE "ticket_snapshots"
      SET
        "status" = 'FINALIZED'::"SnapshotStatus",
        "snapshotHash" = ${'a'.repeat(64)},
        "merkleRoot" = ${'b'.repeat(64)},
        "finalizedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${scenario.built.snapshotId}::uuid
    `;

    await expect(
      publicSnapshot.downloadFinalizedByDrawId(
        scenario.draw.id,
      ),
    ).rejects.toThrow(
      'Stored snapshot hash does not match canonical snapshot',
    );
  });
});
