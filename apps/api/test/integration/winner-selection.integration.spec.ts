import { ConfigService } from '@nestjs/config';
import {
  DrawStatus,
  DrawType,
  Prisma,
  PrismaClient,
  PurchaseStatus,
  RandomnessStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import {
  LedgerAccountCode,
  LedgerSide,
  LedgerTransactionType,
} from '@prisma/client';
import { LedgerService } from '../../src/ledger/ledger.service';
import { PrizeDistributionService } from '../../src/prizes/prize-distribution.service';
import { PrizePoolService } from '../../src/prizes/prize-pool.service';
import {
  DrawPrismaService,
  PaymentPrismaService,
  PrismaService,
} from '../../src/prisma/prisma.service';
import { SnapshotBuilderService } from '../../src/snapshots/snapshot-builder.service';
import { SnapshotCryptographyService } from '../../src/snapshots/snapshot-cryptography.service';
import { SnapshotFinalizerService } from '../../src/snapshots/snapshot-finalizer.service';
import { WinnerSelectionService } from '../../src/winners/winner-selection.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';
import {
  createTestAdminPrisma,
  createTestDrawPrisma,
  createTestPaymentPrisma,
} from './database-role.helper';
import {
  ensureTestTicketAllocation,
} from './ticket-fixture.helper';


const OWNER_SECRET =
  'integration-winner-selection-owner-secret-at-least-32-bytes';

describe('Winner selection integration', () => {
  let prisma: PrismaService;
  let fixturePrisma: PrismaClient;
  let drawPrisma: DrawPrismaService;
  let paymentPrisma: PaymentPrismaService;
  let builder: SnapshotBuilderService;
  let finalizer: SnapshotFinalizerService;
  let winnerSelection: WinnerSelectionService;
  let ledger: LedgerService;
  let fixtureLedger: LedgerService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    fixturePrisma =
      await createTestAdminPrisma();
    drawPrisma =
      await createTestDrawPrisma();
    paymentPrisma =
      await createTestPaymentPrisma();

    const cryptography =
      new SnapshotCryptographyService();

    builder = new SnapshotBuilderService(
      drawPrisma,
      new ConfigService({
        SNAPSHOT_OWNER_SECRET:
          OWNER_SECRET,
      }),
    );

    finalizer =
      new SnapshotFinalizerService(
        drawPrisma,
        cryptography,
      );

    ledger =
      new LedgerService(drawPrisma);

    fixtureLedger =
      new LedgerService(paymentPrisma);

    winnerSelection =
      new WinnerSelectionService(
        drawPrisma,
        ledger,
        new PrizeDistributionService(
          drawPrisma,
        ),
        new PrizePoolService(
          drawPrisma,
        ),
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
      paymentPrisma.$disconnect(),
    ]);
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
      await fixturePrisma.purchase.create({
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

    await fixtureLedger.append({
      type:
        LedgerTransactionType
          .PAYMENT_ALLOCATION,
      idempotencyKey:
        `winner-selection-pool-${randomUUID()}`,
      referenceType:
        'PAYMENT',
      referenceId:
        randomUUID(),
      currency:
        'USD',
      metadata: {
        drawId:
          draw.id,
      },
      postings: [
        {
          accountCode:
            LedgerAccountCode
              .PAYMENT_CLEARING,
          side:
            LedgerSide.DEBIT,
          amountMinor:
            500n,
        },
        {
          accountCode:
            LedgerAccountCode
              .WEEKLY_JACKPOT,
          side:
            LedgerSide.CREDIT,
          amountMinor:
            350n,
        },
        {
          accountCode:
            LedgerAccountCode
              .ANNUAL_JACKPOT,
          side:
            LedgerSide.CREDIT,
          amountMinor:
            50n,
        },
        {
          accountCode:
            LedgerAccountCode
              .COMPANY_REVENUE,
          side:
            LedgerSide.CREDIT,
          amountMinor:
            100n,
        },
      ],
    });
    const tickets = [];

    for (
      let index = 1;
      index <= 5;
      index += 1
    ) {
      const ticket =
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
            purchaseId: purchase.id,
            drawId: draw.id,
            numberInDraw:
              BigInt(index),
          },
        });

      tickets.push(ticket);
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

    const built =
      await builder.build(draw.id);

    const finalized =
      await finalizer.finalize(draw.id);

    const randomness =
      await fixturePrisma.randomnessEvidence.create({
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

    await fixturePrisma.lotteryDraw.update({
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

    await fixturePrisma.lotteryDraw.update({
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

  it('rolls back winners, prizes, prize ledger entries, and draw completion when prize ledger recognition fails', async () => {
    const scenario =
      await createScenario([
        4,
        1,
        3,
      ]);

    const appendSpy =
      jest
        .spyOn(
          ledger,
          'appendInTransaction',
        )
        .mockRejectedValueOnce(
          new Error(
            'SEC015_TEST_PRIZE_LEDGER_FAILURE',
          ),
        );

    try {
      await expect(
        winnerSelection.finalize(
          scenario.draw.id,
        ),
      ).rejects.toThrow(
        'SEC015_TEST_PRIZE_LEDGER_FAILURE',
      );
    } finally {
      appendSpy.mockRestore();
    }

    expect(
      await prisma.drawWinner.count({
        where: {
          drawId:
            scenario.draw.id,
        },
      }),
    ).toBe(0);

    expect(
      await prisma.prize.count({
        where: {
          drawId:
            scenario.draw.id,
        },
      }),
    ).toBe(0);

    expect(
      await prisma.ledgerTransaction.count({
        where: {
          type:
            LedgerTransactionType
              .PRIZE_RECOGNIZED,
        },
      }),
    ).toBe(0);

    const rolledBackDraw =
      await prisma.lotteryDraw
        .findUniqueOrThrow({
          where: {
            id:
              scenario.draw.id,
          },
        });

    expect(
      rolledBackDraw.status,
    ).toBe(
      DrawStatus.RANDOMNESS_VERIFIED,
    );

    expect(
      rolledBackDraw.completedAt,
    ).toBeNull();
  });

  it('persists exact immutable prize evidence backed by balanced sealed ledger transactions', async () => {
    const scenario =
      await createScenario([
        4,
        1,
        3,
      ]);

    await winnerSelection.finalize(
      scenario.draw.id,
    );

    const prizes =
      await prisma.prize.findMany({
        where: {
          drawId:
            scenario.draw.id,
        },
        orderBy: {
          rank: 'asc',
        },
      });

    expect(
      prizes.map(
        (prize) => ({
          rank:
            prize.rank,
          amountMinor:
            prize.amountMinor,
          distributionRuleVersion:
            prize.distributionRuleVersion,
          shareBps:
            prize.shareBps,
        }),
      ),
    ).toEqual([
      {
        rank: 1,
        amountMinor: 175n,
        distributionRuleVersion: 1,
        shareBps: 5000,
      },
      {
        rank: 2,
        amountMinor: 105n,
        distributionRuleVersion: 1,
        shareBps: 3000,
      },
      {
        rank: 3,
        amountMinor: 70n,
        distributionRuleVersion: 1,
        shareBps: 2000,
      },
    ]);

    expect(
      prizes.reduce(
        (
          sum,
          prize,
        ) =>
          sum +
          prize.amountMinor,
        0n,
      ),
    ).toBe(350n);

    const transactions =
      await prisma.ledgerTransaction
        .findMany({
          where: {
            type:
              LedgerTransactionType
                .PRIZE_RECOGNIZED,
          },
          orderBy: {
            createdAt: 'asc',
          },
          include: {
            postings: true,
          },
        });

    expect(
      transactions,
    ).toHaveLength(3);

    for (
      const transaction of
      transactions
    ) {
      expect(
        transaction.sealedAt,
      ).not.toBeNull();

      expect(
        transaction.referenceType,
      ).toBe('PRIZE');

      const debit =
        transaction.postings
          .filter(
            (posting) =>
              posting.side ===
              LedgerSide.DEBIT,
          )
          .reduce(
            (
              sum,
              posting,
            ) =>
              sum +
              posting.amountMinor,
            0n,
          );

      const credit =
        transaction.postings
          .filter(
            (posting) =>
              posting.side ===
              LedgerSide.CREDIT,
          )
          .reduce(
            (
              sum,
              posting,
            ) =>
              sum +
              posting.amountMinor,
            0n,
          );

      expect(debit).toBe(credit);

      expect(
        transaction.postings
          .some(
            (posting) =>
              posting.accountCode ===
                LedgerAccountCode
                  .WEEKLY_JACKPOT &&
              posting.side ===
                LedgerSide.DEBIT,
          ),
      ).toBe(true);

      expect(
        transaction.postings
          .some(
            (posting) =>
              posting.accountCode ===
                LedgerAccountCode
                  .PRIZE_PAYABLE &&
              posting.side ===
                LedgerSide.CREDIT,
          ),
      ).toBe(true);
    }

    expect(
      transactions.reduce(
        (
          sum,
          transaction,
        ) =>
          sum +
          transaction.postings
            .filter(
              (posting) =>
                posting.accountCode ===
                  LedgerAccountCode
                    .PRIZE_PAYABLE &&
                posting.side ===
                  LedgerSide.CREDIT,
            )
            .reduce(
              (
                postingSum,
                posting,
              ) =>
                postingSum +
                posting.amountMinor,
              0n,
            ),
        0n,
      ),
    ).toBe(350n);
  });

  it('rejects mutation and deletion of recognized prize financial identity at the database boundary', async () => {
    const scenario =
      await createScenario();

    await winnerSelection.finalize(
      scenario.draw.id,
    );

    const prize =
      await prisma.prize
        .findFirstOrThrow({
          where: {
            drawId:
              scenario.draw.id,
          },
          orderBy: {
            rank: 'asc',
          },
        });

    await expect(
      fixturePrisma.prize.update({
        where: {
          id: prize.id,
        },
        data: {
          amountMinor:
            prize.amountMinor + 1n,
        },
      }),
    ).rejects.toThrow();

    await expect(
      fixturePrisma.prize.update({
        where: {
          id: prize.id,
        },
        data: {
          shareBps:
            (prize.shareBps ?? 0) +
            1,
        },
      }),
    ).rejects.toThrow();

    const anotherUser =
      await fixturePrisma.user.create({
        data: {
          email:
            `${randomUUID()}@example.com`,
          passwordHash: 'hash',
          status:
            UserStatus.ACTIVE,
          emailVerifiedAt:
            new Date(),
        },
      });

    await expect(
      fixturePrisma.prize.update({
        where: {
          id: prize.id,
        },
        data: {
          userId:
            anotherUser.id,
        },
      }),
    ).rejects.toThrow();

    await expect(
      fixturePrisma.prize.delete({
        where: {
          id: prize.id,
        },
      }),
    ).rejects.toThrow();

    const persisted =
      await prisma.prize
        .findUniqueOrThrow({
          where: {
            id: prize.id,
          },
        });

    expect(
      persisted.amountMinor,
    ).toBe(
      prize.amountMinor,
    );

    expect(
      persisted.shareBps,
    ).toBe(
      prize.shareBps,
    );

    expect(
      persisted.userId,
    ).toBe(
      prize.userId,
    );
  });

  it('is idempotent for both prizes and PRIZE_RECOGNIZED ledger transactions', async () => {
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

    expect(
      second.alreadyCompleted,
    ).toBe(true);

    expect(
      second.winners,
    ).toEqual(
      first.winners,
    );

    const prizes =
      await prisma.prize.findMany({
        where: {
          drawId:
            scenario.draw.id,
        },
      });

    expect(prizes).toHaveLength(3);

    expect(
      prizes.reduce(
        (
          sum,
          prize,
        ) =>
          sum +
          prize.amountMinor,
        0n,
      ),
    ).toBe(350n);

    const prizeIds =
      prizes.map(
        (prize) =>
          prize.id,
      );

    const recognized =
      await prisma.ledgerTransaction
        .findMany({
          where: {
            type:
              LedgerTransactionType
                .PRIZE_RECOGNIZED,
            referenceType:
              'PRIZE',
            referenceId: {
              in: prizeIds,
            },
          },
        });

    expect(
      recognized,
    ).toHaveLength(3);

    expect(
      new Set(
        recognized.map(
          (transaction) =>
            transaction.idempotencyKey,
        ),
      ).size,
    ).toBe(3);
  });
});
