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

import {
  DrawPrismaService,
  PrismaService,
} from '../../src/prisma/prisma.service';
import { SnapshotBuilderService } from '../../src/snapshots/snapshot-builder.service';
import { SnapshotCryptographyService } from '../../src/snapshots/snapshot-cryptography.service';
import { SnapshotFinalizerService } from '../../src/snapshots/snapshot-finalizer.service';
import { PublicWinnerSelectionVerificationService } from '../../src/winners/public-winner-selection-verification.service';
import { WINNER_SELECTION_ALGORITHM } from '../../src/winners/winner-selection.util';
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
  'integration-public-winner-selection-owner-secret-at-least-32-bytes';

describe('Public winner selection verification integration', () => {
  let prisma: PrismaService;
  let fixturePrisma: PrismaClient;
  let drawPrisma: DrawPrismaService;
  let builder: SnapshotBuilderService;
  let finalizer: SnapshotFinalizerService;
  let service: PublicWinnerSelectionVerificationService;

  beforeAll(async () => {
    prisma =
      await createTestPrisma();
    fixturePrisma =
      await createTestAdminPrisma();
    drawPrisma =
      await createTestDrawPrisma();

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

    service =
      new PublicWinnerSelectionVerificationService(
        prisma,
      );
  });

  beforeEach(async () => {
    await cleanTestDatabase(
      prisma,
    );
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
          passwordHash:
            'hash',
          status:
            UserStatus.ACTIVE,
          emailVerifiedAt:
            new Date(),
        },
      });

    const draw =
      await fixturePrisma.lotteryDraw.create({
        data: {
          publicId:
            `W-2026-${randomUUID()}`,
          type:
            DrawType.WEEKLY,
          status:
            DrawStatus.SALES_OPEN,
          sequenceNumber:
            Math.floor(
              Math.random() *
                1_000_000_000,
            ),
          scheduledDrawAt:
            new Date(
              Date.now() +
                86_400_000,
            ),
          currency:
            'USD',
          ticketPriceMinor:
            100n,
          winnerCount:
            3,
        },
      });

    const purchase =
      await fixturePrisma.purchase.create({
        data: {
          publicId:
            `PUR-${randomUUID()}`,
          userId:
            user.id,
          drawId:
            draw.id,
          status:
            PurchaseStatus.COMPLETED,
          requestedTicketCount:
            4,
          ticketPriceMinor:
            100n,
          totalAmountMinor:
            400n,
          currency:
            'USD',
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
      index <= 4;
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
          userId:
            user.id,
          purchaseId:
            purchase.id,
          drawId:
            draw.id,
          numberInDraw:
            BigInt(index),
        },
      });
    }

    await fixturePrisma.lotteryDraw.update({
      where: {
        id:
          draw.id,
      },
      data: {
        status:
          DrawStatus.SALES_CLOSED,
      },
    });

    await builder.build(
      draw.id,
    );

    const finalized =
      await finalizer.finalize(
        draw.id,
      );

    const snapshot =
      await prisma.ticketSnapshot.findUniqueOrThrow({
        where: {
          drawId:
            draw.id,
        },
        include: {
          entries: {
            orderBy: {
              position:
                'asc',
            },
          },
        },
      });

    const positions = [
      4,
      1,
      2,
    ];

    const randomness =
      await fixturePrisma.randomnessEvidence.create({
        data: {
          drawId:
            draw.id,
          attemptNumber:
            1,
          provider:
            'RANDOM_ORG',
          status:
            RandomnessStatus.VERIFIED,
          idempotencyKey:
            `random-${randomUUID()}`,
          requestedMin:
            1n,
          requestedMax:
            4n,
          requestedCount:
            3,
          requestPayload: {
            method:
              'generateSignedIntegers',
            n: 3,
            min: 1,
            max: 4,
            replacement:
              false,
          },
          responsePayload: {
            random: {
              data:
                positions,
            },
            signature:
              'integration-signature',
          },
          responseHash:
            'a'.repeat(64),
          providerSignature:
            'integration-signature',
          signatureVerified:
            true,
          randomPositions:
            positions,
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
      index <
      positions.length;
      index += 1
    ) {
      const position =
        BigInt(
          positions[index],
        );

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
          drawId:
            draw.id,
          ticketId:
            entry.ticketId,
          snapshotEntryId:
            entry.id,
          rank:
            index + 1,
          randomPosition:
            position,
        },
      });
    }

    const completedAt =
      new Date(
        Date.now() +
          1_000,
      );

    const publishedAt =
      new Date(
        completedAt.getTime() +
          1_000,
      );

    await fixturePrisma.lotteryDraw.update({
      where: {
        id:
          draw.id,
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
            publishedAt:
              null,
          },
    });

    return {
      draw,
      snapshot,
      randomness,
      positions,
      finalized,
    };
  }

  it('recomputes the published winner selection from verified randomness and finalized snapshot entries', async () => {
    const scenario =
      await createScenario();

    const result =
      await service.findVerification(
        scenario.draw.id,
      );

    expect(
      result.version,
    ).toBe(
      'AMAZING_CHANCE_PUBLIC_WINNER_SELECTION_V1',
    );

    expect(
      result.algorithm.id,
    ).toBe(
      WINNER_SELECTION_ALGORITHM,
    );

    expect(
      result.snapshot,
    ).toMatchObject({
      id:
        scenario.snapshot.id,
      ticketCount:
        '4',
      snapshotHash:
        scenario.finalized.snapshotHash,
      merkleRoot:
        scenario.finalized.merkleRoot,
    });

    expect(
      result.randomness,
    ).toMatchObject({
      evidenceId:
        scenario.randomness.id,
      requestedMin:
        '1',
      requestedMax:
        '4',
      requestedCount:
        3,
      suppliedPositions: [
        '4',
        '1',
        '2',
      ],
    });

    expect(
      result.recomputedSelection.selectedPositions,
    ).toEqual([
      '4',
      '1',
      '2',
    ]);

    expect(
      result.recomputedSelection.winners,
    ).toEqual(
      result.publishedWinners,
    );

    expect(
      result.integrity,
    ).toEqual({
      randomnessRangeMatchesSnapshot:
        true,
      randomnessCountIsSufficient:
        true,
      selectedSnapshotEntriesComplete:
        true,
      publishedWinnerCountMatches:
        true,
      publishedPositionsMatch:
        true,
      publishedTicketsMatch:
        true,
      locallyConsistent:
        true,
    });
  });

  it('prevents tampering with a published winner position', async () => {
    const scenario =
      await createScenario();

    await expect(
      fixturePrisma.drawWinner.update({
        where: {
          drawId_rank: {
            drawId:
              scenario.draw.id,
            rank:
              1,
          },
        },
        data: {
          randomPosition:
            3n,
        },
      }),
    ).rejects.toThrow(
      'Draw winners are immutable and cannot be modified',
    );
  });
  it('prevents tampering with a published winner ticket', async () => {
    const scenario =
      await createScenario();

    const unusedEntry =
      scenario.snapshot.entries.find(
        (entry) =>
          entry.position === 3n,
      );

    if (!unusedEntry) {
      throw new Error(
        'Expected unused snapshot entry was not found',
      );
    }

    await expect(
      fixturePrisma.drawWinner.update({
        where: {
          drawId_rank: {
            drawId:
              scenario.draw.id,
            rank:
              1,
          },
        },
        data: {
          ticketId:
            unusedEntry.ticketId,
          snapshotEntryId:
            unusedEntry.id,
          randomPosition:
            unusedEntry.position,
        },
      }),
    ).rejects.toThrow(
      'Draw winners are immutable and cannot be modified',
    );
  });
  it('prevents deleting a published winner', async () => {
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
  it('prevents changing the verified randomness range after commitment', async () => {
    const scenario =
      await createScenario();

    await expect(
      drawPrisma.randomnessEvidence.update({
        where: {
          id:
            scenario.randomness.id,
        },
        data: {
          requestedMax:
            999n,
        },
      }),
    ).rejects.toThrow(
      'Committed randomness request fields are immutable',
    );
  });
  it('does not expose winner selection verification before publication', async () => {
    const scenario =
      await createScenario(false);

    await expect(
      service.findVerification(
        scenario.draw.id,
      ),
    ).rejects.toThrow(
      'Published lottery draw not found',
    );
  });
});
