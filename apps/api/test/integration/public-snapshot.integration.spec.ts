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
import {
  ensureTestTicketAllocation,
} from './ticket-fixture.helper';


const OWNER_SECRET =
  'integration-snapshot-owner-secret-at-least-32-bytes';

describe('Public snapshot integration', () => {
  let prisma: PrismaService;
  let cryptography: SnapshotCryptographyService;
  let builder: SnapshotBuilderService;
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

  async function createDrawWithSnapshot(
    finalizeSnapshot: boolean,
  ) {
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
        sequenceNumber: Math.floor(
          Math.random() * 1_000_000,
        ),
        scheduledDrawAt: new Date(
          Date.now() + 86_400_000,
        ),
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
        requestedTicketCount: 2,
        ticketPriceMinor: 100n,
        totalAmountMinor: 200n,
        currency: 'USD',
        idempotencyKey: randomUUID(),
        paymentConfirmedAt: new Date(),
        completedAt: new Date(),
      },
    });

    for (let index = 1; index <= 2; index += 1) {
      await ensureTestTicketAllocation(
        prisma,
        {
          purchaseId: purchase.id,
          drawId: draw.id,
          numberInDraw: BigInt(index),
        },
      );

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
      where: {
        id: draw.id,
      },
      data: {
        status: DrawStatus.SALES_CLOSED,
      },
    });

    const built = await builder.build(draw.id);

    if (finalizeSnapshot) {
      await finalizer.finalize(draw.id);
    }

    return {
      user,
      draw,
      purchase,
      built,
    };
  }

  it('returns public metadata for a finalized snapshot', async () => {
    const scenario =
      await createDrawWithSnapshot(true);

    const result =
      await publicSnapshot.findFinalizedByDrawId(
        scenario.draw.id,
      );

    expect(result).toMatchObject({
      drawId: scenario.draw.id,
      drawPublicId: scenario.draw.publicId,
      status: 'FINALIZED',
      ticketCount: '2',
      canonicalFormat:
        'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
      hashAlgorithm: 'SHA-256',
    });

    expect(result.snapshotHash).toHaveLength(64);
    expect(result.merkleRoot).toHaveLength(64);
    expect(result.builtAt).toBeInstanceOf(Date);
    expect(result.finalizedAt).toBeInstanceOf(Date);
  });

  it('does not expose internal snapshot or ownership fields', async () => {
    const scenario =
      await createDrawWithSnapshot(true);

    const result =
      await publicSnapshot.findFinalizedByDrawId(
        scenario.draw.id,
      );

    expect(result).not.toHaveProperty('snapshotId');
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('entries');
    expect(result).not.toHaveProperty(
      'ownerPublicRef',
    );
    expect(result).not.toHaveProperty('ticketId');
    expect(result).not.toHaveProperty('userId');
  });

  it('serializes ticketCount as a JSON-safe string', async () => {
    const scenario =
      await createDrawWithSnapshot(true);

    const result =
      await publicSnapshot.findFinalizedByDrawId(
        scenario.draw.id,
      );

    expect(typeof result.ticketCount).toBe(
      'string',
    );
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('returns not found for a building snapshot', async () => {
    const scenario =
      await createDrawWithSnapshot(false);

    await expect(
      publicSnapshot.findFinalizedByDrawId(
        scenario.draw.id,
      ),
    ).rejects.toThrow(
      'Finalized ticket snapshot not found',
    );
  });

  it('returns not found for an unknown draw', async () => {
    await expect(
      publicSnapshot.findFinalizedByDrawId(
        randomUUID(),
      ),
    ).rejects.toThrow(
      'Finalized ticket snapshot not found',
    );
  });
});