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
import { sha256CanonicalJson } from './randomness-canonical-json.util';
import {
  RANDOMNESS_BINDING_VERSION,
  type RandomOrgSignedRandom,
} from './randomness-evidence.types';

const PUBLIC_RANDOMNESS_VERSION =
  'AMAZING_CHANCE_PUBLIC_RANDOMNESS_V1';

type JsonObject =
  Record<string, unknown>;

export interface PublicRandomnessEvidence {
  version: string;

  draw: {
    id: string;
    publicId: string;
    status: DrawStatus;
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

  evidence: {
    id: string;
    provider: string;
    status: RandomnessStatus;
    attemptNumber: number;
    requestedMin: string;
    requestedMax: string;
    requestedCount: number;
    requestedAt: Date | null;
    receivedAt: Date | null;
    verifiedAt: Date;
    responseHash: string;
    providerSignature: string;
    signatureVerified: true;
    randomPositions: string[];
    signedRandom:
      RandomOrgSignedRandom;
  };

  winnerPositions: Array<{
    rank: number;
    randomPosition: string;
    ticketPublicId: string;
  }>;

  integrity: {
    responseHashMatches:
      boolean;

    signatureMatchesStoredEvidence:
      boolean;

    requestParametersMatch:
      boolean;

    snapshotBindingMatches:
      boolean;

    randomPositionsMatch:
      boolean;

    winnerPositionsMatch:
      boolean;

    locallyConsistent:
      boolean;
  };
}

@Injectable()
export class PublicRandomnessVerificationService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async findEvidence(
    drawId: string,
  ): Promise<PublicRandomnessEvidence> {
    const draw =
      await this.loadPublishedDraw(
        drawId,
      );

    const randomness =
      draw.randomnessRecords[0];

    if (
      !randomness ||
      !randomness.responseHash ||
      !randomness.providerSignature ||
      randomness.signatureVerified !==
        true ||
      !randomness.verifiedAt
    ) {
      throw new NotFoundException(
        'Published draw is missing verified randomness evidence',
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

    const responsePayload =
      this.asObject(
        randomness.responsePayload,
      );

    const signedRandom =
      this.asSignedRandom(
        responsePayload.random,
      );

    const payloadSignature =
      typeof responsePayload.signature ===
      'string'
        ? responsePayload.signature
        : null;

    if (!payloadSignature) {
      throw new ConflictException(
        'Stored randomness response is missing its provider signature',
      );
    }

    const storedPositions =
      this.asNumberArray(
        randomness.randomPositions,
      );

    const calculatedResponseHash =
      sha256CanonicalJson(
        signedRandom,
      );

    const userData =
      this.asObject(
        signedRandom.userData,
      );

    const requestParametersMatch =
      signedRandom.method ===
        'generateSignedIntegers' &&
      signedRandom.n ===
        randomness.requestedCount &&
      signedRandom.min ===
        Number(
          randomness.requestedMin,
        ) &&
      signedRandom.max ===
        Number(
          randomness.requestedMax,
        ) &&
      signedRandom.replacement ===
        false &&
      signedRandom.base === 10;

    const snapshotBindingMatches =
      userData.version ===
        RANDOMNESS_BINDING_VERSION &&
      userData.drawId ===
        draw.id &&
      userData.drawPublicId ===
        draw.publicId &&
      userData.snapshotHash ===
        snapshot.snapshotHash &&
      userData.merkleRoot ===
        snapshot.merkleRoot &&
      userData.ticketCount ===
        snapshot.ticketCount.toString(
          10,
        );

    const randomPositionsMatch =
      this.sameNumbers(
        signedRandom.data,
        storedPositions,
      );

    const winnerPositions =
      draw.winners.map(
        (winner) => ({
          rank:
            winner.rank,

          randomPosition:
            winner.randomPosition.toString(
              10,
            ),

          ticketPublicId:
            winner.snapshotEntry
              .ticketPublicId,
        }),
      );

    const winnerNumbers =
      draw.winners.map(
        (winner) =>
          Number(
            winner.randomPosition,
          ),
      );

    const winnerPositionsMatch =
      draw.winners.length ===
        draw.winnerCount &&
      this.sameNumbers(
        signedRandom.data,
        winnerNumbers,
      );

    const responseHashMatches =
      calculatedResponseHash ===
      randomness.responseHash;

    const signatureMatchesStoredEvidence =
      payloadSignature ===
      randomness.providerSignature;

    const locallyConsistent =
      responseHashMatches &&
      signatureMatchesStoredEvidence &&
      requestParametersMatch &&
      snapshotBindingMatches &&
      randomPositionsMatch &&
      winnerPositionsMatch;

    return {
      version:
        PUBLIC_RANDOMNESS_VERSION,

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

      snapshot: {
        ticketCount:
          snapshot.ticketCount.toString(
            10,
          ),

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

      evidence: {
        id:
          randomness.id,

        provider:
          randomness.provider,

        status:
          randomness.status,

        attemptNumber:
          randomness.attemptNumber,

        requestedMin:
          randomness.requestedMin.toString(
            10,
          ),

        requestedMax:
          randomness.requestedMax.toString(
            10,
          ),

        requestedCount:
          randomness.requestedCount,

        requestedAt:
          randomness.requestedAt,

        receivedAt:
          randomness.receivedAt,

        verifiedAt:
          randomness.verifiedAt,

        responseHash:
          randomness.responseHash,

        providerSignature:
          randomness.providerSignature,

        signatureVerified:
          true,

        randomPositions:
          storedPositions.map(
            (position) =>
              position.toString(),
          ),

        signedRandom,
      },

      winnerPositions,

      integrity: {
        responseHashMatches,

        signatureMatchesStoredEvidence,

        requestParametersMatch,

        snapshotBindingMatches,

        randomPositionsMatch,

        winnerPositionsMatch,

        locallyConsistent,
      },
    };
  }

  private async loadPublishedDraw(
    drawId: string,
  ) {
    const draw =
      await this.prisma.lotteryDraw.findFirst({
        where: {
          id:
            drawId,

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

          publicId:
            true,

          status:
            true,

          winnerCount:
            true,

          snapshot: {
            select: {
              status:
                true,

              ticketCount:
                true,

              snapshotHash:
                true,

              merkleRoot:
                true,

              hashAlgorithm:
                true,

              canonicalFormat:
                true,

              finalizedAt:
                true,
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

              providerSignature: {
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

              provider:
                true,

              status:
                true,

              attemptNumber:
                true,

              requestedMin:
                true,

              requestedMax:
                true,

              requestedCount:
                true,

              responsePayload:
                true,

              responseHash:
                true,

              providerSignature:
                true,

              signatureVerified:
                true,

              randomPositions:
                true,

              requestedAt:
                true,

              receivedAt:
                true,

              verifiedAt:
                true,
            },
          },

          winners: {
            orderBy: {
              rank:
                'asc',
            },

            select: {
              rank:
                true,

              randomPosition:
                true,

              snapshotEntry: {
                select: {
                  ticketPublicId:
                    true,
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

    return draw;
  }

  private asObject(
    value: unknown,
  ): JsonObject {
    if (
      !value ||
      typeof value !==
        'object' ||
      Array.isArray(value)
    ) {
      throw new ConflictException(
        'Stored randomness evidence has an invalid JSON structure',
      );
    }

    return value as
      JsonObject;
  }

  private asSignedRandom(
    value: unknown,
  ): RandomOrgSignedRandom {
    const random =
      this.asObject(
        value,
      );

    if (
      typeof random.method !==
        'string' ||
      typeof random.hashedApiKey !==
        'string' ||
      typeof random.n !==
        'number' ||
      typeof random.min !==
        'number' ||
      typeof random.max !==
        'number' ||
      typeof random.replacement !==
        'boolean' ||
      typeof random.base !==
        'number' ||
      !Array.isArray(
        random.data,
      ) ||
      !random.data.every(
        (position) =>
          typeof position ===
            'number' &&
          Number.isSafeInteger(
            position,
          ),
      )
    ) {
      throw new ConflictException(
        'Stored signed randomness object has an invalid structure',
      );
    }

    return random as
      RandomOrgSignedRandom;
  }

  private asNumberArray(
    value: unknown,
  ): number[] {
    if (
      !Array.isArray(
        value,
      ) ||
      !value.every(
        (item) =>
          typeof item ===
            'number' &&
          Number.isSafeInteger(
            item,
          ),
      )
    ) {
      throw new ConflictException(
        'Stored random positions have an invalid structure',
      );
    }

    return value;
  }

  private sameNumbers(
    first: number[],
    second: number[],
  ): boolean {
    return (
      first.length ===
        second.length &&
      first.every(
        (value, index) =>
          value ===
          second[index],
      )
    );
  }
}
