import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DrawStatus,
  RandomnessStatus,
  SnapshotStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const RESULT_VERSION =
  'AMAZING_CHANCE_PUBLIC_DRAW_RESULT_V1';

const WINNER_SELECTION_ALGORITHM =
  'FIRST_UNIQUE_VERIFIED_RANDOM_POSITIONS_IN_PROVIDER_ORDER_V1';

export interface PublicDrawResultResponse {
  resultVersion: string;
  draw: {
    id: string;
    publicId: string;
    type: string;
    status: DrawStatus;
    scheduledDrawAt: Date;
    completedAt: Date;
    publishedAt: Date;
    winnerCount: number;
  };
  snapshot: {
    ticketCount: string;
    snapshotHash: string;
    merkleRoot: string;
    hashAlgorithm: string;
    canonicalFormat: string;
    finalizedAt: Date;
  };
  randomness: {
    evidenceId: string;
    provider: string;
    status: RandomnessStatus;
    attemptNumber: number;
    requestedMin: string;
    requestedMax: string;
    requestedCount: number;
    responseHash: string;
    providerSignature: string;
    signatureVerified: true;
    randomPositions: unknown;
    requestedAt: Date | null;
    receivedAt: Date | null;
    verifiedAt: Date;
  };
  winnerSelection: {
    algorithm: string;
    winners: Array<{
      rank: number;
      ticketPublicId: string;
      ownerPublicRef: string;
      randomPosition: string;
      prize: {
        amountMinor: string;
        currency: string;
        status: string;
      } | null;
    }>;
  };
  verification: {
    auditManifest: string;
    snapshotMetadata: string;
    snapshotDownload: string;
    ticketProofTemplate: string;
    proofVerification: string;
  };
}

@Injectable()
export class PublicDrawResultService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async findPublishedByDrawId(
    drawId: string,
  ): Promise<PublicDrawResultResponse> {
    const draw =
      await this.prisma.lotteryDraw.findFirst({
        where: {
          id: drawId,
          status: DrawStatus.PUBLISHED,
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
          type: true,
          status: true,
          scheduledDrawAt: true,
          completedAt: true,
          publishedAt: true,
          winnerCount: true,
          snapshot: {
            select: {
              status: true,
              ticketCount: true,
              snapshotHash: true,
              merkleRoot: true,
              hashAlgorithm: true,
              canonicalFormat: true,
              finalizedAt: true,
            },
          },
          randomnessRecords: {
            where: {
              status:
                RandomnessStatus.VERIFIED,
              signatureVerified: true,
              responseHash: {
                not: null,
              },
              providerSignature: {
                not: null,
              },
              verifiedAt: {
                not: null,
              },
            },
            orderBy: {
              attemptNumber: 'desc',
            },
            take: 1,
            select: {
              id: true,
              provider: true,
              status: true,
              attemptNumber: true,
              requestedMin: true,
              requestedMax: true,
              requestedCount: true,
              responseHash: true,
              providerSignature: true,
              signatureVerified: true,
              randomPositions: true,
              requestedAt: true,
              receivedAt: true,
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
                  ticketPublicId: true,
                  ownerPublicRef: true,
                },
              },
              prize: {
                select: {
                  amountMinor: true,
                  currency: true,
                  status: true,
                },
              },
            },
          },
        },
      });

    if (
      !draw ||
      !draw.completedAt ||
      !draw.publishedAt
    ) {
      throw new NotFoundException(
        'Published lottery draw result not found',
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
      throw new NotFoundException(
        'Published lottery draw result is missing finalized snapshot evidence',
      );
    }

    const randomness =
      draw.randomnessRecords[0];

    if (
      !randomness ||
      !randomness.responseHash ||
      !randomness.providerSignature ||
      randomness.signatureVerified !== true ||
      !randomness.verifiedAt ||
      randomness.randomPositions === null
    ) {
      throw new NotFoundException(
        'Published lottery draw result is missing verified randomness evidence',
      );
    }

    if (
      draw.winners.length !==
      draw.winnerCount
    ) {
      throw new NotFoundException(
        'Published lottery draw result is missing winners',
      );
    }

    const basePath =
      `/lottery-draws/${draw.id}`;

    return {
      resultVersion: RESULT_VERSION,
      draw: {
        id: draw.id,
        publicId: draw.publicId,
        type: draw.type,
        status: draw.status,
        scheduledDrawAt:
          draw.scheduledDrawAt,
        completedAt:
          draw.completedAt,
        publishedAt:
          draw.publishedAt,
        winnerCount:
          draw.winnerCount,
      },
      snapshot: {
        ticketCount:
          snapshot.ticketCount.toString(10),
        snapshotHash:
          snapshot.snapshotHash,
        merkleRoot:
          snapshot.merkleRoot,
        hashAlgorithm:
          snapshot.hashAlgorithm,
        canonicalFormat:
          snapshot.canonicalFormat,
        finalizedAt:
          snapshot.finalizedAt,
      },
      randomness: {
        evidenceId:
          randomness.id,
        provider:
          randomness.provider,
        status:
          randomness.status,
        attemptNumber:
          randomness.attemptNumber,
        requestedMin:
          randomness.requestedMin.toString(10),
        requestedMax:
          randomness.requestedMax.toString(10),
        requestedCount:
          randomness.requestedCount,
        responseHash:
          randomness.responseHash,
        providerSignature:
          randomness.providerSignature,
        signatureVerified: true,
        randomPositions:
          randomness.randomPositions,
        requestedAt:
          randomness.requestedAt,
        receivedAt:
          randomness.receivedAt,
        verifiedAt:
          randomness.verifiedAt,
      },
      winnerSelection: {
        algorithm:
          WINNER_SELECTION_ALGORITHM,
        winners:
          draw.winners.map(
            (winner) => ({
              rank: winner.rank,
              ticketPublicId:
                winner.snapshotEntry
                  .ticketPublicId,
              ownerPublicRef:
                winner.snapshotEntry
                  .ownerPublicRef,
              randomPosition:
                winner.randomPosition.toString(
                  10,
                ),
              prize: winner.prize
                ? {
                    amountMinor:
                      winner.prize.amountMinor.toString(
                        10,
                      ),
                    currency:
                      winner.prize.currency,
                    status:
                      winner.prize.status,
                  }
                : null,
            }),
          ),
      },
      verification: {
        auditManifest:
          `${basePath}/audit`,
        snapshotMetadata:
          `${basePath}/snapshot`,
        snapshotDownload:
          `${basePath}/snapshot/download`,
        ticketProofTemplate:
          `${basePath}/tickets/{ticketPublicId}/proof`,
        proofVerification:
          `${basePath}/verify-proof`,
      },
    };
  }
}
