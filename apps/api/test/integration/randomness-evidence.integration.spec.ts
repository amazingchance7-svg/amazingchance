import {
  DrawStatus,
  DrawType,
  RandomnessStatus,
  SnapshotStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../src/prisma/prisma.service';
import { RandomnessEvidenceService } from '../../src/randomness/randomness-evidence.service';
import type { RandomOrgSignedResult } from '../../src/randomness/randomness-evidence.types';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('RandomnessEvidenceService integration', () => {
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

  async function createFinalizedDraw() {
    const draw =
      await prisma.lotteryDraw.create({
        data: {
          publicId:
            `W-${randomUUID()}`,
          type: DrawType.WEEKLY,
          status:
            DrawStatus.SNAPSHOT_FINALIZED,
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
          currency: 'USD',
          ticketPriceMinor: 100n,
          winnerCount: 3,
        },
      });

    const snapshot =
      await prisma.ticketSnapshot.create({
        data: {
          drawId: draw.id,
          status:
            SnapshotStatus.FINALIZED,
          ticketCount: 10n,
          canonicalFormat:
            'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
          hashAlgorithm:
            'SHA-256',
          snapshotHash:
            'a'.repeat(64),
          merkleRoot:
            'b'.repeat(64),
          builtAt:
            new Date(
              Date.now() -
                2_000,
            ),
          finalizedAt:
            new Date(
              Date.now() -
                1_000,
            ),
        },
      });

    return {
      draw,
      snapshot,
    };
  }

  function createSignedResult(input: {
    drawId: string;
    drawPublicId: string;
    snapshotHash: string;
    merkleRoot: string;
    positions?: number[];
  }): RandomOrgSignedResult {
    return {
      random: {
        method:
          'generateSignedIntegers',
        hashedApiKey:
          'hashed-api-key',
        n: 3,
        min: 1,
        max: 10,
        replacement: false,
        base: 10,
        data:
          input.positions ?? [
            7,
            2,
            9,
          ],
        userData: {
          version:
            'AMAZING_CHANCE_RANDOMNESS_BINDING_V1',
          drawId:
            input.drawId,
          drawPublicId:
            input.drawPublicId,
          snapshotHash:
            input.snapshotHash,
          merkleRoot:
            input.merkleRoot,
          ticketCount:
            '10',
        },
        completionTime:
          '2026-08-07T09:00:00Z',
        serialNumber: 1,
      },
      signature:
        'provider-signature',
      bitsUsed: 16,
      bitsLeft: 100000,
      requestsLeft: 999,
      advisoryDelay: 1000,
    };
  }

  function createService(input?: {
    generateResult?:
      RandomOrgSignedResult;
    signatureAuthentic?:
      boolean;
    generateError?:
      Error;
  }) {
    const randomOrg = {
      generateSignedIntegers:
        jest.fn(),
      verifySignature:
        jest.fn(),
    };

    if (input?.generateError) {
      randomOrg.generateSignedIntegers
        .mockRejectedValue(
          input.generateError,
        );
    } else {
      randomOrg.generateSignedIntegers
        .mockResolvedValue(
          input?.generateResult,
        );
    }

    randomOrg.verifySignature
      .mockResolvedValue(
        input?.signatureAuthentic ??
          true,
      );

    return {
      service:
        new RandomnessEvidenceService(
          prisma,
          randomOrg as never,
        ),
      randomOrg,
    };
  }

  it('requests, verifies, persists and binds randomness to the finalized snapshot', async () => {
    const {
      draw,
      snapshot,
    } =
      await createFinalizedDraw();

    const signedResult =
      createSignedResult({
        drawId: draw.id,
        drawPublicId:
          draw.publicId,
        snapshotHash:
          snapshot.snapshotHash!,
        merkleRoot:
          snapshot.merkleRoot!,
      });

    const {
      service,
      randomOrg,
    } = createService({
      generateResult:
        signedResult,
    });

    const result =
      await service.requestAndVerify(
        draw.id,
      );

    expect(result).toMatchObject({
      drawId: draw.id,
      drawPublicId:
        draw.publicId,
      provider:
        'RANDOM_ORG',
      attemptNumber: 1,
      requestedMin: '1',
      requestedMax: '10',
      requestedCount: 3,
      randomPositions: [
        '7',
        '2',
        '9',
      ],
      providerSignature:
        'provider-signature',
      signatureVerified:
        true,
      alreadyVerified:
        false,
    });

    expect(
      result.responseHash,
    ).toMatch(
      /^[a-f0-9]{64}$/,
    );

    expect(
      randomOrg.generateSignedIntegers,
    ).toHaveBeenCalledWith({
      count: 3,
      min: 1,
      max: 10,
      binding: {
        version:
          'AMAZING_CHANCE_RANDOMNESS_BINDING_V1',
        drawId: draw.id,
        drawPublicId:
          draw.publicId,
        snapshotHash:
          snapshot.snapshotHash,
        merkleRoot:
          snapshot.merkleRoot,
        ticketCount: '10',
      },
    });

    expect(
      randomOrg.verifySignature,
    ).toHaveBeenCalledWith({
      random:
        signedResult.random,
      signature:
        signedResult.signature,
    });

    const storedEvidence =
      await prisma.randomnessEvidence.findUniqueOrThrow({
        where: {
          id:
            result.evidenceId,
        },
      });

    expect(
      storedEvidence.status,
    ).toBe(
      RandomnessStatus.VERIFIED,
    );

    expect(
      storedEvidence.signatureVerified,
    ).toBe(true);

    expect(
      storedEvidence.responseHash,
    ).toBe(
      result.responseHash,
    );

    expect(
      storedEvidence.providerSignature,
    ).toBe(
      'provider-signature',
    );

    expect(
      storedEvidence.randomPositions,
    ).toEqual([
      7,
      2,
      9,
    ]);

    expect(
      storedEvidence.requestPayload,
    ).toMatchObject({
      apiVersion:
        'RANDOM_ORG_SIGNED_API_V4',
      provider:
        'RANDOM_ORG',
      method:
        'generateSignedIntegers',
      n: 3,
      min: 1,
      max: 10,
      replacement: false,
      base: 10,
      userData: {
        drawId:
          draw.id,
        drawPublicId:
          draw.publicId,
        snapshotHash:
          snapshot.snapshotHash,
        merkleRoot:
          snapshot.merkleRoot,
        ticketCount:
          '10',
      },
    });

    const updatedDraw =
      await prisma.lotteryDraw.findUniqueOrThrow({
        where: {
          id: draw.id,
        },
      });

    expect(
      updatedDraw.status,
    ).toBe(
      DrawStatus.RANDOMNESS_VERIFIED,
    );
  });

  it('returns the existing verified evidence without contacting the provider again', async () => {
    const {
      draw,
      snapshot,
    } =
      await createFinalizedDraw();

    const firstSignedResult =
      createSignedResult({
        drawId: draw.id,
        drawPublicId:
          draw.publicId,
        snapshotHash:
          snapshot.snapshotHash!,
        merkleRoot:
          snapshot.merkleRoot!,
      });

    const first =
      createService({
        generateResult:
          firstSignedResult,
      });

    const firstResult =
      await first.service.requestAndVerify(
        draw.id,
      );

    const replay =
      createService({
        generateError:
          new Error(
            'Provider must not be called',
          ),
      });

    const replayResult =
      await replay.service.requestAndVerify(
        draw.id,
      );

    expect(
      replayResult.evidenceId,
    ).toBe(
      firstResult.evidenceId,
    );

    expect(
      replayResult.alreadyVerified,
    ).toBe(true);

    expect(
      replay.randomOrg
        .generateSignedIntegers,
    ).not.toHaveBeenCalled();

    expect(
      replay.randomOrg
        .verifySignature,
    ).not.toHaveBeenCalled();

    const evidenceCount =
      await prisma.randomnessEvidence.count({
        where: {
          drawId:
            draw.id,
        },
      });

    expect(
      evidenceCount,
    ).toBe(1);
  });

  it('rejects randomness that is not bound to the finalized snapshot', async () => {
    const {
      draw,
      snapshot,
    } =
      await createFinalizedDraw();

    const signedResult =
      createSignedResult({
        drawId: draw.id,
        drawPublicId:
          draw.publicId,
        snapshotHash:
          'c'.repeat(64),
        merkleRoot:
          snapshot.merkleRoot!,
      });

    const {
      service,
    } = createService({
      generateResult:
        signedResult,
    });

    await expect(
      service.requestAndVerify(
        draw.id,
      ),
    ).rejects.toThrow(
      'Randomness response does not match the committed draw request',
    );

    const evidence =
      await prisma.randomnessEvidence.findFirstOrThrow({
        where: {
          drawId:
            draw.id,
        },
      });

    expect(
      evidence.status,
    ).toBe(
      RandomnessStatus.REJECTED,
    );

    expect(
      evidence.signatureVerified,
    ).toBe(false);

    const updatedDraw =
      await prisma.lotteryDraw.findUniqueOrThrow({
        where: {
          id: draw.id,
        },
      });

    expect(
      updatedDraw.status,
    ).toBe(
      DrawStatus.MANUAL_REVIEW,
    );
  });

  it('rejects a provider response whose signature is not authentic', async () => {
    const {
      draw,
      snapshot,
    } =
      await createFinalizedDraw();

    const signedResult =
      createSignedResult({
        drawId: draw.id,
        drawPublicId:
          draw.publicId,
        snapshotHash:
          snapshot.snapshotHash!,
        merkleRoot:
          snapshot.merkleRoot!,
      });

    const {
      service,
    } = createService({
      generateResult:
        signedResult,
      signatureAuthentic:
        false,
    });

    await expect(
      service.requestAndVerify(
        draw.id,
      ),
    ).rejects.toThrow(
      'Randomness provider signature is not authentic',
    );

    const evidence =
      await prisma.randomnessEvidence.findFirstOrThrow({
        where: {
          drawId:
            draw.id,
        },
      });

    expect(
      evidence.status,
    ).toBe(
      RandomnessStatus.REJECTED,
    );

    expect(
      evidence.signatureVerified,
    ).toBe(false);

    const updatedDraw =
      await prisma.lotteryDraw.findUniqueOrThrow({
        where: {
          id: draw.id,
        },
      });

    expect(
      updatedDraw.status,
    ).toBe(
      DrawStatus.MANUAL_REVIEW,
    );
  });

  it('records provider failure and moves the draw to manual review', async () => {
    const {
      draw,
    } =
      await createFinalizedDraw();

    const {
      service,
    } = createService({
      generateError:
        new Error(
          'RANDOM.ORG unavailable',
        ),
    });

    await expect(
      service.requestAndVerify(
        draw.id,
      ),
    ).rejects.toThrow(
      'RANDOM.ORG unavailable',
    );

    const evidence =
      await prisma.randomnessEvidence.findFirstOrThrow({
        where: {
          drawId:
            draw.id,
        },
      });

    expect(
      evidence.status,
    ).toBe(
      RandomnessStatus.FAILED,
    );

    expect(
      evidence.failureMessage,
    ).toBe(
      'RANDOM.ORG unavailable',
    );

    const updatedDraw =
      await prisma.lotteryDraw.findUniqueOrThrow({
        where: {
          id: draw.id,
        },
      });

    expect(
      updatedDraw.status,
    ).toBe(
      DrawStatus.MANUAL_REVIEW,
    );
  });

  it('refuses randomness before the snapshot is finalized', async () => {
    const draw =
      await prisma.lotteryDraw.create({
        data: {
          publicId:
            `W-${randomUUID()}`,
          type: DrawType.WEEKLY,
          status:
            DrawStatus.SALES_CLOSED,
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
          currency: 'USD',
          ticketPriceMinor: 100n,
          winnerCount: 3,
        },
      });

    const {
      service,
      randomOrg,
    } = createService();

    await expect(
      service.requestAndVerify(
        draw.id,
      ),
    ).rejects.toThrow(
      'Randomness cannot be requested for a draw in SALES_CLOSED',
    );

    expect(
      randomOrg.generateSignedIntegers,
    ).not.toHaveBeenCalled();

    expect(
      await prisma.randomnessEvidence.count({
        where: {
          drawId:
            draw.id,
        },
      }),
    ).toBe(0);
  });
});
