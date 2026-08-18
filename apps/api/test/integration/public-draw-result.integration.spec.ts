import { ConfigService } from '@nestjs/config';
import {
  DrawStatus,
  DrawType,
  PrismaClient,
  PurchaseStatus,
  RandomnessStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PublicDrawResultService } from '../../src/lottery-draws/public-draw-result.service';
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
  'integration-public-result-owner-secret-at-least-32-bytes';

describe('Public draw result integration', () => {
  let prisma: PrismaService;
  let fixturePrisma: PrismaClient;
  let drawPrisma: DrawPrismaService;
  let builder: SnapshotBuilderService;
  let finalizer: SnapshotFinalizerService;
  let publicResult: PublicDrawResultService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    fixturePrisma = await createTestAdminPrisma();
    drawPrisma = await createTestDrawPrisma();

    builder =
      new SnapshotBuilderService(
        drawPrisma,
        new ConfigService({
          SNAPSHOT_OWNER_SECRET:
            OWNER_SECRET,
        }),
      );

    finalizer =
      new SnapshotFinalizerService(
        drawPrisma,
        new SnapshotCryptographyService(),
      );

    publicResult =
      new PublicDrawResultService(
        prisma,
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

  async function createScenario(
    publish = true,
  ) {
    const user =
      await fixturePrisma.user.create({
        data: {
          email:
            `${randomUUID()}@example.com`,
          passwordHash: 'hash',
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
      });

    const draw =
      await fixturePrisma.lotteryDraw.create({
        data: {
          publicId:
            `W-2026-${randomUUID()}`,
          type: DrawType.WEEKLY,
          status:
            DrawStatus.SALES_OPEN,
          sequenceNumber:
            Math.floor(
              Math.random() *
                1_000_000,
            ),
          scheduledDrawAt:
            new Date(
              Date.now() +
                86_400_000,
            ),
          currency: 'USD',
          ticketPriceMinor: 100n,
          winnerCount: 3,
        },
      });

    const purchase =
      await fixturePrisma.purchase.create({
        data: {
          publicId:
            `PUR-${randomUUID()}`,
          userId: user.id,
          drawId: draw.id,
          status:
            PurchaseStatus.COMPLETED,
          requestedTicketCount: 3,
          ticketPriceMinor: 100n,
          totalAmountMinor: 300n,
          currency: 'USD',
          idempotencyKey:
            randomUUID(),
          paymentConfirmedAt:
            new Date(),
          completedAt:
            new Date(),
        },
      });

    for (
      let index = 1;
      index <= 3;
      index += 1
    ) {
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
          publicId:
            `TKT-${index}-${randomUUID()}`,
          userId: user.id,
          purchaseId:
            purchase.id,
          drawId: draw.id,
          numberInDraw:
            BigInt(index),
        },
      });
    }

    await fixturePrisma.lotteryDraw.update({
      where: {
        id: draw.id,
      },
      data: {
        status:
          DrawStatus.SALES_CLOSED,
      },
    });

    await builder.build(draw.id);

    const finalized =
      await finalizer.finalize(
        draw.id,
      );

    const snapshot =
      await prisma.ticketSnapshot.findUniqueOrThrow({
        where: {
          drawId: draw.id,
        },
        include: {
          entries: {
            orderBy: {
              position: 'asc',
            },
          },
        },
      });

    const randomness =
      await fixturePrisma.randomnessEvidence.create({
        data: {
          drawId: draw.id,
          attemptNumber: 1,
          provider:
            'RANDOM_ORG',
          status:
            RandomnessStatus.VERIFIED,
          idempotencyKey:
            `random-${randomUUID()}`,
          requestedMin: 1n,
          requestedMax: 3n,
          requestedCount: 3,
          requestPayload: {
            min: 1,
            max: 3,
            count: 3,
          },
          responsePayload: {
            positions: [
              3,
              1,
              2,
            ],
          },
          responseHash:
            'a'.repeat(64),
          providerSignature:
            'integration-provider-signature',
          signatureVerified: true,
          randomPositions: [
            3,
            1,
            2,
          ],
          requestedAt:
            new Date(
              Date.now() -
                2_000,
            ),
          receivedAt:
            new Date(
              Date.now() -
                1_000,
            ),
          verifiedAt:
            new Date(),
        },
      });

    const positions = [
      3n,
      1n,
      2n,
    ];

    // SEC005_FIXTURE_WINNER_PENDING
    await fixturePrisma.lotteryDraw.update({
      where: {
        id: draw.id,
      },
      data: {
        status:
          DrawStatus
            .WINNER_SELECTION_PENDING,
      },
    });
    for (
      let index = 0;
      index < positions.length;
      index += 1
    ) {
      const position =
        positions[index];

      const entry =
        snapshot.entries.find(
          (candidate) =>
            candidate.position ===
            position,
        );

      if (!entry) {
        throw new Error(
          `Snapshot position ${position.toString()} not found`,
        );
      }

      await fixturePrisma.drawWinner.create({
        data: {
          drawId: draw.id,
          ticketId:
            entry.ticketId,
          snapshotEntryId:
            entry.id,
          rank: index + 1,
          randomPosition:
            position,
        },
      });
    }

    const completedAt =
      new Date(
        Date.now() + 1_000,
      );

    const publishedAt =
      new Date(
        completedAt.getTime() +
          1_000,
      );

    await fixturePrisma.lotteryDraw.update({
      where: {
        id: draw.id,
      },
      data: publish
        ? {
            status:
              DrawStatus.PUBLISHED,
            completedAt,
            publishedAt,
          }
        : {
            status:
              DrawStatus.COMPLETED,
            completedAt,
            publishedAt: null,
          },
    });

    return {
      user,
      draw,
      purchase,
      snapshot,
      randomness,
      finalized,
      completedAt,
      publishedAt,
    };
  }

  it('returns the complete published draw result', async () => {
    const scenario =
      await createScenario();

    const result =
      await publicResult.findPublishedByDrawId(
        scenario.draw.id,
      );

    expect(result.resultVersion).toBe(
      'AMAZING_CHANCE_PUBLIC_DRAW_RESULT_V1',
    );

    expect(result.draw).toEqual({
      id: scenario.draw.id,
      publicId:
        scenario.draw.publicId,
      type: DrawType.WEEKLY,
      status:
        DrawStatus.PUBLISHED,
      scheduledDrawAt:
        scenario.draw.scheduledDrawAt,
      completedAt:
        scenario.completedAt,
      publishedAt:
        scenario.publishedAt,
      winnerCount: 3,
    });

    expect(result.snapshot).toEqual({
      ticketCount: '3',
      snapshotHash:
        scenario.finalized
          .snapshotHash,
      merkleRoot:
        scenario.finalized
          .merkleRoot,
      hashAlgorithm:
        'SHA-256',
      canonicalFormat:
        'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
      finalizedAt:
        expect.any(Date),
    });

    expect(
      result.randomness,
    ).toMatchObject({
      evidenceId:
        scenario.randomness.id,
      provider:
        'RANDOM_ORG',
      status:
        RandomnessStatus.VERIFIED,
      attemptNumber: 1,
      requestedMin: '1',
      requestedMax: '3',
      requestedCount: 3,
      responseHash:
        'a'.repeat(64),
      providerSignature:
        'integration-provider-signature',
      signatureVerified:
        true,
      randomPositions: [
        3,
        1,
        2,
      ],
    });

    expect(
      result.winnerSelection
        .algorithm,
    ).toBe(
      'FIRST_UNIQUE_VERIFIED_RANDOM_POSITIONS_IN_PROVIDER_ORDER_V1',
    );

    expect(
      result.winnerSelection.winners.map(
        (winner) => ({
          rank:
            winner.rank,
          randomPosition:
            winner.randomPosition,
        }),
      ),
    ).toEqual([
      {
        rank: 1,
        randomPosition: '3',
      },
      {
        rank: 2,
        randomPosition: '1',
      },
      {
        rank: 3,
        randomPosition: '2',
      },
    ]);
  });

  it('does not expose a completed but unpublished draw', async () => {
    const scenario =
      await createScenario(false);

    await expect(
      publicResult.findPublishedByDrawId(
        scenario.draw.id,
      ),
    ).rejects.toThrow(
      'Published lottery draw result not found',
    );
  });

  it('does not expose internal user, ticket, purchase, or provider request fields', async () => {
    const scenario =
      await createScenario();

    const result =
      await publicResult.findPublishedByDrawId(
        scenario.draw.id,
      );

    const serialized =
      JSON.stringify(result);

    expect(serialized).not.toContain(
      scenario.user.id,
    );

    expect(serialized).not.toContain(
      scenario.purchase.id,
    );

    expect(serialized).not.toContain(
      scenario.user.email,
    );

    expect(result.randomness).not.toHaveProperty(
      'requestPayload',
    );

    expect(result.randomness).not.toHaveProperty(
      'responsePayload',
    );

    expect(
      result.winnerSelection.winners[0],
    ).not.toHaveProperty(
      'ticketId',
    );

    expect(
      result.winnerSelection.winners[0],
    ).not.toHaveProperty(
      'userId',
    );
  });

  it('returns verification endpoints for independent checking', async () => {
    const scenario =
      await createScenario();

    const result =
      await publicResult.findPublishedByDrawId(
        scenario.draw.id,
      );

    expect(
      result.verification,
    ).toEqual({
      auditManifest:
        `/lottery-draws/${scenario.draw.id}/audit`,
      snapshotMetadata:
        `/lottery-draws/${scenario.draw.id}/snapshot`,
      snapshotDownload:
        `/lottery-draws/${scenario.draw.id}/snapshot/download`,
      ticketProofTemplate:
        `/lottery-draws/${scenario.draw.id}/tickets/{ticketPublicId}/proof`,
      proofVerification:
        `/lottery-draws/${scenario.draw.id}/verify-proof`,
      randomnessEvidence:
        `/lottery-draws/${scenario.draw.id}/randomness`,
      winnerSelectionVerification:
        `/lottery-draws/${scenario.draw.id}/winner-selection`,
    });
  });

  it('prevents downgrading verified randomness for a published draw', async () => {
    const scenario =
      await createScenario();

    await expect(
      fixturePrisma.randomnessEvidence.update({
        where: {
          id:
            scenario.randomness.id,
        },
        data: {
          status:
            RandomnessStatus.RECEIVED,
        },
      }),
    ).rejects.toThrow(
      'Terminal randomness evidence is immutable',
    );
  });
  it('prevents deleting a winner from a published draw', async () => {
    const scenario =
      await createScenario();

    await expect(
      fixturePrisma.drawWinner.delete({
        where: {
          drawId_rank: {
            drawId:
              scenario.draw.id,
            rank:
              3,
          },
        },
      }),
    ).rejects.toThrow(
      'Draw winners are immutable and cannot be deleted',
    );
  });
});
