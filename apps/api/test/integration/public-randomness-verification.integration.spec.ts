import { ConfigService } from '@nestjs/config';
import {
  DrawStatus,
  DrawType,
  PurchaseStatus,
  RandomnessStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../src/prisma/prisma.service';
import { sha256CanonicalJson } from '../../src/randomness/randomness-canonical-json.util';
import { PublicRandomnessVerificationService } from '../../src/randomness/public-randomness-verification.service';
import type { RandomOrgSignedRandom } from '../../src/randomness/randomness-evidence.types';
import { SnapshotBuilderService } from '../../src/snapshots/snapshot-builder.service';
import { SnapshotCryptographyService } from '../../src/snapshots/snapshot-cryptography.service';
import { SnapshotFinalizerService } from '../../src/snapshots/snapshot-finalizer.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';
import {
  ensureTestTicketAllocation,
} from './ticket-fixture.helper';


const OWNER_SECRET =
  'integration-public-randomness-owner-secret-at-least-32-bytes';

describe('Public randomness verification integration', () => {
  let prisma: PrismaService;
  let builder: SnapshotBuilderService;
  let finalizer: SnapshotFinalizerService;

  beforeAll(async () => {
    prisma =
      await createTestPrisma();

    builder =
      new SnapshotBuilderService(
        prisma,
        new ConfigService({
          SNAPSHOT_OWNER_SECRET:
            OWNER_SECRET,
        }),
      );

    finalizer =
      new SnapshotFinalizerService(
        prisma,
        new SnapshotCryptographyService(),
      );
  });

  beforeEach(async () => {
    await cleanTestDatabase(
      prisma,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createScenario(
    publish = true,
  ) {
    const user =
      await prisma.user.create({
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
      await prisma.lotteryDraw.create({
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
      await prisma.purchase.create({
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
            3,
          ticketPriceMinor:
            100n,
          totalAmountMinor:
            300n,
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
      index <= 3;
      index += 1
    ) {
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

    await prisma.lotteryDraw.update({
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
      3,
      1,
      2,
    ];

    const signedRandom:
      RandomOrgSignedRandom = {
        method:
          'generateSignedIntegers',
        hashedApiKey:
          'integration-hashed-api-key',
        n: 3,
        min: 1,
        max: 3,
        replacement:
          false,
        base: 10,
        data:
          positions,
        userData: {
          version:
            'AMAZING_CHANCE_RANDOMNESS_BINDING_V1',
          drawId:
            draw.id,
          drawPublicId:
            draw.publicId,
          snapshotHash:
            finalized.snapshotHash,
          merkleRoot:
            finalized.merkleRoot,
          ticketCount:
            '3',
        },
        completionTime:
          '2026-08-07T09:00:00Z',
        serialNumber:
          123,
      };

    const providerSignature =
      'integration-provider-signature';

    const responseHash =
      sha256CanonicalJson(
        signedRandom,
      );

    const randomness =
      await prisma.randomnessEvidence.create({
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
            3n,
          requestedCount:
            3,
          requestPayload: {
            method:
              'generateSignedIntegers',
            n: 3,
            min: 1,
            max: 3,
            replacement:
              false,
          },
          responsePayload:
            JSON.parse(
              JSON.stringify({
                random:
                  signedRandom,
                signature:
                  providerSignature,
              }),
            ),
          responseHash,
          providerSignature,
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

      await prisma.drawWinner.create({
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

    await prisma.lotteryDraw.update({
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
      signedRandom,
      providerSignature,
      responseHash,
    };
  }

  function createService() {
    return {
      service:
        new PublicRandomnessVerificationService(
          prisma,
        ),
    };
  }
  it('publishes a locally consistent signed randomness evidence bundle', async () => {
    const scenario =
      await createScenario();

    const {
      service,
    } = createService();

    const result =
      await service.findEvidence(
        scenario.draw.id,
      );

    expect(
      result.version,
    ).toBe(
      'AMAZING_CHANCE_PUBLIC_RANDOMNESS_V1',
    );

    expect(
      result.draw,
    ).toMatchObject({
      id:
        scenario.draw.id,
      publicId:
        scenario.draw.publicId,
      status:
        DrawStatus.PUBLISHED,
      winnerCount:
        3,
    });

    expect(
      result.evidence,
    ).toMatchObject({
      id:
        scenario.randomness.id,
      provider:
        'RANDOM_ORG',
      status:
        RandomnessStatus.VERIFIED,
      attemptNumber:
        1,
      requestedMin:
        '1',
      requestedMax:
        '3',
      requestedCount:
        3,
      responseHash:
        scenario.responseHash,
      providerSignature:
        scenario.providerSignature,
      signatureVerified:
        true,
      randomPositions: [
        '3',
        '1',
        '2',
      ],
      signedRandom:
        scenario.signedRandom,
    });

    expect(
      result.integrity,
    ).toEqual({
      responseHashMatches:
        true,
      signatureMatchesStoredEvidence:
        true,
      requestParametersMatch:
        true,
      snapshotBindingMatches:
        true,
      randomPositionsMatch:
        true,
      winnerPositionsMatch:
        true,
      locallyConsistent:
        true,
    });

    expect(
      result.winnerPositions.map(
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

  it('detects tampering with the signed snapshot binding', async () => {
    const scenario =
      await createScenario();

    const tamperedRandom = {
      ...scenario.signedRandom,
      userData: {
        ...(scenario.signedRandom
          .userData as Record<
            string,
            unknown
          >),
        snapshotHash:
          'f'.repeat(64),
      },
    };

    await prisma.randomnessEvidence.update({
      where: {
        id:
          scenario.randomness.id,
      },
      data: {
        responsePayload: {
          random:
            tamperedRandom,
          signature:
            scenario.providerSignature,
        },
      },
    });

    const {
      service,
    } = createService();

    const result =
      await service.findEvidence(
        scenario.draw.id,
      );

    expect(
      result.integrity
        .snapshotBindingMatches,
    ).toBe(false);

    expect(
      result.integrity
        .responseHashMatches,
    ).toBe(false);

    expect(
      result.integrity
        .locallyConsistent,
    ).toBe(false);
  });

  it('detects persisted random positions that differ from the signed provider response', async () => {
    const scenario =
      await createScenario();

    await prisma.randomnessEvidence.update({
      where: {
        id:
          scenario.randomness.id,
      },
      data: {
        randomPositions: [
          1,
          2,
          3,
        ],
      },
    });

    const {
      service,
    } = createService();

    const result =
      await service.findEvidence(
        scenario.draw.id,
      );

    expect(
      result.integrity
        .randomPositionsMatch,
    ).toBe(false);

    expect(
      result.integrity
        .locallyConsistent,
    ).toBe(false);
  });

  it('detects winner positions that differ from the signed provider positions', async () => {
    const scenario =
      await createScenario();

    await prisma.drawWinner.update({
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
          99n,
      },
    });

    const {
      service,
    } = createService();

    const result =
      await service.findEvidence(
        scenario.draw.id,
      );

    expect(
      result.integrity
        .winnerPositionsMatch,
    ).toBe(false);

    expect(
      result.integrity
        .locallyConsistent,
    ).toBe(false);
  });

  it('detects a mismatch between payload signature and persisted signature', async () => {
    const scenario =
      await createScenario();

    await prisma.randomnessEvidence.update({
      where: {
        id:
          scenario.randomness.id,
      },
      data: {
        responsePayload:
          JSON.parse(
            JSON.stringify({
              random:
                scenario.signedRandom,
              signature:
                'different-signature',
            }),
          ),
      },
    });

    const {
      service,
    } = createService();

    const result =
      await service.findEvidence(
        scenario.draw.id,
      );

    expect(
      result.integrity
        .signatureMatchesStoredEvidence,
    ).toBe(false);

    expect(
      result.integrity
        .locallyConsistent,
    ).toBe(false);
  });

  it('does not expose randomness evidence before the draw is published', async () => {
    const scenario =
      await createScenario(false);

    const {
      service,
    } = createService();

    await expect(
      service.findEvidence(
        scenario.draw.id,
      ),
    ).rejects.toThrow(
      'Published lottery draw not found',
    );
  });
});
