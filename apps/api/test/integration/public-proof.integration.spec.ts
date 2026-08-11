import { ConfigService } from '@nestjs/config';
import { DrawStatus, DrawType, PurchaseStatus, UserStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../src/prisma/prisma.service';
import { PublicProofService } from '../../src/snapshots/public-proof.service';
import { SnapshotBuilderService } from '../../src/snapshots/snapshot-builder.service';
import { SnapshotCryptographyService } from '../../src/snapshots/snapshot-cryptography.service';
import { SnapshotFinalizerService } from '../../src/snapshots/snapshot-finalizer.service';
import { cleanTestDatabase, createTestPrisma } from './database.helper';
import {
  ensureTestTicketAllocation,
} from './ticket-fixture.helper';


const OWNER_SECRET = 'integration-snapshot-owner-secret-at-least-32-bytes';

describe('Public proof integration', () => {
  let prisma: PrismaService;
  let cryptography: SnapshotCryptographyService;
  let builder: SnapshotBuilderService;
  let finalizer: SnapshotFinalizerService;
  let publicProof: PublicProofService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    cryptography = new SnapshotCryptographyService();
    builder = new SnapshotBuilderService(
      prisma,
      new ConfigService({ SNAPSHOT_OWNER_SECRET: OWNER_SECRET }),
    );
    finalizer = new SnapshotFinalizerService(prisma, cryptography);
    publicProof = new PublicProofService(prisma, cryptography);
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createBuiltSnapshot(ticketCount = 5) {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const draw = await prisma.lotteryDraw.create({
      data: {
        publicId: `W-2026-${randomUUID()}`,
        type: DrawType.WEEKLY,
        status: DrawStatus.SALES_OPEN,
        sequenceNumber: Math.floor(Math.random() * 1_000_000),
        scheduledDrawAt: new Date(Date.now() + 86_400_000),
        currency: 'USD',
        ticketPriceMinor: 100n,
      },
    });

    const purchase = await prisma.purchase.create({
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
    for (let index = 1; index <= ticketCount; index += 1) {
      await ensureTestTicketAllocation(
        prisma,
        {
          purchaseId: purchase.id,
          drawId: draw.id,
          numberInDraw: BigInt(index),
        },
      );

      tickets.push(
        await prisma.ticket.create({
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

    await prisma.lotteryDraw.update({
      where: { id: draw.id },
      data: { status: DrawStatus.SALES_CLOSED },
    });

    const built = await builder.build(draw.id);
    return { user, draw, purchase, tickets, built };
  }

  async function createFinalizedSnapshot(ticketCount = 5) {
    const scenario = await createBuiltSnapshot(ticketCount);
    const finalized = await finalizer.finalize(scenario.draw.id);
    return { ...scenario, finalized };
  }

  it('returns a valid Merkle proof for a finalized ticket', async () => {
    const scenario = await createFinalizedSnapshot(5);
    const targetTicket = scenario.tickets[2];

    const result = await publicProof.findProofByTicketPublicId(
      scenario.draw.id,
      targetTicket.publicId,
    );

    expect(result).toMatchObject({
      drawId: scenario.draw.id,
      drawPublicId: scenario.draw.publicId,
      ticketPublicId: targetTicket.publicId,
      position: '3',
      hashAlgorithm: 'SHA-256',
      canonicalFormat: 'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
      verificationVersion: 'AMAZING_CHANCE_MERKLE_PROOF_V1',
    });

    expect(
      cryptography.verifyMerkleProof(
        result.leafHash,
        result.proof,
        result.merkleRoot,
      ),
    ).toBe(true);
  });

  it('supports the duplicated final leaf in an odd tree', async () => {
    const scenario = await createFinalizedSnapshot(3);
    const result = await publicProof.findProofByTicketPublicId(
      scenario.draw.id,
      scenario.tickets[2].publicId,
    );

    expect(result.proof[0]).toEqual({
      hash: result.leafHash,
      side: 'RIGHT',
    });
    expect(
      cryptography.verifyMerkleProof(
        result.leafHash,
        result.proof,
        result.merkleRoot,
      ),
    ).toBe(true);
  });

  it('does not expose internal IDs or owner references', async () => {
    const scenario = await createFinalizedSnapshot(2);
    const result = await publicProof.findProofByTicketPublicId(
      scenario.draw.id,
      scenario.tickets[0].publicId,
    );

    expect(result).not.toHaveProperty('snapshotId');
    expect(result).not.toHaveProperty('ticketId');
    expect(result).not.toHaveProperty('userId');
    expect(result).not.toHaveProperty('ownerPublicRef');
    expect(result).not.toHaveProperty('entryId');
  });

  it('returns not found for an unknown ticket', async () => {
    const scenario = await createFinalizedSnapshot(2);

    await expect(
      publicProof.findProofByTicketPublicId(
        scenario.draw.id,
        `TKT-${randomUUID()}`,
      ),
    ).rejects.toThrow('Ticket was not found in the finalized snapshot');
  });

  it('returns not found for a non-finalized snapshot', async () => {
    const scenario = await createBuiltSnapshot(2);

    await expect(
      publicProof.findProofByTicketPublicId(
        scenario.draw.id,
        scenario.tickets[0].publicId,
      ),
    ).rejects.toThrow('Finalized ticket snapshot not found');
  });

  it('returns not found for an unknown draw', async () => {
    await expect(
      publicProof.findProofByTicketPublicId(
        randomUUID(),
        `TKT-${randomUUID()}`,
      ),
    ).rejects.toThrow('Finalized ticket snapshot not found');
  });

  it('rejects a finalized snapshot with a corrupted Merkle root', async () => {
    const scenario = await createBuiltSnapshot(3);

    await prisma.$executeRaw`
      UPDATE "ticket_snapshots"
      SET
        "status" = 'FINALIZED'::"SnapshotStatus",
        "snapshotHash" = ${'a'.repeat(64)},
        "merkleRoot" = ${'b'.repeat(64)},
        "finalizedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${scenario.built.snapshotId}::uuid
    `;

    await expect(
      publicProof.findProofByTicketPublicId(
        scenario.draw.id,
        scenario.tickets[0].publicId,
      ),
    ).rejects.toThrow(
      'Stored Merkle root does not match snapshot entries',
    );
  });
});
