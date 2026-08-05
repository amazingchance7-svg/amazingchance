import { ConfigService } from '@nestjs/config';
import {
  DrawStatus,
  DrawType,
  PurchaseStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../src/prisma/prisma.service';
import { PublicAuditService } from '../../src/snapshots/public-audit.service';
import { SnapshotBuilderService } from '../../src/snapshots/snapshot-builder.service';
import { SnapshotCryptographyService } from '../../src/snapshots/snapshot-cryptography.service';
import { SnapshotFinalizerService } from '../../src/snapshots/snapshot-finalizer.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

const OWNER_SECRET =
  'integration-snapshot-owner-secret-at-least-32-bytes';

describe('Public audit integration', () => {
  let prisma: PrismaService;
  let cryptography: SnapshotCryptographyService;
  let builder: SnapshotBuilderService;
  let finalizer: SnapshotFinalizerService;
  let publicAudit: PublicAuditService;

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

    publicAudit = new PublicAuditService(prisma);
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createBuiltSnapshot(ticketCount = 3) {
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
        requestedTicketCount: ticketCount,
        ticketPriceMinor: 100n,
        totalAmountMinor: BigInt(ticketCount * 100),
        currency: 'USD',
        idempotencyKey: randomUUID(),
        paymentConfirmedAt: new Date(),
        completedAt: new Date(),
      },
    });

    for (
      let index = 1;
      index <= ticketCount;
      index += 1
    ) {
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

    return {
      user,
      draw,
      purchase,
      built,
    };
  }

  async function createFinalizedSnapshot(
    ticketCount = 3,
  ) {
    const scenario =
      await createBuiltSnapshot(ticketCount);

    const finalized = await finalizer.finalize(
      scenario.draw.id,
    );

    return {
      ...scenario,
      finalized,
    };
  }

  it('returns a complete audit manifest for a finalized snapshot', async () => {
    const scenario =
      await createFinalizedSnapshot(3);

    const result =
      await publicAudit.findManifestByDrawId(
        scenario.draw.id,
      );

    expect(result).toEqual({
      auditVersion:
        'AMAZING_CHANCE_PUBLIC_AUDIT_V1',
      draw: {
        id: scenario.draw.id,
        publicId: scenario.draw.publicId,
        status: DrawStatus.SNAPSHOT_FINALIZED,
        type: DrawType.WEEKLY,
        scheduledDrawAt:
          scenario.draw.scheduledDrawAt,
        completedAt: null,
        publishedAt: null,
      },
      snapshot: {
        status: 'FINALIZED',
        ticketCount: '3',
        canonicalFormat:
          'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
        hashAlgorithm: 'SHA-256',
        snapshotHash:
          scenario.finalized.snapshotHash,
        merkleRoot:
          scenario.finalized.merkleRoot,
        builtAt: expect.any(Date),
        finalizedAt: expect.any(Date),
      },
      endpoints: {
        snapshotMetadata:
          `/lottery-draws/${scenario.draw.id}/snapshot`,
        snapshotDownload:
          `/lottery-draws/${scenario.draw.id}/snapshot/download`,
        ticketProofTemplate:
          `/lottery-draws/${scenario.draw.id}/tickets/{ticketPublicId}/proof`,
        proofVerification:
          `/lottery-draws/${scenario.draw.id}/verify-proof`,
      },
    });
  });

  it('serializes ticketCount as a JSON-safe string', async () => {
    const scenario =
      await createFinalizedSnapshot(2);

    const result =
      await publicAudit.findManifestByDrawId(
        scenario.draw.id,
      );

    expect(typeof result.snapshot.ticketCount).toBe(
      'string',
    );
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  it('reflects completed and published draw timestamps', async () => {
    const scenario =
      await createFinalizedSnapshot(1);

    const completedAt = new Date();
    const publishedAt = new Date(
      completedAt.getTime() + 1_000,
    );

    await prisma.lotteryDraw.update({
      where: {
        id: scenario.draw.id,
      },
      data: {
        status: DrawStatus.PUBLISHED,
        completedAt,
        publishedAt,
      },
    });

    const result =
      await publicAudit.findManifestByDrawId(
        scenario.draw.id,
      );

    expect(result.draw.status).toBe(
      DrawStatus.PUBLISHED,
    );
    expect(result.draw.completedAt).toEqual(
      completedAt,
    );
    expect(result.draw.publishedAt).toEqual(
      publishedAt,
    );
  });

  it('does not expose internal snapshot, ticket, user, or owner fields', async () => {
    const scenario =
      await createFinalizedSnapshot(2);

    const result =
      await publicAudit.findManifestByDrawId(
        scenario.draw.id,
      );

    expect(result).not.toHaveProperty('snapshotId');
    expect(result).not.toHaveProperty('ticketId');
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty(
      'ownerPublicRef',
    );
    expect(result.snapshot).not.toHaveProperty('id');
    expect(result.snapshot).not.toHaveProperty(
      'entries',
    );
  });

  it('returns not found for a non-finalized snapshot', async () => {
    const scenario = await createBuiltSnapshot(2);

    await expect(
      publicAudit.findManifestByDrawId(
        scenario.draw.id,
      ),
    ).rejects.toThrow(
      'Finalized ticket snapshot not found',
    );
  });

  it('returns not found for an unknown draw', async () => {
    await expect(
      publicAudit.findManifestByDrawId(
        randomUUID(),
      ),
    ).rejects.toThrow(
      'Finalized ticket snapshot not found',
    );
  });
});
