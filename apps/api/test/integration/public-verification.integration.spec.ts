import { ConfigService } from '@nestjs/config';
import {
  DrawStatus,
  DrawType,
  PrismaClient,
  PurchaseStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import {
  DrawPrismaService,
  PrismaService,
} from '../../src/prisma/prisma.service';
import { PublicProofService } from '../../src/snapshots/public-proof.service';
import { PublicVerificationService } from '../../src/snapshots/public-verification.service';
import { SnapshotBuilderService } from '../../src/snapshots/snapshot-builder.service';
import { SnapshotCryptographyService } from '../../src/snapshots/snapshot-cryptography.service';
import { SnapshotFinalizerService } from '../../src/snapshots/snapshot-finalizer.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';
import {
  createTestAdminPrisma,
  createTestDrawPrisma,
} from './database-role.helper';
import {
  ensureTestTicketAllocation,
} from './ticket-fixture.helper';


const OWNER_SECRET =
  'integration-snapshot-owner-secret-at-least-32-bytes';

describe('Public verification integration', () => {
  let prisma: PrismaService;
  let fixturePrisma: PrismaClient;
  let drawPrisma: DrawPrismaService;
  let cryptography: SnapshotCryptographyService;
  let builder: SnapshotBuilderService;
  let finalizer: SnapshotFinalizerService;
  let publicProof: PublicProofService;
  let verification: PublicVerificationService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    fixturePrisma = await createTestAdminPrisma();
    drawPrisma = await createTestDrawPrisma();
    cryptography = new SnapshotCryptographyService();

    builder = new SnapshotBuilderService(
      drawPrisma,
      new ConfigService({
        SNAPSHOT_OWNER_SECRET: OWNER_SECRET,
      }),
    );

    finalizer = new SnapshotFinalizerService(
      drawPrisma,
      cryptography,
    );

    publicProof = new PublicProofService(
      prisma,
      cryptography,
    );

    verification = new PublicVerificationService(
      prisma,
      cryptography,
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
    ]);
  });

  async function createBuiltSnapshot(ticketCount = 4) {
    const user = await fixturePrisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const draw = await fixturePrisma.lotteryDraw.create({
      data: {
        publicId: `W-2026-${randomUUID()}`,
        type: DrawType.WEEKLY,
        status: DrawStatus.SALES_OPEN,
        sequenceNumber: Math.floor(
          Math.random() * 1_000_000,
        ),
        scheduledDrawAt: new Date(
          Date.now() + 86_400_000,
        ),
        currency: 'USD',
        ticketPriceMinor: 100n,
      },
    });

    const purchase = await fixturePrisma.purchase.create({
      data: {
        publicId: `PUR-${randomUUID()}`,
        userId: user.id,
        drawId: draw.id,
        status: PurchaseStatus.COMPLETED,
        requestedTicketCount: ticketCount,
        ticketPriceMinor: 100n,
        totalAmountMinor: BigInt(ticketCount * 100),
        currency: 'USD',
        idempotencyKey: randomUUID(),
        paymentConfirmedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const tickets = [];

    for (
      let index = 1;
      index <= ticketCount;
      index += 1
    ) {
      await ensureTestTicketAllocation(
        fixturePrisma,
        {
          purchaseId: purchase.id,
          drawId: draw.id,
          numberInDraw: BigInt(index),
        },
      );

      tickets.push(
        await fixturePrisma.ticket.create({
          data: {
            publicId: `TKT-${randomUUID()}`,
            userId: user.id,
            purchaseId: purchase.id,
            drawId: draw.id,
            numberInDraw: BigInt(index),
          },
        }),
      );
    }

    await fixturePrisma.lotteryDraw.update({
      where: {
        id: draw.id,
      },
      data: {
        status: DrawStatus.SALES_CLOSED,
      },
    });

    const built = await builder.build(draw.id);

    return {
      user,
      draw,
      purchase,
      tickets,
      built,
    };
  }

  async function createFinalizedSnapshot(ticketCount = 4) {
    const scenario =
      await createBuiltSnapshot(ticketCount);

    const finalized = await finalizer.finalize(
      scenario.draw.id,
    );

    return {
      ...scenario,
      finalized,
    };
  }

  it('verifies a valid proof against the official snapshot', async () => {
    const scenario =
      await createFinalizedSnapshot(4);

    const proof =
      await publicProof.findProofByTicketPublicId(
        scenario.draw.id,
        scenario.tickets[1].publicId,
      );

    const result = await verification.verifyProof(
      scenario.draw.id,
      {
        verificationVersion:
          proof.verificationVersion,
        leafHash: proof.leafHash,
        merkleRoot: proof.merkleRoot,
        proof: proof.proof,
      },
    );

    expect(result).toEqual({
      valid: true,
      reason: 'VERIFIED',
      drawId: scenario.draw.id,
      drawPublicId: scenario.draw.publicId,
      verificationVersion:
        'AMAZING_CHANCE_MERKLE_PROOF_V1',
      hashAlgorithm: 'SHA-256',
      snapshotHash: proof.snapshotHash,
      officialMerkleRoot: proof.merkleRoot,
      suppliedMerkleRoot: proof.merkleRoot,
    });
  });

  it('returns a root mismatch for a different supplied root', async () => {
    const scenario =
      await createFinalizedSnapshot(4);

    const proof =
      await publicProof.findProofByTicketPublicId(
        scenario.draw.id,
        scenario.tickets[0].publicId,
      );

    const suppliedMerkleRoot = 'a'.repeat(64);

    const result = await verification.verifyProof(
      scenario.draw.id,
      {
        verificationVersion:
          proof.verificationVersion,
        leafHash: proof.leafHash,
        merkleRoot: suppliedMerkleRoot,
        proof: proof.proof,
      },
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe(
      'MERKLE_ROOT_MISMATCH',
    );
    expect(result.officialMerkleRoot).toBe(
      proof.merkleRoot,
    );
    expect(result.suppliedMerkleRoot).toBe(
      suppliedMerkleRoot,
    );
  });

  it('returns invalid proof for a modified leaf hash', async () => {
    const scenario =
      await createFinalizedSnapshot(4);

    const proof =
      await publicProof.findProofByTicketPublicId(
        scenario.draw.id,
        scenario.tickets[2].publicId,
      );

    const result = await verification.verifyProof(
      scenario.draw.id,
      {
        verificationVersion:
          proof.verificationVersion,
        leafHash: 'b'.repeat(64),
        merkleRoot: proof.merkleRoot,
        proof: proof.proof,
      },
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe(
      'INVALID_MERKLE_PROOF',
    );
  });

  it('returns invalid proof for a modified sibling hash', async () => {
    const scenario =
      await createFinalizedSnapshot(4);

    const proof =
      await publicProof.findProofByTicketPublicId(
        scenario.draw.id,
        scenario.tickets[2].publicId,
      );

    const corruptedProof = proof.proof.map(
      (node, index) =>
        index === 0
          ? {
              ...node,
              hash: 'c'.repeat(64),
            }
          : node,
    );

    const result = await verification.verifyProof(
      scenario.draw.id,
      {
        verificationVersion:
          proof.verificationVersion,
        leafHash: proof.leafHash,
        merkleRoot: proof.merkleRoot,
        proof: corruptedProof,
      },
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe(
      'INVALID_MERKLE_PROOF',
    );
  });

  it('returns invalid proof for a modified node direction', async () => {
    const scenario =
      await createFinalizedSnapshot(4);

    const proof =
      await publicProof.findProofByTicketPublicId(
        scenario.draw.id,
        scenario.tickets[1].publicId,
      );

    const corruptedProof = proof.proof.map(
      (node, index) =>
        index === 0
          ? {
              ...node,
              side:
                node.side === 'LEFT'
                  ? ('RIGHT' as const)
                  : ('LEFT' as const),
            }
          : node,
    );

    const result = await verification.verifyProof(
      scenario.draw.id,
      {
        verificationVersion:
          proof.verificationVersion,
        leafHash: proof.leafHash,
        merkleRoot: proof.merkleRoot,
        proof: corruptedProof,
      },
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe(
      'INVALID_MERKLE_PROOF',
    );
  });

  it('returns not found for a non-finalized snapshot', async () => {
    const scenario = await createBuiltSnapshot(2);

    await expect(
      verification.verifyProof(
        scenario.draw.id,
        {
          verificationVersion:
            'AMAZING_CHANCE_MERKLE_PROOF_V1',
          leafHash: 'a'.repeat(64),
          merkleRoot: 'b'.repeat(64),
          proof: [],
        },
      ),
    ).rejects.toThrow(
      'Finalized ticket snapshot not found',
    );
  });

  it('returns not found for an unknown draw', async () => {
    await expect(
      verification.verifyProof(
        randomUUID(),
        {
          verificationVersion:
            'AMAZING_CHANCE_MERKLE_PROOF_V1',
          leafHash: 'a'.repeat(64),
          merkleRoot: 'b'.repeat(64),
          proof: [],
        },
      ),
    ).rejects.toThrow(
      'Finalized ticket snapshot not found',
    );
  });
});
