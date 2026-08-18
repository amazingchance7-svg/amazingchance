import {
  DrawStatus,
  DrawType,
  PrismaClient,
  PurchaseStatus,
  TicketStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import {
  PaymentPrismaService,
  PrismaService,
} from '../../src/prisma/prisma.service';
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


describe('Immutable tickets integration', () => {
  let prisma: PrismaService;
  let fixturePrisma: PrismaClient;
  let paymentPrisma: PaymentPrismaService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    fixturePrisma = await createTestAdminPrisma();
    paymentPrisma = await createTestPaymentPrisma();
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

  async function createTicket() {
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
        sequenceNumber: Math.floor(Math.random() * 1_000_000),
        scheduledDrawAt: new Date(Date.now() + 86_400_000),
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
        requestedTicketCount: 1,
        ticketPriceMinor: 100n,
        totalAmountMinor: 100n,
        currency: 'USD',
        idempotencyKey: randomUUID(),
        paymentConfirmedAt: new Date(),
        completedAt: new Date(),
      },
    });

    await ensureTestTicketAllocation(
      fixturePrisma,
      {
        purchaseId: purchase.id,
        drawId: draw.id,
        numberInDraw: 1n,
      },
    );

    const ticket = await fixturePrisma.ticket.create({
      data: {
        publicId: `TKT-${randomUUID()}`,
        userId: user.id,
        purchaseId: purchase.id,
        drawId: draw.id,
        numberInDraw: 1n,
      },
    });

    return { user, draw, purchase, ticket };
  }

  it('prevents deleting a ticket', async () => {
    const { ticket } = await createTicket();

    await expect(
      fixturePrisma.ticket.delete({
        where: { id: ticket.id },
      }),
    ).rejects.toThrow('Tickets are immutable and cannot be deleted');

    expect(
      await prisma.ticket.count({
        where: { id: ticket.id },
      }),
    ).toBe(1);
  });

  it('prevents changing publicId', async () => {
    const { ticket } = await createTicket();

    await expect(
      paymentPrisma.ticket.update({
        where: { id: ticket.id },
        data: { publicId: `TKT-${randomUUID()}` },
      }),
    ).rejects.toThrow(
      'Immutable ticket identity fields cannot be changed',
    );
  });

  it('prevents changing userId', async () => {
    const { ticket } = await createTicket();

    await expect(
      paymentPrisma.ticket.update({
        where: { id: ticket.id },
        data: { userId: randomUUID() },
      }),
    ).rejects.toThrow(
      'Immutable ticket identity fields cannot be changed',
    );
  });

  it('prevents changing purchaseId', async () => {
    const { ticket } = await createTicket();

    await expect(
      paymentPrisma.ticket.update({
        where: { id: ticket.id },
        data: { purchaseId: randomUUID() },
      }),
    ).rejects.toThrow(
      'Immutable ticket identity fields cannot be changed',
    );
  });

  it('prevents changing drawId', async () => {
    const { ticket } = await createTicket();

    await expect(
      paymentPrisma.ticket.update({
        where: { id: ticket.id },
        data: { drawId: randomUUID() },
      }),
    ).rejects.toThrow(
      'Immutable ticket identity fields cannot be changed',
    );
  });

  it('prevents changing numberInDraw', async () => {
    const { ticket } = await createTicket();

    await expect(
      paymentPrisma.ticket.update({
        where: { id: ticket.id },
        data: { numberInDraw: 999n },
      }),
    ).rejects.toThrow(
      'Immutable ticket identity fields cannot be changed',
    );
  });

  it('prevents changing issuedAt', async () => {
    const { ticket } = await createTicket();

    await expect(
      paymentPrisma.ticket.update({
        where: { id: ticket.id },
        data: { issuedAt: new Date(Date.now() + 1_000) },
      }),
    ).rejects.toThrow(
      'Immutable ticket identity fields cannot be changed',
    );
  });

  it('allows ACTIVE to VOIDED_BY_REFUND with audit data', async () => {
    const { ticket } = await createTicket();
    const voidedAt = new Date();

    const updated = await paymentPrisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: TicketStatus.VOIDED_BY_REFUND,
        voidedAt,
        voidReason: 'PAYMENT_REFUNDED',
      },
    });

    expect(updated.status).toBe(TicketStatus.VOIDED_BY_REFUND);
    expect(updated.voidedAt).toEqual(voidedAt);
    expect(updated.voidReason).toBe('PAYMENT_REFUNDED');
  });

  it('rejects voiding without voidedAt', async () => {
    const { ticket } = await createTicket();

    await expect(
      paymentPrisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: TicketStatus.VOIDED_BY_REFUND,
          voidReason: 'PAYMENT_REFUNDED',
        },
      }),
    ).rejects.toThrow(
      'Voiding a ticket requires voidedAt and voidReason',
    );
  });

  it('rejects voiding without a non-empty reason', async () => {
    const { ticket } = await createTicket();

    await expect(
      paymentPrisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: TicketStatus.VOIDED_BY_REFUND,
          voidedAt: new Date(),
          voidReason: '   ',
        },
      }),
    ).rejects.toThrow(
      'Voiding a ticket requires voidedAt and voidReason',
    );
  });

  it('rejects modifying an active ticket without voiding it', async () => {
    const { ticket } = await createTicket();

    await expect(
      paymentPrisma.ticket.update({
        where: { id: ticket.id },
        data: { voidReason: 'INVALID_DIRECT_CHANGE' },
      }),
    ).rejects.toThrow(
      'The only permitted ticket transition is ACTIVE to VOIDED_BY_REFUND',
    );
  });

  it('prevents any modification after a ticket is voided', async () => {
    const { ticket } = await createTicket();

    await paymentPrisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: TicketStatus.VOIDED_BY_REFUND,
        voidedAt: new Date(),
        voidReason: 'PAYMENT_REFUNDED',
      },
    });

    await expect(
      paymentPrisma.ticket.update({
        where: { id: ticket.id },
        data: {
          status: TicketStatus.ACTIVE,
          voidedAt: null,
          voidReason: null,
        },
      }),
    ).rejects.toThrow('A voided ticket cannot be modified');
  });

  it('preserves unique ticket numbers within a draw', async () => {
    const { user, draw, purchase } = await createTicket();

    await ensureTestTicketAllocation(
      fixturePrisma,
      {
        purchaseId: purchase.id,
        drawId: draw.id,
        numberInDraw: 1n,
      },
    );

    await expect(
      paymentPrisma.ticket.create({
        data: {
          publicId: `TKT-${randomUUID()}`,
          userId: user.id,
          purchaseId: purchase.id,
          drawId: draw.id,
          numberInDraw: 1n,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
