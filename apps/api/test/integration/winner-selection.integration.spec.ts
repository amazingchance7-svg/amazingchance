import { ConfigService } from '@nestjs/config';
import {
  DrawStatus,
  DrawType,
  Prisma,
  PurchaseStatus,
  RandomnessStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../src/prisma/prisma.service';
import { SnapshotBuilderService } from '../../src/snapshots/snapshot-builder.service';
import { SnapshotCryptographyService } from '../../src/snapshots/snapshot-cryptography.service';
import { SnapshotFinalizerService } from '../../src/snapshots/snapshot-finalizer.service';
import { WinnerSelectionService } from '../../src/winners/winner-selection.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';
import {
  ensureTestTicketAllocation,
} from './ticket-fixture.helper';


const OWNER_SECRET =
  'integration-winner-selection-owner-secret-at-least-32-bytes';

describe('Winner selection integration', () => {
  let prisma: PrismaService;
  let builder: SnapshotBuilderService;
  let finalizer: SnapshotFinalizerService;
  let winnerSelection: WinnerSelectionService;

  beforeAll(async () => {
    prisma = await createTestPrisma();

    const cryptography =
      new SnapshotCryptographyService();

    builder = new SnapshotBuilderService(
      prisma,
      new ConfigService({
        SNAPSHOT_OWNER_SECRET:
          OWNER_SECRET,
      }),
    );

    finalizer =
      new SnapshotFinalizerService(
        prisma,
        cryptography,
      );

    winnerSelection =
      new WinnerSelectionService(prisma);
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createScenario(
    randomPositions: Prisma.InputJsonValue = [
      4,
      1,
      3,
    ],
    options?: {
      randomnessStatus?: RandomnessStatus;
      requestedCount?: number;
      requestedMax?: bigint;
      signatureVerified?: boolean;
    },
  ) {
    const user =
      await prisma.user.create({
        data: {
          email:
            `${randomUUID()}@example.com`,
          passwordHash: 'hash',
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
      });

    const draw =
      await prisma.lotteryDraw.create({
        data: {
          publicId:
            `W-2026-${randomUUID()}`,
          type: DrawType.WEEKLY,
          status: DrawStatus.SALES_OPEN,
          sequenceNumber:
            Math.floor(
              Math.random() *
                1_000_000,
            ),
          scheduledDrawAt: new Date(
            Date.now() + 86_400_000,
          ),
          currency: 'USD',
          ticketPriceMinor: 100n,
          winnerCount: 3,
        },
      });

    const purchase =
      await prisma.purchase.create({
        data: {
          publicId:
            `PUR-${randomUUID()}`,
          userId: user.id,
          drawId: draw.id,
          status:
            PurchaseStatus.COMPLETED,
          requestedTicketCount: 5,
          ticketPriceMinor: 100n,
          totalAmountMinor: 500n,
          currency: 'USD',
          idempotencyKey:
            randomUUID(),
          paymentConfirmedAt:
            new Date(),
          completedAt: new Date(),
        },
      });

    const tickets = [];

    for (
      let index = 1;
      index <= 5;
      index += 1
    ) {
      const ticket =
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
            publicId:
              `TKT-${index}-${randomUUID()}`,
            userId: user.id,
            purchaseId: purchase.id,
            drawId: draw.id,
            numberInDraw:
              BigInt(index),
          },
        });

      tickets.push(ticket);
    }

    await prisma.lotteryDraw.update({
      where: {
        id: draw.id,
      },
      data: {
        status:
          DrawStatus.SALES_CLOSED,
      },
    });

    const built =
      await builder.build(draw.id);

    const finalized =
      await finalizer.finalize(draw.id);

    const randomness =
      await prisma.randomnessEvidence.create({
        data: {
          drawId: draw.id,
          attemptNumber: 1,
          provider: 'RANDOM_ORG',
          status:
            options?.randomnessStatus ??
            RandomnessStatus.VERIFIED,
          idempotencyKey:
            `randomness-${randomUUID()}`,
          requestedMin: 1n,
          requestedMax:
            options?.requestedMax ??
            5n,
          requestedCount:
            options?.requestedCount ??
            3,
          requestPayload: {
            min: 1,
            max:
              Number(
                options?.requestedMax ??
                  5n,
              ),
            count:
              options?.requestedCount ??
              3,
          },
          responsePayload: {
            positions:
              randomPositions,
          },
          responseHash:
            'a'.repeat(64),
          providerSignature:
            'integration-provider-signature',
          signatureVerified:
            options?.signatureVerified ??
            true,
          randomPositions,
          requestedAt: new Date(
            Date.now() - 2_000,
          ),
          receivedAt: new Date(
            Date.now() - 1_000,
          ),
          verifiedAt: new Date(),
        },
      });

    await prisma.lotteryDraw.update({
      where: {
        id: draw.id,
      },
      data: {
        status:
          DrawStatus
            .RANDOMNESS_VERIFIED,
      },
    });

    return {
      user,
      draw,
      purchase,
      tickets,
      built,
      finalized,
      randomness,
    };
  }

  it('creates ranked winners from verified random positions and completes the draw', async () => {
    const scenario =
      await createScenario([
        4,
        1,
        3,
      ]);

    const result =
      await winnerSelection.finalize(
        scenario.draw.id,
      );

    expect(result).toMatchObject({
      drawId: scenario.draw.id,
      drawPublicId:
        scenario.draw.publicId,
      status: 'COMPLETED',
      randomnessEvidenceId:
        scenario.randomness.id,
      snapshotId:
        scenario.built.snapshotId,
      snapshotHash:
        scenario.finalized
          .snapshotHash,
      merkleRoot:
        scenario.finalized
          .merkleRoot,
      alreadyCompleted: false,
    });

    expect(result.completedAt).toBeInstanceOf(
      Date,
    );

    expect(
      result.winners.map(
        (winner) => ({
          rank: winner.rank,
          randomPosition:
            winner.randomPosition,
        }),
      ),
    ).toEqual([
      {
        rank: 1,
        randomPosition: '4',
      },
      {
        rank: 2,
        randomPosition: '1',
      },
      {
        rank: 3,
        randomPosition: '3',
      },
    ]);

    const persistedWinners =
      await prisma.drawWinner.findMany({
        where: {
          drawId: scenario.draw.id,
        },
        orderBy: {
          rank: 'asc',
        },
        include: {
          snapshotEntry: true,
        },
      });

    expect(
      persistedWinners,
    ).toHaveLength(3);

    expect(
      persistedWinners.map(
        (winner) =>
          winner.randomPosition,
      ),
    ).toEqual([
      4n,
      1n,
      3n,
    ]);

    expect(
      persistedWinners.map(
        (winner) =>
          winner.snapshotEntry
            .position,
      ),
    ).toEqual([
      4n,
      1n,
      3n,
    ]);

    const completedDraw =
      await prisma.lotteryDraw.findUniqueOrThrow({
        where: {
          id: scenario.draw.id,
        },
      });

    expect(completedDraw.status).toBe(
      DrawStatus.COMPLETED,
    );

    expect(
      completedDraw.completedAt,
    ).toEqual(result.completedAt);
  });

  it('returns the existing winners for a repeated finalization request', async () => {
    const scenario =
      await createScenario([
        2,
        5,
        1,
      ]);

    const first =
      await winnerSelection.finalize(
        scenario.draw.id,
      );

    const second =
      await winnerSelection.finalize(
        scenario.draw.id,
      );

    expect(second).toEqual({
      ...first,
      alreadyCompleted: true,
    });

    expect(
      await prisma.drawWinner.count({
        where: {
          drawId: scenario.draw.id,
        },
      }),
    ).toBe(3);
  });

  it('skips duplicate provider positions deterministically', async () => {
    const scenario =
      await createScenario(
        [
          2,
          2,
          5,
          2,
          1,
        ],
        {
          requestedCount: 5,
        },
      );

    const result =
      await winnerSelection.finalize(
        scenario.draw.id,
      );

    expect(
      result.winners.map(
        (winner) =>
          winner.randomPosition,
      ),
    ).toEqual([
      '2',
      '5',
      '1',
    ]);
  });
  it('rejects winner selection without verified randomness evidence', async () => {
    const scenario =
      await createScenario(
        undefined,
        {
          randomnessStatus:
            RandomnessStatus.RECEIVED,
          signatureVerified:
            false,
        },
      );

    await expect(
      winnerSelection.finalize(
        scenario.draw.id,
      ),
    ).rejects.toThrow(
      'Verified randomness evidence was not found',
    );

    expect(
      await prisma.drawWinner.count(),
    ).toBe(0);

    expect(
      (
        await prisma.lotteryDraw.findUniqueOrThrow({
          where: {
            id:
              scenario.draw.id,
          },
        })
      ).status,
    ).toBe(
      DrawStatus.RANDOMNESS_VERIFIED,
    );
  });
  it('rejects randomness whose range does not match the finalized snapshot', async () => {
    const scenario =
      await createScenario(
        undefined,
        {
          requestedMax: 6n,
        },
      );

    await expect(
      winnerSelection.finalize(
        scenario.draw.id,
      ),
    ).rejects.toThrow(
      'Randomness request range does not match the finalized snapshot',
    );

    expect(
      await prisma.drawWinner.count(),
    ).toBe(0);
  });
  it('rejects winner selection for a draw in the wrong state', async () => {
    const scenario =
      await createScenario();

    await prisma.lotteryDraw.update({
      where: {
        id: scenario.draw.id,
      },
      data: {
        status:
          DrawStatus.MANUAL_REVIEW,
      },
    });

    await expect(
      winnerSelection.finalize(
        scenario.draw.id,
      ),
    ).rejects.toThrow(
      `Winner selection cannot run for a draw in ${DrawStatus.MANUAL_REVIEW}`,
    );

    expect(
      await prisma.drawWinner.count(),
    ).toBe(0);
  });
});
