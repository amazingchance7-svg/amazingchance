import {
  DrawStatus,
  DrawType,
  PrismaClient,
  PurchaseStatus,
  SnapshotStatus,
  TicketStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import {
  PaymentPrismaService,
  PrismaService,
} from '../../src/prisma/prisma.service';
import { TicketsQueryService } from '../../src/tickets/tickets-query.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';
import {
  createTestAdminPrisma,
  createTestPaymentPrisma,
} from './database-role.helper';
import {
  ensureTestTicketAllocation,
} from './ticket-fixture.helper';


describe('Issued tickets query integration', () => {
  let prisma: PrismaService;
  let fixturePrisma: PrismaClient;
  let paymentPrisma: PaymentPrismaService;
  let service: TicketsQueryService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    fixturePrisma = await createTestAdminPrisma();
    paymentPrisma = await createTestPaymentPrisma();
    service = new TicketsQueryService(prisma);
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await Promise.all([
      prisma.$disconnect(),
      fixturePrisma.$disconnect(),
      paymentPrisma.$disconnect(),
    ]);
  });

  async function createUser() {
    return fixturePrisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });
  }

  async function createDraw() {
    return fixturePrisma.lotteryDraw.create({
      data: {
        publicId: `DRAW-${randomUUID()}`,
        type: DrawType.WEEKLY,
        status: DrawStatus.SALES_OPEN,
        sequenceNumber: Math.floor(Math.random() * 1_000_000_000),
        participationYear: 2026,
        salesOpenAt: new Date(Date.now() - 60_000),
        salesCloseAt: new Date(Date.now() + 3_600_000),
        scheduledDrawAt: new Date(Date.now() + 86_400_000),
        currency: 'USD',
        ticketPriceMinor: 100n,
      },
    });
  }

  async function createPurchase(userId: string, drawId: string) {
    return fixturePrisma.purchase.create({
      data: {
        publicId: `PUR-${randomUUID()}`,
        userId,
        drawId,
        status: PurchaseStatus.COMPLETED,
        requestedTicketCount: 2,
        ticketPriceMinor: 100n,
        totalAmountMinor: 200n,
        currency: 'USD',
        idempotencyKey: `test-${randomUUID()}`,
        paymentConfirmedAt: new Date(),
        completedAt: new Date(),
      },
    });
  }

  async function createTicket(input: {
    userId: string;
    purchaseId: string;
    drawId: string;
    numberInDraw: bigint;
  }) {
    await ensureTestTicketAllocation(
      fixturePrisma,
      {
        purchaseId: input.purchaseId,
        drawId: input.drawId,
        numberInDraw: input.numberInDraw,
      },
    );

    return paymentPrisma.ticket.create({
      data: {
        publicId: `TKT-${randomUUID()}`,
        userId: input.userId,
        purchaseId: input.purchaseId,
        drawId: input.drawId,
        numberInDraw: input.numberInDraw,
      },
    });
  }

  it('returns only tickets owned by the authenticated user', async () => {
    const owner = await createUser();
    const other = await createUser();
    const draw = await createDraw();

    const ownerPurchase = await createPurchase(owner.id, draw.id);
    const otherPurchase = await createPurchase(other.id, draw.id);

    const ownerTicket = await createTicket({
      userId: owner.id,
      purchaseId: ownerPurchase.id,
      drawId: draw.id,
      numberInDraw: 11n,
    });

    await createTicket({
      userId: other.id,
      purchaseId: otherPurchase.id,
      drawId: draw.id,
      numberInDraw: 12n,
    });

    const result = await service.findMine(owner.id);

    expect(result.tickets).toHaveLength(1);
    expect(result.tickets[0]?.publicId).toBe(ownerTicket.publicId);
    expect(result.tickets[0]?.numberInDraw).toBe('11');
  });

  it('returns all tickets for an owned purchase ordered by draw number', async () => {
    const user = await createUser();
    const draw = await createDraw();
    const purchase = await createPurchase(user.id, draw.id);

    await fixturePrisma.ticketAllocation.create({
      data: {
        purchaseId: purchase.id,
        drawId: draw.id,
        startNumber: 21n,
        endNumber: 22n,
        correlationId: randomUUID(),
      },
    });
    await createTicket({
      userId: user.id,
      purchaseId: purchase.id,
      drawId: draw.id,
      numberInDraw: 22n,
    });

    await createTicket({
      userId: user.id,
      purchaseId: purchase.id,
      drawId: draw.id,
      numberInDraw: 21n,
    });

    const result = await service.findForPurchase(user.id, purchase.id);

    expect(result.purchase.id).toBe(purchase.id);
    expect(result.tickets.map((ticket) => ticket.numberInDraw)).toEqual([
      '21',
      '22',
    ]);
  });

  it('does not disclose another users purchase or tickets', async () => {
    const owner = await createUser();
    const other = await createUser();
    const draw = await createDraw();
    const purchase = await createPurchase(owner.id, draw.id);

    await createTicket({
      userId: owner.id,
      purchaseId: purchase.id,
      drawId: draw.id,
      numberInDraw: 44n,
    });

    await expect(
      service.findForPurchase(other.id, purchase.id),
    ).rejects.toThrow('Purchase not found');
  });

  it('serializes a legally voided ticket without losing refund audit data', async () => {
    const user = await createUser();
    const draw = await createDraw();
    const purchase = await createPurchase(user.id, draw.id);

    const ticket = await createTicket({
      userId: user.id,
      purchaseId: purchase.id,
      drawId: draw.id,
      numberInDraw: 99n,
    });

    const voidedAt = new Date();

    await paymentPrisma.ticket.update({
      where: {
        id: ticket.id,
      },
      data: {
        status: TicketStatus.VOIDED_BY_REFUND,
        voidedAt,
        voidReason: 'PAYMENT_REFUNDED',
      },
    });

    const result = await service.findForPurchase(user.id, purchase.id);

    expect(result.tickets[0]?.status).toBe(TicketStatus.VOIDED_BY_REFUND);
    expect(result.tickets[0]?.voidedAt).toEqual(voidedAt);
    expect(result.tickets[0]?.voidReason).toBe('PAYMENT_REFUNDED');
  });

  it('marks public verification available only after an issued ticket is snapshotted and its draw is published', async () => {
    const user = await createUser();
    const draw = await createDraw();
    const purchase = await createPurchase(user.id, draw.id);

    const ticket = await createTicket({
      userId: user.id,
      purchaseId: purchase.id,
      drawId: draw.id,
      numberInDraw: 7n,
    });

    const builtAt = new Date();

    const snapshot = await fixturePrisma.ticketSnapshot.create({
      data: {
        drawId: draw.id,
        status: SnapshotStatus.BUILDING,
        ticketCount: 1n,
        canonicalFormat: 'test',
        builtAt,
      },
    });

    await fixturePrisma.ticketSnapshotEntry.create({
      data: {
        snapshotId: snapshot.id,
        ticketId: ticket.id,
        position: 1n,
        ticketPublicId: ticket.publicId,
        ownerPublicRef: `owner-${randomUUID()}`,
      },
    });

    await fixturePrisma.ticketSnapshot.update({
      where: {
        id: snapshot.id,
      },
      data: {
        status: SnapshotStatus.FINALIZED,
        snapshotHash: 'a'.repeat(64),
        merkleRoot: 'b'.repeat(64),
        finalizedAt: new Date(),
      },
    });

    await fixturePrisma.lotteryDraw.update({
      where: {
        id: draw.id,
      },
      data: {
        status: DrawStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    const result = await service.findForPurchase(user.id, purchase.id);

    expect(result.tickets[0]?.verification).toEqual({
      includedInSnapshot: true,
      snapshotPosition: '1',
      publicVerificationAvailable: true,
    });
  });
});
