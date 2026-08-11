import {
  DrawStatus,
  DrawType,
  RandomnessStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('SEC-005 immutable randomness and winners', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createRandomness() {
    const draw =
      await prisma.lotteryDraw.create({
        data: {
          publicId:
            `W-${randomUUID()}`,
          type:
            DrawType.WEEKLY,
          status:
            DrawStatus.RANDOMNESS_VERIFIED,
          sequenceNumber:
            Math.floor(
              Math.random() *
                1_000_000_000,
            ),
          scheduledDrawAt:
            new Date(
              Date.now() +
                60_000,
            ),
          ticketPriceMinor: 100n,
          winnerCount: 1,
        },
      });

    const evidence =
      await prisma.randomnessEvidence.create({
        data: {
          drawId: draw.id,
          attemptNumber: 1,
          provider: 'RANDOM_ORG',
          status:
            RandomnessStatus.VERIFIED,
          idempotencyKey:
            randomUUID(),
          requestedMin: 1n,
          requestedMax: 1n,
          requestedCount: 1,
          requestPayload: {
            n: 1,
            min: 1,
            max: 1,
          },
          responsePayload: {
            random: {
              data: [1],
            },
            signature:
              'provider-signature',
          },
          responseHash:
            'a'.repeat(64),
          providerSignature:
            'provider-signature',
          signatureVerified: true,
          randomPositions: [1],
          requestedAt:
            new Date(),
          receivedAt:
            new Date(),
          verifiedAt:
            new Date(),
        },
      });

    return {
      draw,
      evidence,
    };
  }

  it('prevents modifying verified randomness evidence', async () => {
    const { evidence } =
      await createRandomness();

    await expect(
      prisma.randomnessEvidence.update({
        where: {
          id: evidence.id,
        },
        data: {
          randomPositions: [2],
        },
      }),
    ).rejects.toThrow(
      'Terminal randomness evidence is immutable',
    );
  });

  it('prevents deleting randomness evidence', async () => {
    const { evidence } =
      await createRandomness();

    await expect(
      prisma.randomnessEvidence.delete({
        where: {
          id: evidence.id,
        },
      }),
    ).rejects.toThrow(
      'Randomness evidence cannot be deleted',
    );
  });

  it('prevents modifying committed request identity before terminal state', async () => {
    const draw =
      await prisma.lotteryDraw.create({
        data: {
          publicId:
            `W-${randomUUID()}`,
          type:
            DrawType.WEEKLY,
          status:
            DrawStatus.RANDOMNESS_PENDING,
          sequenceNumber:
            Math.floor(
              Math.random() *
                1_000_000_000,
            ),
          scheduledDrawAt:
            new Date(
              Date.now() +
                60_000,
            ),
          ticketPriceMinor: 100n,
          winnerCount: 1,
        },
      });

    const evidence =
      await prisma.randomnessEvidence.create({
        data: {
          drawId: draw.id,
          attemptNumber: 1,
          status:
            RandomnessStatus.REQUESTED,
          idempotencyKey:
            randomUUID(),
          requestedMin: 1n,
          requestedMax: 10n,
          requestedCount: 1,
          requestPayload: {
            n: 1,
            min: 1,
            max: 10,
          },
          requestedAt:
            new Date(),
        },
      });

    await expect(
      prisma.randomnessEvidence.update({
        where: {
          id: evidence.id,
        },
        data: {
          requestedMax: 11n,
        },
      }),
    ).rejects.toThrow(
      'Committed randomness request fields are immutable',
    );
  });
});
