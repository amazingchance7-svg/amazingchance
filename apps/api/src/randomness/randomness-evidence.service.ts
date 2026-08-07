import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DrawStatus,
  Prisma,
  RandomnessStatus,
  SnapshotStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import { sha256CanonicalJson } from './randomness-canonical-json.util';
import {
  RANDOMNESS_API_VERSION,
  RANDOMNESS_BINDING_VERSION,
  RANDOMNESS_PROVIDER,
  type RandomnessBinding,
  type RandomOrgSignedResult,
  type VerifiedRandomnessResult,
} from './randomness-evidence.types';
import { RandomOrgSignedClient } from './random-org-signed.client';

@Injectable()
export class RandomnessEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly randomOrg:
      RandomOrgSignedClient,
  ) {}

  async requestAndVerify(
    drawId: string,
  ): Promise<VerifiedRandomnessResult> {
    const existing =
      await this.findVerifiedResult(
        drawId,
      );

    if (existing) {
      return {
        ...existing,
        alreadyVerified: true,
      };
    }

    const prepared =
      await this.prepareRequest(
        drawId,
      );

    let signedResult:
      RandomOrgSignedResult;

    try {
      signedResult =
        await this.randomOrg.generateSignedIntegers(
          {
            count:
              prepared.winnerCount,
            min: 1,
            max:
              prepared.ticketCount,
            binding:
              prepared.binding,
          },
        );
    } catch (error) {
      await this.markFailed(
        prepared.evidenceId,
        prepared.drawId,
        this.errorMessage(error),
      );

      throw error;
    }

    const responseHash =
      this.hashRandomObject(
        signedResult.random,
      );

    await this.prisma.randomnessEvidence.update({
      where: {
        id:
          prepared.evidenceId,
      },
      data: {
        status:
          RandomnessStatus.RECEIVED,
        responsePayload:
          signedResult as unknown as
            Prisma.InputJsonValue,
        responseHash,
        providerSignature:
          signedResult.signature,
        randomPositions:
          signedResult.random
            .data as unknown as
            Prisma.InputJsonValue,
        receivedAt: new Date(),
      },
    });

    const structureValid =
      this.validateProviderResult({
        signedResult,
        binding:
          prepared.binding,
        expectedCount:
          prepared.winnerCount,
        expectedMax:
          prepared.ticketCount,
      });

    if (!structureValid) {
      await this.markRejected(
        prepared.evidenceId,
        prepared.drawId,
        'RANDOM.ORG response did not match the committed draw request',
      );

      throw new ConflictException(
        'Randomness response does not match the committed draw request',
      );
    }

    let authentic: boolean;

    try {
      authentic =
        await this.randomOrg.verifySignature(
          {
            random:
              signedResult.random,
            signature:
              signedResult.signature,
          },
        );
    } catch (error) {
      await this.markFailed(
        prepared.evidenceId,
        prepared.drawId,
        this.errorMessage(error),
      );

      throw error;
    }

    if (!authentic) {
      await this.markRejected(
        prepared.evidenceId,
        prepared.drawId,
        'RANDOM.ORG signature authenticity check failed',
      );

      throw new ConflictException(
        'Randomness provider signature is not authentic',
      );
    }

    const verifiedAt =
      new Date();

    const finalized =
      await this.prisma.$transaction(
        async (tx) => {
          const evidence =
            await tx.randomnessEvidence.update({
              where: {
                id:
                  prepared.evidenceId,
              },
              data: {
                status:
                  RandomnessStatus.VERIFIED,
                signatureVerified:
                  true,
                verifiedAt,
                failureMessage:
                  null,
              },
            });

          const transition =
            await tx.lotteryDraw.updateMany({
              where: {
                id:
                  prepared.drawId,
                status:
                  DrawStatus.RANDOMNESS_PENDING,
              },
              data: {
                status:
                  DrawStatus.RANDOMNESS_VERIFIED,
              },
            });

          if (
            transition.count !== 1
          ) {
            throw new ConflictException(
              'Draw state changed while randomness was being verified',
            );
          }

          return evidence;
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel
              .Serializable,
        },
      );

    return {
      evidenceId:
        finalized.id,
      drawId:
        prepared.drawId,
      drawPublicId:
        prepared.drawPublicId,
      provider:
        finalized.provider,
      attemptNumber:
        finalized.attemptNumber,
      requestedMin:
        finalized.requestedMin.toString(
          10,
        ),
      requestedMax:
        finalized.requestedMax.toString(
          10,
        ),
      requestedCount:
        finalized.requestedCount,
      randomPositions:
        signedResult.random.data.map(
          (value) =>
            value.toString(),
        ),
      responseHash,
      providerSignature:
        signedResult.signature,
      signatureVerified:
        true,
      verifiedAt,
      alreadyVerified:
        false,
    };
  }

  private async prepareRequest(
    drawId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const draw =
          await tx.lotteryDraw.findUnique({
            where: {
              id: drawId,
            },
            include: {
              snapshot: true,
              randomnessRecords: {
                orderBy: {
                  attemptNumber:
                    'desc',
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
          draw.status !==
          DrawStatus.SNAPSHOT_FINALIZED
        ) {
          throw new ConflictException(
            `Randomness cannot be requested for a draw in ${draw.status}`,
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
          throw new ConflictException(
            'A finalized snapshot commitment is required before randomness can be requested',
          );
        }

        if (
          snapshot.ticketCount <
          BigInt(
            draw.winnerCount,
          )
        ) {
          throw new ConflictException(
            'Finalized snapshot does not contain enough tickets for the configured winner count',
          );
        }

        if (
          snapshot.ticketCount >
          BigInt(
            Number.MAX_SAFE_INTEGER,
          )
        ) {
          throw new ConflictException(
            'Snapshot ticket count exceeds the supported randomness range',
          );
        }

        const attemptNumber =
          (draw.randomnessRecords[0]
            ?.attemptNumber ??
            0) + 1;

        const ticketCount =
          Number(
            snapshot.ticketCount,
          );

        const binding:
          RandomnessBinding = {
            version:
              RANDOMNESS_BINDING_VERSION,
            drawId:
              draw.id,
            drawPublicId:
              draw.publicId,
            snapshotHash:
              snapshot.snapshotHash,
            merkleRoot:
              snapshot.merkleRoot,
            ticketCount:
              snapshot.ticketCount.toString(
                10,
              ),
          };

        const requestPayload = {
          apiVersion:
            RANDOMNESS_API_VERSION,
          provider:
            RANDOMNESS_PROVIDER,
          method:
            'generateSignedIntegers',
          n:
            draw.winnerCount,
          min: 1,
          max:
            ticketCount,
          replacement:
            false,
          base: 10,
          userData:
            binding,
        };

        const evidence =
          await tx.randomnessEvidence.create({
            data: {
              drawId:
                draw.id,
              attemptNumber,
              provider:
                RANDOMNESS_PROVIDER,
              status:
                RandomnessStatus.REQUESTED,
              idempotencyKey:
                `randomness:${draw.id}:${attemptNumber}:${randomUUID()}`,
              requestedMin:
                1n,
              requestedMax:
                snapshot.ticketCount,
              requestedCount:
                draw.winnerCount,
              requestPayload:
                JSON.parse(
                  JSON.stringify(
                    requestPayload,
                  ),
                ) as Prisma.InputJsonValue,
              requestedAt:
                new Date(),
            },
          });

        const transition =
          await tx.lotteryDraw.updateMany({
            where: {
              id:
                draw.id,
              status:
                DrawStatus.SNAPSHOT_FINALIZED,
            },
            data: {
              status:
                DrawStatus.RANDOMNESS_PENDING,
            },
          });

        if (
          transition.count !== 1
        ) {
          throw new ConflictException(
            'Draw state changed while randomness request was being prepared',
          );
        }

        return {
          evidenceId:
            evidence.id,
          drawId:
            draw.id,
          drawPublicId:
            draw.publicId,
          winnerCount:
            draw.winnerCount,
          ticketCount,
          binding,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  private validateProviderResult(input: {
    signedResult:
      RandomOrgSignedResult;
    binding:
      RandomnessBinding;
    expectedCount:
      number;
    expectedMax:
      number;
  }): boolean {
    const random =
      input.signedResult.random;

    if (
      random.method !==
        'generateSignedIntegers' ||
      random.n !==
        input.expectedCount ||
      random.min !== 1 ||
      random.max !==
        input.expectedMax ||
      random.replacement !==
        false ||
      random.base !== 10 ||
      !Array.isArray(
        random.data,
      ) ||
      random.data.length !==
        input.expectedCount
    ) {
      return false;
    }

    const unique =
      new Set(
        random.data,
      );

    if (
      unique.size !==
      random.data.length
    ) {
      return false;
    }

    for (
      const value of
      random.data
    ) {
      if (
        !Number.isSafeInteger(
          value,
        ) ||
        value < 1 ||
        value >
          input.expectedMax
      ) {
        return false;
      }
    }

    return this.bindingMatches(
      random.userData,
      input.binding,
    );
  }

  private bindingMatches(
    actual: unknown,
    expected:
      RandomnessBinding,
  ): boolean {
    if (
      !actual ||
      typeof actual !==
        'object' ||
      Array.isArray(actual)
    ) {
      return false;
    }

    const candidate =
      actual as Record<
        string,
        unknown
      >;

    return (
      candidate.version ===
        expected.version &&
      candidate.drawId ===
        expected.drawId &&
      candidate.drawPublicId ===
        expected.drawPublicId &&
      candidate.snapshotHash ===
        expected.snapshotHash &&
      candidate.merkleRoot ===
        expected.merkleRoot &&
      candidate.ticketCount ===
        expected.ticketCount
    );
  }

  private hashRandomObject(
    random:
      RandomOrgSignedResult['random'],
  ): string {
    return sha256CanonicalJson(
      random,
    );
  }

  private async findVerifiedResult(
    drawId: string,
  ): Promise<
    VerifiedRandomnessResult | null
  > {
    const evidence =
      await this.prisma.randomnessEvidence.findFirst({
        where: {
          drawId,
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
          randomPositions: {
            not:
              Prisma.JsonNull,
          },
        },
        orderBy: {
          attemptNumber:
            'desc',
        },
        include: {
          draw: {
            select: {
              publicId:
                true,
            },
          },
        },
      });

    if (
      !evidence ||
      !evidence.responseHash ||
      !evidence.providerSignature ||
      !evidence.verifiedAt ||
      !Array.isArray(
        evidence.randomPositions,
      )
    ) {
      return null;
    }

    const positions =
      evidence.randomPositions;

    if (
      !positions.every(
        (value) =>
          typeof value ===
          'number',
      )
    ) {
      return null;
    }

    return {
      evidenceId:
        evidence.id,
      drawId:
        evidence.drawId,
      drawPublicId:
        evidence.draw.publicId,
      provider:
        evidence.provider,
      attemptNumber:
        evidence.attemptNumber,
      requestedMin:
        evidence.requestedMin.toString(
          10,
        ),
      requestedMax:
        evidence.requestedMax.toString(
          10,
        ),
      requestedCount:
        evidence.requestedCount,
      randomPositions:
        positions.map(
          (value) =>
            value.toString(),
        ),
      responseHash:
        evidence.responseHash,
      providerSignature:
        evidence.providerSignature,
      signatureVerified:
        true,
      verifiedAt:
        evidence.verifiedAt,
      alreadyVerified:
        true,
    };
  }

  private async markRejected(
    evidenceId: string,
    drawId: string,
    message: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.randomnessEvidence.update({
        where: {
          id: evidenceId,
        },
        data: {
          status:
            RandomnessStatus.REJECTED,
          signatureVerified:
            false,
          failureMessage:
            message,
        },
      }),
      this.prisma.lotteryDraw.updateMany({
        where: {
          id: drawId,
          status:
            DrawStatus.RANDOMNESS_PENDING,
        },
        data: {
          status:
            DrawStatus.MANUAL_REVIEW,
        },
      }),
    ]);
  }

  private async markFailed(
    evidenceId: string,
    drawId: string,
    message: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.randomnessEvidence.update({
        where: {
          id: evidenceId,
        },
        data: {
          status:
            RandomnessStatus.FAILED,
          failureMessage:
            message,
        },
      }),
      this.prisma.lotteryDraw.updateMany({
        where: {
          id: drawId,
          status:
            DrawStatus.RANDOMNESS_PENDING,
        },
        data: {
          status:
            DrawStatus.MANUAL_REVIEW,
        },
      }),
    ]);
  }

  private errorMessage(
    error: unknown,
  ): string {
    if (
      error instanceof Error
    ) {
      return error.message.slice(
        0,
        1_000,
      );
    }

    return 'Unknown randomness provider failure';
  }
}
