import {
  DrawStatus,
  DrawType,
  PaymentStatus,
  PurchaseStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { LedgerService } from '../../src/ledger/ledger.service';
import { PaymentOrchestratorService } from '../../src/payments/payment-orchestrator.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TicketAllocationService } from '../../src/tickets/ticket-allocation.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('Verified payment orchestration integration', () => {
  let prisma: PrismaService;
  let service: PaymentOrchestratorService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    service = new PaymentOrchestratorService(
      prisma,
      new LedgerService(prisma),
      new TicketAllocationService(),
    );
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function scenario(
    ticketCount = 3,
    options?: {
      purchaseStatus?: PurchaseStatus;
      paymentStatus?: PaymentStatus;
      drawStatus?: DrawStatus;
      paymentAmountMinor?: bigint;
      paymentCurrency?: string;
    },
  ) {
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
        status: options?.drawStatus ?? DrawStatus.SALES_OPEN,
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
        status:
          options?.purchaseStatus ?? PurchaseStatus.PAYMENT_PENDING,
        requestedTicketCount: ticketCount,
        ticketPriceMinor: 100n,
        totalAmountMinor: BigInt(ticketCount) * 100n,
        currency: 'USD',
        idempotencyKey: randomUUID(),
      },
    });

    const payment = await prisma.payment.create({
      data: {
        purchaseId: purchase.id,
        provider: 'TEST',
        providerTransactionId: randomUUID(),
        status: options?.paymentStatus ?? PaymentStatus.SUCCEEDED,
        amountMinor:
          options?.paymentAmountMinor ??
          BigInt(ticketCount) * 100n,
        currency: options?.paymentCurrency ?? 'USD',
        confirmedAt: new Date(),
      },
    });

    return { user, draw, purchase, payment };
  }

  async function expectNoOrchestrationSideEffects(
    purchaseId: string,
  ): Promise<void> {
    expect(
      (
        await prisma.purchase.findUniqueOrThrow({
          where: { id: purchaseId },
        })
      ).status,
    ).not.toBe(PurchaseStatus.COMPLETED);

    expect(await prisma.ledgerTransaction.count()).toBe(0);
    expect(await prisma.ticketAllocation.count()).toBe(0);
    expect(await prisma.ticket.count()).toBe(0);
    expect(await prisma.purchaseStateEvent.count()).toBe(0);
  }

  it('commits ledger, purchase, allocation and tickets atomically', async () => {
    const s = await scenario(3);

    const result = await service.confirmPayment(s.payment.id);

    expect(result.ticketCount).toBe(3);
    expect(
      (
        await prisma.purchase.findUniqueOrThrow({
          where: { id: s.purchase.id },
        })
      ).status,
    ).toBe(PurchaseStatus.COMPLETED);
    expect(await prisma.ledgerTransaction.count()).toBe(1);
    expect(await prisma.ticketAllocation.count()).toBe(1);
    expect(await prisma.purchaseStateEvent.count()).toBe(1);

    const tickets = await prisma.ticket.findMany({
      where: { purchaseId: s.purchase.id },
      orderBy: { numberInDraw: 'asc' },
    });

    expect(
      tickets.map((ticket) => ticket.numberInDraw.toString()),
    ).toEqual(['1', '2', '3']);
  });

  it('is idempotent for a repeated confirmation', async () => {
    const s = await scenario(2);

    const first = await service.confirmPayment(s.payment.id);
    const second = await service.confirmPayment(s.payment.id);

    expect(second.alreadyProcessed).toBe(true);
    expect(second.ledgerTransactionId).toBe(
      first.ledgerTransactionId,
    );
    expect(await prisma.ledgerTransaction.count()).toBe(1);
    expect(await prisma.ticketAllocation.count()).toBe(1);
    expect(await prisma.ticket.count()).toBe(2);
    expect(await prisma.purchaseStateEvent.count()).toBe(1);
  });

  it('is safe for concurrent repeated confirmations', async () => {
    const s = await scenario(4);

    const results = await Promise.all([
      service.confirmPayment(s.payment.id),
      service.confirmPayment(s.payment.id),
    ]);

    expect(results[0].ledgerTransactionId).toBe(
      results[1].ledgerTransactionId,
    );
    expect(await prisma.ledgerTransaction.count()).toBe(1);
    expect(await prisma.ticketAllocation.count()).toBe(1);
    expect(await prisma.ticket.count()).toBe(4);
    expect(await prisma.purchaseStateEvent.count()).toBe(1);
    expect(
      (
        await prisma.purchase.findUniqueOrThrow({
          where: { id: s.purchase.id },
        })
      ).status,
    ).toBe(PurchaseStatus.COMPLETED);
  });

  it('rolls back ledger and allocation when ticket issuance fails', async () => {
    const s = await scenario(1);

    await prisma.ticket.create({
      data: {
        publicId: `TKT-${randomUUID()}`,
        userId: s.user.id,
        purchaseId: s.purchase.id,
        drawId: s.draw.id,
        numberInDraw: 1n,
      },
    });

    await expect(
      service.confirmPayment(s.payment.id),
    ).rejects.toThrow();

    expect(
      (
        await prisma.purchase.findUniqueOrThrow({
          where: { id: s.purchase.id },
        })
      ).status,
    ).toBe(PurchaseStatus.PAYMENT_PENDING);
    expect(await prisma.ledgerTransaction.count()).toBe(0);
    expect(await prisma.ticketAllocation.count()).toBe(0);
    expect(await prisma.ticket.count()).toBe(1);
    expect(await prisma.purchaseStateEvent.count()).toBe(0);
  });

  it('rejects a non-succeeded payment without side effects', async () => {
    const s = await scenario(1, {
      paymentStatus: PaymentStatus.PENDING,
    });

    await expect(
      service.confirmPayment(s.payment.id),
    ).rejects.toThrow(
      'Only a succeeded payment can be confirmed',
    );

    await expectNoOrchestrationSideEffects(s.purchase.id);
  });

  it('rejects an invalid purchase state without side effects', async () => {
    const s = await scenario(1, {
      purchaseStatus: PurchaseStatus.PAYMENT_FAILED,
    });

    await expect(
      service.confirmPayment(s.payment.id),
    ).rejects.toThrow(
      `Purchase in ${PurchaseStatus.PAYMENT_FAILED} cannot be completed`,
    );

    await expectNoOrchestrationSideEffects(s.purchase.id);
  });

  it('rejects a closed draw without side effects', async () => {
    const s = await scenario(1, {
      drawStatus: DrawStatus.SALES_CLOSED,
    });

    await expect(
      service.confirmPayment(s.payment.id),
    ).rejects.toThrow(
      `Tickets cannot be issued for a draw in ${DrawStatus.SALES_CLOSED}`,
    );

    await expectNoOrchestrationSideEffects(s.purchase.id);
  });

  it('rejects a cancelled draw without side effects', async () => {
    const s = await scenario(1, {
      drawStatus: DrawStatus.CANCELLED,
    });

    await expect(
      service.confirmPayment(s.payment.id),
    ).rejects.toThrow(
      `Tickets cannot be issued for a draw in ${DrawStatus.CANCELLED}`,
    );

    await expectNoOrchestrationSideEffects(s.purchase.id);
  });

  it('rejects a payment amount mismatch without side effects', async () => {
    const s = await scenario(2, {
      paymentAmountMinor: 199n,
    });

    await expect(
      service.confirmPayment(s.payment.id),
    ).rejects.toThrow(
      'Payment amount or currency does not match the purchase',
    );

    await expectNoOrchestrationSideEffects(s.purchase.id);
  });

  it('rejects a payment currency mismatch without side effects', async () => {
    const s = await scenario(2, {
      paymentCurrency: 'EUR',
    });

    await expect(
      service.confirmPayment(s.payment.id),
    ).rejects.toThrow(
      'Payment amount or currency does not match the purchase',
    );

    await expectNoOrchestrationSideEffects(s.purchase.id);
  });

  it('prevents corruption of a completed purchase by deleting a ticket', async () => {
    const s = await scenario(2);

    await service.confirmPayment(s.payment.id);

    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { purchaseId: s.purchase.id },
    });

    await expect(
      prisma.$executeRaw`
        DELETE FROM "tickets"
        WHERE "id" = ${ticket.id}::uuid
      `,
    ).rejects.toThrow(
      'Tickets are immutable and cannot be deleted',
    );

    expect(
      await prisma.ticket.count({
        where: { purchaseId: s.purchase.id },
      }),
    ).toBe(2);

    const result = await service.confirmPayment(s.payment.id);

    expect(result.alreadyProcessed).toBe(true);
    expect(result.ticketCount).toBe(2);
  });
});
