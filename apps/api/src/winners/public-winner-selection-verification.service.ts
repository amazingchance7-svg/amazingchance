import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DrawStatus,
  RandomnessStatus,
  SnapshotStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  selectWinnerPositions,
  WINNER_SELECTION_ALGORITHM,
} from './winner-selection.util';

const PUBLIC_WINNER_SELECTION_VERSION =
  'AMAZING_CHANCE_PUBLIC_WINNER_SELECTION_V1';

export interface PublicWinnerSelectionVerification {
  version: string;

  draw: {
    id: string;
    publicId: string;
    status: DrawStatus;
    winnerCount: number;
  };

  algorithm: {
    id: string;
    description: string;
  };

  snapshot: {
    id: string;
    ticketCount: string;
    snapshotHash: string;
    merkleRoot: string;
    finalizedAt: Date;
  };

  randomness: {
    evidenceId: string;
    responseHash: string;
    requestedMin: string;
    requestedMax: string;
    requestedCount: number;
    verifiedAt: Date;
    suppliedPositions: string[];
  };

  recomputedSelection: {
    suppliedPositionCount: number;
    duplicatePositionCount: number;
    selectedPositions: string[];

    winners: Array<{
      rank: number;
      randomPosition: string;
      ticketPublicId: string;
    }>;
  };

  publishedWinners: Array<{
    rank: number;
    randomPosition: string;
    ticketPublicId: string;
  }>;

  integrity: {
    randomnessRangeMatchesSnapshot: boolean;
    randomnessCountIsSufficient: boolean;
    selectedSnapshotEntriesComplete: boolean;
    publishedWinnerCountMatches: boolean;
    publishedPositionsMatch: boolean;
    publishedTicketsMatch: boolean;
    locallyConsistent: boolean;
  };
}

@Injectable()
export class PublicWinnerSelectionVerificationService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findVerification(
    drawId: string,
  ): Promise<PublicWinnerSelectionVerification> {
    const draw =
      await this.prisma.lotteryDraw.findFirst({
        where: {
          id: drawId,
          status:
            DrawStatus.PUBLISHED,
          completedAt: {
            not: null,
          },
          publishedAt: {
            not: null,
          },
        },
        select: {
          id: true,
          publicId: true,
          status: true,
          winnerCount: true,

          snapshot: {
            select: {
              id: true,
              status: true,
              ticketCount: true,
              snapshotHash: true,
              merkleRoot: true,
              finalizedAt: true,
            },
          },

          randomnessRecords: {
            where: {
              status:
                RandomnessStatus.VERIFIED,
              signatureVerified:
                true,
              responseHash: {
                not: null,
              },
              verifiedAt: {
                not: null,
              },
            },
            orderBy: {
              attemptNumber:
                'desc',
            },
            take: 1,
            select: {
              id: true,
              requestedMin: true,
              requestedMax: true,
              requestedCount: true,
              randomPositions: true,
              responseHash: true,
              verifiedAt: true,
            },
          },

          winners: {
            orderBy: {
              rank: 'asc',
            },
            select: {
              rank: true,
              randomPosition: true,
              snapshotEntry: {
                select: {
                  position: true,
                  ticketPublicId: true,
                },
              },
            },
          },
        },
      });

    if (!draw) {
      throw new NotFoundException(
        'Published lottery draw not found',
      );
    }

    const snapshot =
      draw.snapshot;

    if (
      !snapshot ||
      snapshot.status !==
        SnapshotStatus.FINALIZED ||
      !snapshot.snapshotHash ||
      !snapshot.merkleRoot ||
      !snapshot.finalizedAt
    ) {
      throw new NotFoundException(
        'Published draw is missing finalized snapshot evidence',
      );
    }

    const randomness =
      draw.randomnessRecords[0];

    if (
      !randomness ||
      !randomness.responseHash ||
      !randomness.verifiedAt ||
      randomness.randomPositions ===
        null
    ) {
      throw new NotFoundException(
        'Published draw is missing verified randomness evidence',
      );
    }

    const randomnessRangeMatchesSnapshot =
      randomness.requestedMin === 1n &&
      randomness.requestedMax ===
        snapshot.ticketCount;

    const randomnessCountIsSufficient =
      randomness.requestedCount >=
      draw.winnerCount;

    if (!randomnessRangeMatchesSnapshot) {
      throw new ConflictException(
        'Verified randomness range does not match the finalized snapshot',
      );
    }

    if (!randomnessCountIsSufficient) {
      throw new ConflictException(
        'Verified randomness does not contain enough requested positions',
      );
    }

    const selection =
      selectWinnerPositions({
        randomPositions:
          randomness.randomPositions,
        winnerCount:
          draw.winnerCount,
        snapshotEntryCount:
          snapshot.ticketCount,
      });

    const entries =
      await this.prisma.ticketSnapshotEntry.findMany({
        where: {
          snapshotId:
            snapshot.id,
          position: {
            in:
              selection.positions,
          },
        },
        select: {
          position: true,
          ticketPublicId: true,
        },
      });

    const entryByPosition =
      new Map(
        entries.map(
          (entry) => [
            entry.position.toString(),
            entry,
          ],
        ),
      );

    const selectedSnapshotEntriesComplete =
      entries.length ===
      selection.positions.length;

    const recomputedWinners =
      selection.positions.map(
        (position, index) => {
          const entry =
            entryByPosition.get(
              position.toString(),
            );

          if (!entry) {
            throw new ConflictException(
              `Snapshot entry for selected position ${position.toString()} was not found`,
            );
          }

          return {
            rank:
              index + 1,
            randomPosition:
              position.toString(),
            ticketPublicId:
              entry.ticketPublicId,
          };
        },
      );

    const publishedWinners =
      draw.winners.map(
        (winner) => ({
          rank:
            winner.rank,
          randomPosition:
            winner.randomPosition.toString(),
          ticketPublicId:
            winner.snapshotEntry
              .ticketPublicId,
        }),
      );

    const publishedWinnerCountMatches =
      publishedWinners.length ===
      draw.winnerCount;

    const publishedPositionsMatch =
      publishedWinnerCountMatches &&
      recomputedWinners.every(
        (winner, index) =>
          publishedWinners[index]
            ?.rank ===
            winner.rank &&
          publishedWinners[index]
            ?.randomPosition ===
            winner.randomPosition &&
          draw.winners[index]
            ?.snapshotEntry.position.toString() ===
            winner.randomPosition,
      );

    const publishedTicketsMatch =
      publishedWinnerCountMatches &&
      recomputedWinners.every(
        (winner, index) =>
          publishedWinners[index]
            ?.ticketPublicId ===
          winner.ticketPublicId,
      );

    const locallyConsistent =
      randomnessRangeMatchesSnapshot &&
      randomnessCountIsSufficient &&
      selectedSnapshotEntriesComplete &&
      publishedWinnerCountMatches &&
      publishedPositionsMatch &&
      publishedTicketsMatch;

    return {
      version:
        PUBLIC_WINNER_SELECTION_VERSION,

      draw: {
        id:
          draw.id,
        publicId:
          draw.publicId,
        status:
          draw.status,
        winnerCount:
          draw.winnerCount,
      },

      algorithm: {
        id:
          WINNER_SELECTION_ALGORITHM,
        description:
          'Select the first unique verified RANDOM.ORG positions in provider order and map each position to the finalized snapshot entry at that position.',
      },

      snapshot: {
        id:
          snapshot.id,
        ticketCount:
          snapshot.ticketCount.toString(),
        snapshotHash:
          snapshot.snapshotHash,
        merkleRoot:
          snapshot.merkleRoot,
        finalizedAt:
          snapshot.finalizedAt,
      },

      randomness: {
        evidenceId:
          randomness.id,
        responseHash:
          randomness.responseHash,
        requestedMin:
          randomness.requestedMin.toString(),
        requestedMax:
          randomness.requestedMax.toString(),
        requestedCount:
          randomness.requestedCount,
        verifiedAt:
          randomness.verifiedAt,
        suppliedPositions:
          this.serializePositions(
            randomness.randomPositions,
          ),
      },

      recomputedSelection: {
        suppliedPositionCount:
          selection.suppliedPositionCount,
        duplicatePositionCount:
          selection.duplicatePositionCount,
        selectedPositions:
          selection.positions.map(
            (position) =>
              position.toString(),
          ),
        winners:
          recomputedWinners,
      },

      publishedWinners,

      integrity: {
        randomnessRangeMatchesSnapshot,
        randomnessCountIsSufficient,
        selectedSnapshotEntriesComplete,
        publishedWinnerCountMatches,
        publishedPositionsMatch,
        publishedTicketsMatch,
        locallyConsistent,
      },
    };
  }

  private serializePositions(
    value: unknown,
  ): string[] {
    if (!Array.isArray(value)) {
      throw new ConflictException(
        'Verified randomness positions have an invalid structure',
      );
    }

    return value.map(
      (position, index) => {
        if (
          typeof position ===
            'number' &&
          Number.isSafeInteger(
            position,
          ) &&
          position > 0
        ) {
          return position.toString();
        }

        if (
          typeof position ===
            'string' &&
          /^[1-9]\d*$/.test(
            position,
          )
        ) {
          return position;
        }

        throw new ConflictException(
          `Verified randomness position at index ${index} is invalid`,
        );
      },
    );
  }
}
