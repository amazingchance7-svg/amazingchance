import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DrawStatus,
  LedgerAccountCode,
  LedgerSide,
  LedgerTransactionType,
  Prisma,
  PrizeStatus,
  RandomnessStatus,
  SnapshotStatus,
} from '@prisma/client';

import {
  LedgerService,
} from '../ledger/ledger.service';
import {
  PrizeDistributionService,
} from '../prizes/prize-distribution.service';
import {
  PrizePoolService,
} from '../prizes/prize-pool.service';
import { DrawPrismaService } from '../prisma/prisma.service';
import {
  type FinalizeWinnerSelectionResult,
  type SelectedWinner,
} from './winner-selection.types';
import {
  selectWinnerPositions,
} from './winner-selection.util';

type WinnerRecord = {
  id: string;
  rank: number;
  ticketId: string;
  snapshotEntryId: string;
  randomPosition: bigint;
  snapshotEntry: {
    ticketPublicId: string;
    ownerPublicRef: string;
  };
};

type WinnerForRecognition =
  WinnerRecord & {
    ticket: {
      userId: string;
    };
  };

type PrizeEvidence = {
  id: string;
  rank: number;
  amountMinor: bigint;
  distributionRuleVersion:
    number | null;
  shareBps:
    number | null;
};

@Injectable()
export class WinnerSelectionService {
  constructor(
    private readonly prisma: DrawPrismaService,
    private readonly ledger:
      LedgerService,
    private readonly prizeDistribution:
      PrizeDistributionService,
    private readonly prizePool:
      PrizePoolService,
  ) {}

  async finalize(
    drawId: string,
  ): Promise<FinalizeWinnerSelectionResult> {
    try {
      return await this.prisma.$transaction(
        async (tx) =>
          this.finalizeInTransaction(
            tx,
            drawId,
          ),
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel
              .Serializable,
        },
      );
    } catch (error) {
      if (
        this.isConcurrentSelectionError(
          error,
        )
      ) {
        const completed =
          await this.findCompletedResult(
            drawId,
          );

        if (completed) {
          return completed;
        }
      }

      throw error;
    }
  }

  private async finalizeInTransaction(
    tx: Prisma.TransactionClient,
    drawId: string,
  ): Promise<FinalizeWinnerSelectionResult> {
    const draw =
      await tx.lotteryDraw.findUnique({
        where: {
          id: drawId,
        },
        include: {
          snapshot: true,
          prizes: {
            orderBy: {
              rank: 'asc',
            },
            select: {
              id: true,
              rank: true,
              amountMinor: true,
              distributionRuleVersion:
                true,
              shareBps: true,
            },
          },
          winners: {
            orderBy: {
              rank: 'asc',
            },
            include: {
              snapshotEntry: {
                select: {
                  ticketPublicId: true,
                  ownerPublicRef: true,
                },
              },
            },
          },
          randomnessRecords: {
            where: {
              status:
                RandomnessStatus.VERIFIED,
            },
            orderBy: {
              attemptNumber: 'desc',
            },
            take: 1,
          },
        },
      });

    if (!draw) {
      throw new NotFoundException(
        'Lottery draw not found',
      );
    }

    if (
      draw.status ===
        DrawStatus.COMPLETED ||
      draw.status ===
        DrawStatus.PUBLISHED
    ) {
      return this.resolveExistingResult(
        draw,
      );
    }

    if (
      draw.prizes.length > 0
    ) {
      throw new ConflictException(
        'Incomplete draw already contains recognized prizes',
      );
    }

    if (
      draw.status !==
        DrawStatus.RANDOMNESS_VERIFIED &&
      draw.status !==
        DrawStatus
          .WINNER_SELECTION_PENDING
    ) {
      throw new ConflictException(
        `Winner selection cannot run for a draw in ${draw.status}`,
      );
    }

    const snapshot = draw.snapshot;

    if (
      !snapshot ||
      snapshot.status !==
        SnapshotStatus.FINALIZED ||
      !snapshot.snapshotHash ||
      !snapshot.merkleRoot ||
      !snapshot.finalizedAt
    ) {
      throw new ConflictException(
        'A finalized ticket snapshot with cryptographic commitment is required',
      );
    }

    if (snapshot.ticketCount < 1n) {
      throw new ConflictException(
        'Finalized snapshot contains no eligible tickets',
      );
    }

    const randomness =
      draw.randomnessRecords[0];

    if (!randomness) {
      throw new ConflictException(
        'Verified randomness evidence was not found',
      );
    }

    if (
      randomness.status !==
        RandomnessStatus.VERIFIED ||
      randomness.signatureVerified !==
        true ||
      !randomness.responseHash ||
      !randomness.providerSignature ||
      !randomness.verifiedAt ||
      randomness.randomPositions === null
    ) {
      throw new ConflictException(
        'Randomness evidence is not fully verified',
      );
    }

    if (
      randomness.requestedMin !== 1n ||
      randomness.requestedMax !==
        snapshot.ticketCount
    ) {
      throw new ConflictException(
        'Randomness request range does not match the finalized snapshot',
      );
    }

    if (
      randomness.requestedCount <
      draw.winnerCount
    ) {
      throw new ConflictException(
        'Randomness evidence does not contain enough requested positions',
      );
    }

    const selection =
      selectWinnerPositions({
        randomPositions:
          randomness.randomPositions,
        winnerCount: draw.winnerCount,
        snapshotEntryCount:
          snapshot.ticketCount,
      });

    const entries =
      await tx.ticketSnapshotEntry.findMany({
        where: {
          snapshotId: snapshot.id,
          position: {
            in: selection.positions,
          },
        },
        select: {
          id: true,
          ticketId: true,
          position: true,
          ticketPublicId: true,
          ownerPublicRef: true,
        },
      });

    if (
      entries.length !==
      selection.positions.length
    ) {
      throw new ConflictException(
        'One or more selected positions are missing from the finalized snapshot',
      );
    }

    const entryByPosition = new Map(
      entries.map((entry) => [
        entry.position.toString(),
        entry,
      ]),
    );

    const orderedEntries =
      selection.positions.map(
        (position) => {
          const entry =
            entryByPosition.get(
              position.toString(),
            );

          if (!entry) {
            throw new ConflictException(
              `Snapshot entry for position ${position.toString()} was not found`,
            );
          }

          return entry;
        },
      );

    const stateClaim =
      await tx.lotteryDraw.updateMany({
        where: {
          id: draw.id,
          status: {
            in: [
              DrawStatus
                .RANDOMNESS_VERIFIED,
              DrawStatus
                .WINNER_SELECTION_PENDING,
            ],
          },
        },
        data: {
          status:
            DrawStatus
              .WINNER_SELECTION_PENDING,
        },
      });

    if (stateClaim.count !== 1) {
      throw new ConflictException(
        'Draw state changed while winner selection was starting',
      );
    }

    await tx.drawWinner.createMany({
      data: orderedEntries.map(
        (entry, index) => ({
          drawId: draw.id,
          ticketId: entry.ticketId,
          snapshotEntryId: entry.id,
          rank: index + 1,
          randomPosition:
            entry.position,
        }),
      ),
    });

    const winners =
      await tx.drawWinner.findMany({
        where: {
          drawId: draw.id,
        },
        orderBy: {
          rank: 'asc',
        },
        include: {
          ticket: {
            select: {
              userId: true,
            },
          },
          snapshotEntry: {
            select: {
              ticketPublicId: true,
              ownerPublicRef: true,
            },
          },
        },
      }) as WinnerForRecognition[];

    if (
      winners.length !==
      draw.winnerCount
    ) {
      throw new ConflictException(
        'Winner creation did not produce the configured winner count',
      );
    }

    const pool =
      await this.prizePool
        .resolveInTransaction(
          tx,
          {
            drawId:
              draw.id,
            drawType:
              draw.type,
            participationYear:
              draw.participationYear,
            currency:
              draw.currency,
          },
        );

    const rule =
      await this.prizeDistribution
        .resolveInTransaction(
          tx,
          draw.type,
          draw.scheduledDrawAt,
          draw.winnerCount,
        );

    const calculatedPrizes =
      this.prizeDistribution
        .calculate(
          pool.amountMinor,
          rule,
        );

    for (
      const calculatedPrize of
      calculatedPrizes
    ) {
      const winner =
        winners.find(
          (candidate) =>
            candidate.rank ===
            calculatedPrize.rank,
        );

      if (!winner) {
        throw new ConflictException(
          `Winner for prize rank ${calculatedPrize.rank} was not found`,
        );
      }

      const prize =
        await tx.prize.create({
          data: {
            drawId:
              draw.id,
            winnerId:
              winner.id,
            userId:
              winner.ticket.userId,
            rank:
              winner.rank,
            amountMinor:
              calculatedPrize
                .amountMinor,
            currency:
              draw.currency,
            status:
              PrizeStatus.CREATED,
            distributionRuleVersion:
              rule.version,
            shareBps:
              calculatedPrize
                .shareBps,
          },
        });

      await this.ledger
        .appendInTransaction(
          tx,
          {
            type:
              LedgerTransactionType
                .PRIZE_RECOGNIZED,
            idempotencyKey:
              `prize-recognized:${prize.id}`,
            referenceType:
              'PRIZE',
            referenceId:
              prize.id,
            currency:
              draw.currency,
            description:
              'Prize obligation recognized from jackpot',
            metadata: {
              drawId:
                draw.id,
              winnerId:
                winner.id,
              rank:
                winner.rank,
              distributionRuleVersion:
                rule.version,
              shareBps:
                calculatedPrize
                  .shareBps,
              poolAmountMinor:
                pool.amountMinor
                  .toString(),
            },
            postings: [
              {
                accountCode:
                  pool.sourceAccountCode,
                side:
                  LedgerSide.DEBIT,
                amountMinor:
                  calculatedPrize
                    .amountMinor,
              },
              {
                accountCode:
                  LedgerAccountCode
                    .PRIZE_PAYABLE,
                side:
                  LedgerSide.CREDIT,
                amountMinor:
                  calculatedPrize
                    .amountMinor,
              },
            ],
          },
        );
    }

    const recognizedPrizes =
      await tx.prize.findMany({
        where: {
          drawId:
            draw.id,
        },
        orderBy: {
          rank:
            'asc',
        },
        select: {
          id: true,
          rank: true,
          amountMinor: true,
          distributionRuleVersion:
            true,
          shareBps: true,
        },
      });

    this.assertPrizeEvidence(
      recognizedPrizes,
      draw.winnerCount,
      pool.amountMinor,
    );

    const completedAt =
      new Date();

    const completion =
      await tx.lotteryDraw.updateMany({
        where: {
          id: draw.id,
          status:
            DrawStatus
              .WINNER_SELECTION_PENDING,
        },
        data: {
          status:
            DrawStatus.COMPLETED,
          completedAt,
        },
      });

    if (completion.count !== 1) {
      throw new ConflictException(
        'Draw state changed while winner selection was completing',
      );
    }

    return {
      drawId: draw.id,
      drawPublicId: draw.publicId,
      status: 'COMPLETED',
      randomnessEvidenceId:
        randomness.id,
      snapshotId: snapshot.id,
      snapshotHash:
        snapshot.snapshotHash,
      merkleRoot: snapshot.merkleRoot,
      completedAt,
      alreadyCompleted: false,
      winners:
        this.serializeWinners(
          winners,
        ),
    };
  }

  private resolveExistingResult(
    draw: {
      id: string;
      publicId: string;
      status: DrawStatus;
      completedAt: Date | null;
      winnerCount: number;
      snapshot: {
        id: string;
        snapshotHash: string | null;
        merkleRoot: string | null;
      } | null;
      prizes: PrizeEvidence[];
      winners: WinnerRecord[];
      randomnessRecords: Array<{
        id: string;
      }>;
    },
  ): FinalizeWinnerSelectionResult {
    const snapshot = draw.snapshot;
    const randomness =
      draw.randomnessRecords[0];

    if (
      !draw.completedAt ||
      !snapshot?.snapshotHash ||
      !snapshot.merkleRoot ||
      !randomness ||
      draw.winners.length !==
        draw.winnerCount ||
      draw.prizes.length !==
        draw.winnerCount
    ) {
      throw new ConflictException(
        'Completed draw is missing winner-selection or prize-recognition evidence',
      );
    }

    this.assertPrizeEvidence(
      draw.prizes,
      draw.winnerCount,
    );

    return {
      drawId: draw.id,
      drawPublicId: draw.publicId,
      status:
        draw.status ===
        DrawStatus.PUBLISHED
          ? 'PUBLISHED'
          : 'COMPLETED',
      randomnessEvidenceId:
        randomness.id,
      snapshotId: snapshot.id,
      snapshotHash:
        snapshot.snapshotHash,
      merkleRoot: snapshot.merkleRoot,
      completedAt: draw.completedAt,
      alreadyCompleted: true,
      winners:
        this.serializeWinners(
          draw.winners,
        ),
    };
  }

  private async findCompletedResult(
    drawId: string,
  ): Promise<FinalizeWinnerSelectionResult | null> {
    const draw =
      await this.prisma.lotteryDraw.findUnique({
        where: {
          id: drawId,
        },
        include: {
          snapshot: true,
          prizes: {
            orderBy: {
              rank: 'asc',
            },
            select: {
              id: true,
              rank: true,
              amountMinor: true,
              distributionRuleVersion:
                true,
              shareBps: true,
            },
          },
          winners: {
            orderBy: {
              rank: 'asc',
            },
            include: {
              snapshotEntry: {
                select: {
                  ticketPublicId: true,
                  ownerPublicRef: true,
                },
              },
            },
          },
          randomnessRecords: {
            where: {
              status:
                RandomnessStatus.VERIFIED,
            },
            orderBy: {
              attemptNumber: 'desc',
            },
            take: 1,
          },
        },
      });

    if (
      !draw ||
      (draw.status !==
        DrawStatus.COMPLETED &&
        draw.status !==
          DrawStatus.PUBLISHED)
    ) {
      return null;
    }

    return this.resolveExistingResult(
      draw,
    );
  }

  private assertPrizeEvidence(
    prizes:
      PrizeEvidence[],
    winnerCount:
      number,
    expectedPoolMinor?:
      bigint,
  ): void {
    if (
      prizes.length !==
      winnerCount
    ) {
      throw new ConflictException(
        'Prize recognition did not produce the configured prize count',
      );
    }

    const validRanks =
      prizes.every(
        (
          prize,
          index,
        ) =>
          prize.rank ===
            index + 1 &&
          prize.amountMinor >
            0n &&
          prize.distributionRuleVersion !==
            null &&
          prize.distributionRuleVersion >
            0 &&
          prize.shareBps !==
            null &&
          prize.shareBps >
            0,
      );

    if (!validRanks) {
      throw new ConflictException(
        'Recognized prize evidence is incomplete',
      );
    }

    if (
      expectedPoolMinor !==
      undefined
    ) {
      const total =
        prizes.reduce(
          (
            sum,
            prize,
          ) =>
            sum +
            prize.amountMinor,
          0n,
        );

      if (
        total !==
        expectedPoolMinor
      ) {
        throw new ConflictException(
          'Recognized prize amounts do not equal the ledger-backed prize pool',
        );
      }
    }
  }

  private serializeWinners(
    winners: WinnerRecord[],
  ): SelectedWinner[] {
    return winners.map((winner) => ({
      id: winner.id,
      rank: winner.rank,
      ticketId: winner.ticketId,
      ticketPublicId:
        winner.snapshotEntry
          .ticketPublicId,
      ownerPublicRef:
        winner.snapshotEntry
          .ownerPublicRef,
      snapshotEntryId:
        winner.snapshotEntryId,
      randomPosition:
        winner.randomPosition.toString(),
    }));
  }

  private isConcurrentSelectionError(
    error: unknown,
  ): boolean {
    return (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' ||
        error.code === 'P2034')
    );
  }
}
