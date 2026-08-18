import {
  DrawStatus,
  LedgerAccountCode,
  LedgerSide,
  LedgerTransactionType,
  PaymentStatus,
  PrismaClient,
  PurchaseStatus,
  TicketStatus,
  UserStatus,
} from '@prisma/client';
import type Stripe from 'stripe';

import { Permissions } from '../../src/authorization/permissions.constants';
import { LedgerService } from '../../src/ledger/ledger.service';
import {
  PaymentPrismaService,
  PrismaService,
} from '../../src/prisma/prisma.service';
import { StripeClient } from '../../src/payments/stripe.client';
import { StripeRefundService } from '../../src/payments/stripe-refund.service';
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


describe('Stripe refund pipeline', () => {
  let prisma: PrismaService;
  let fixturePrisma: PrismaClient;
  let paymentPrisma: PaymentPrismaService;
  let ledger: LedgerService;
  let stripeClient: {
    createRefund: jest.Mock;
    retrieveRefund: jest.Mock;
  };
  let service: StripeRefundService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    fixturePrisma =
      await createTestAdminPrisma();
    paymentPrisma =
      await createTestPaymentPrisma();
    ledger =
      new LedgerService(paymentPrisma);
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);

    stripeClient = {
      createRefund: jest.fn(),
      retrieveRefund: jest.fn(),
    };

    service = new StripeRefundService(
      paymentPrisma,
      ledger,
      stripeClient as unknown as StripeClient,
    );
  });

  afterAll(async () => {
    await Promise.all([
      prisma.$disconnect(),
      fixturePrisma.$disconnect(),
      paymentPrisma.$disconnect(),
    ]);
  });

  async function fixture() {
    const user = await fixturePrisma.user.create({
      data: {
        email: 'refund-customer@example.com',
        passwordHash: 'test-password-hash',
        status: UserStatus.ACTIVE,
      },
    });

    const draw = await fixturePrisma.lotteryDraw.create({
      data: {
        publicId: 'weekly-refund-test',
        type: 'WEEKLY',
        status: DrawStatus.SALES_OPEN,
        sequenceNumber: 93001,
        scheduledDrawAt: new Date('2026-08-23T18:00:00.000Z'),
        currency: 'USD',
        ticketPriceMinor: 100n,
        winnerCount: 3,
      },
    });

    const purchase = await fixturePrisma.purchase.create({
      data: {
        publicId: 'purchase-refund-test',
        userId: user.id,
        drawId: draw.id,
        status: PurchaseStatus.COMPLETED,
        requestedTicketCount: 1,
        ticketPriceMinor: 100n,
        totalAmountMinor: 100n,
        currency: 'USD',
        idempotencyKey: 'purchase-refund-test-key',
        paymentConfirmedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const payment = await fixturePrisma.payment.create({
      data: {
        purchaseId: purchase.id,
        provider: 'STRIPE',
        providerTransactionId: 'pi_refund_test',
        status: PaymentStatus.SUCCEEDED,
        amountMinor: 100n,
        currency: 'USD',
        confirmedAt: new Date(),
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

    await fixturePrisma.ticket.create({
      data: {
        publicId: 'ticket-refund-test',
        userId: user.id,
        purchaseId: purchase.id,
        drawId: draw.id,
        numberInDraw: 1n,
        status: TicketStatus.ACTIVE,
      },
    });

    await ledger.append({
      type: LedgerTransactionType.PAYMENT_ALLOCATION,
      idempotencyKey: `payment-allocated:${payment.id}`,
      referenceType: 'PAYMENT',
      referenceId: payment.id,
      currency: 'USD',
      postings: [
        {
          accountCode: LedgerAccountCode.PAYMENT_CLEARING,
          side: LedgerSide.DEBIT,
          amountMinor: 100n,
        },
        {
          accountCode: LedgerAccountCode.WEEKLY_JACKPOT,
          side: LedgerSide.CREDIT,
          amountMinor: 70n,
        },
        {
          accountCode: LedgerAccountCode.ANNUAL_JACKPOT,
          side: LedgerSide.CREDIT,
          amountMinor: 10n,
        },
        {
          accountCode: LedgerAccountCode.COMPANY_REVENUE,
          side: LedgerSide.CREDIT,
          amountMinor: 20n,
        },
      ],
    });

    return { user, draw, purchase, payment };
  }

  function refund(
    status: NonNullable<Stripe.Refund['status']>,
  ): Stripe.Refund {
    return {
      id: 're_refund_test',
      object: 'refund',
      amount: 100,
      currency: 'usd',
      metadata: {
        paymentId: '',
        purchaseId: '',
      },
      payment_intent: 'pi_refund_test',
      status,
    } as unknown as Stripe.Refund;
  }

  it('seeds purchase.refund.admin only for BUSINESS_OWNER among privileged roles', async () => {
    const roles = await prisma.role.findMany({
      where: {
        code: {
          in: [
            'BUSINESS_OWNER',
            'PLATFORM_ADMIN',
            'DRAW_OPERATOR',
            'CUSTOMER',
          ],
        },
      },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    const codesByRole = new Map(
      roles.map((role) => [
        role.code,
        role.permissions.map(
          (entry) => entry.permission.code,
        ),
      ]),
    );

    expect(
      codesByRole.get('BUSINESS_OWNER'),
    ).toContain(Permissions.PURCHASE_REFUND_ADMIN);

    for (const roleCode of [
      'PLATFORM_ADMIN',
      'DRAW_OPERATOR',
      'CUSTOMER',
    ]) {
      expect(
        codesByRole.get(roleCode),
      ).not.toContain(Permissions.PURCHASE_REFUND_ADMIN);
    }
  });

  it('requests a full Stripe refund and moves purchase/payment to REFUND_PENDING', async () => {
    const { purchase, payment } = await fixture();

    const pending = refund('pending');
    pending.metadata = {
      paymentId: payment.id,
      purchaseId: purchase.id,
    };

    stripeClient.createRefund.mockResolvedValue(pending);

    const result = await service.requestFullRefund(
      purchase.id,
      'Customer requested cancellation before snapshot',
      '00000000-0000-4000-8000-000000009999',
    );

    expect(result).toMatchObject({
      purchaseId: purchase.id,
      paymentId: payment.id,
      refundId: 're_refund_test',
      amountMinor: '100',
      currency: 'USD',
      status: 'pending',
    });

    const [updatedPurchase, updatedPayment] =
      await Promise.all([
        prisma.purchase.findUniqueOrThrow({
          where: { id: purchase.id },
        }),
        prisma.payment.findUniqueOrThrow({
          where: { id: payment.id },
        }),
      ]);

    expect(updatedPurchase.status).toBe(
      PurchaseStatus.REFUND_PENDING,
    );
    expect(updatedPayment.status).toBe(
      PaymentStatus.REFUND_PENDING,
    );

    const audit =
      await prisma.auditLog.findFirstOrThrow({
        where: {
          action:
            'ADMIN_PURCHASE_REFUND_REQUESTED',
          entityType: 'PURCHASE',
          entityId: purchase.id,
        },
      });

    expect(audit).toMatchObject({
      actorType: 'ADMIN',
      actorId:
        '00000000-0000-4000-8000-000000009999',
      entityType: 'PURCHASE',
      entityId: purchase.id,
    });

    expect(audit.previousState).toEqual({
      purchaseStatus:
        PurchaseStatus.COMPLETED,
      paymentStatus:
        PaymentStatus.SUCCEEDED,
    });

    expect(audit.newState).toEqual({
      purchaseStatus:
        PurchaseStatus.REFUND_PENDING,
      paymentStatus:
        PaymentStatus.REFUND_PENDING,
    });

    expect(audit.metadata).toEqual({
      reason:
        'Customer requested cancellation before snapshot',
      paymentId: payment.id,
      provider: 'STRIPE',
    });

    expect(audit.correlationId).toBeTruthy();
    expect(audit.sealedAt).not.toBeNull();
    expect(stripeClient.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentId: 'pi_refund_test',
        paymentId: payment.id,
        purchaseId: purchase.id,
        idempotencyKey: `stripe-refund:${payment.id}`,
      }),
    );
  });

  it('completes a succeeded refund, reverses allocation, and voids tickets', async () => {
    const { purchase, payment } = await fixture();

    const pending = refund('pending');
    pending.metadata = {
      paymentId: payment.id,
      purchaseId: purchase.id,
    };

    stripeClient.createRefund.mockResolvedValue(pending);

    await service.requestFullRefund(
      purchase.id,
      'Refund before snapshot',
      null,
    );

    const succeeded = refund('succeeded');
    succeeded.metadata = {
      paymentId: payment.id,
      purchaseId: purchase.id,
    };

    const eventResult =
      await service.processRefundEvent(succeeded);

    expect(eventResult).toEqual({
      paymentId: payment.id,
      completed: true,
      failed: false,
    });

    const [updatedPurchase, updatedPayment, ticket, reversal] =
      await Promise.all([
        prisma.purchase.findUniqueOrThrow({
          where: { id: purchase.id },
        }),
        prisma.payment.findUniqueOrThrow({
          where: { id: payment.id },
        }),
        prisma.ticket.findFirstOrThrow({
          where: { purchaseId: purchase.id },
        }),
        prisma.ledgerTransaction.findUniqueOrThrow({
          where: {
            idempotencyKey:
              `refund-completed:${payment.id}`,
          },
          include: { postings: true },
        }),
      ]);

    expect(updatedPurchase.status).toBe(
      PurchaseStatus.REFUNDED,
    );
    expect(updatedPayment.status).toBe(
      PaymentStatus.REFUNDED,
    );
    expect(ticket.status).toBe(
      TicketStatus.VOIDED_BY_REFUND,
    );
    expect(ticket.voidReason).toBe('PAYMENT_REFUNDED');
    expect(reversal.type).toBe(
      LedgerTransactionType.REFUND_COMPLETED,
    );

    const debitTotal = reversal.postings
      .filter((posting) => posting.side === LedgerSide.DEBIT)
      .reduce(
        (sum, posting) => sum + posting.amountMinor,
        0n,
      );

    const creditTotal = reversal.postings
      .filter((posting) => posting.side === LedgerSide.CREDIT)
      .reduce(
        (sum, posting) => sum + posting.amountMinor,
        0n,
      );

    expect(debitTotal).toBe(100n);
    expect(creditTotal).toBe(100n);
  });


  it('requests automatic refund for a succeeded late payment without allocating tickets or jackpot', async () => {
    const user = await fixturePrisma.user.create({
      data: {
        email: 'late-payment@example.com',
        passwordHash: 'test-password-hash',
        status: UserStatus.ACTIVE,
      },
    });

    const draw = await fixturePrisma.lotteryDraw.create({
      data: {
        publicId: 'weekly-late-payment-test',
        type: 'WEEKLY',
        status: DrawStatus.SALES_OPEN,
        sequenceNumber: 93002,
        scheduledDrawAt: new Date(
          Date.now() + 60 * 60 * 1000,
        ),
        currency: 'USD',
        ticketPriceMinor: 100n,
      },
    });

    const purchase = await fixturePrisma.purchase.create({
      data: {
        publicId: 'purchase-late-payment-test',
        userId: user.id,
        drawId: draw.id,
        status: PurchaseStatus.PAYMENT_PENDING,
        requestedTicketCount: 1,
        ticketPriceMinor: 100n,
        totalAmountMinor: 100n,
        currency: 'USD',
        idempotencyKey:
          'purchase-late-payment-test-key',
      },
    });

    const payment = await fixturePrisma.payment.create({
      data: {
        purchaseId: purchase.id,
        provider: 'STRIPE',
        providerTransactionId:
          'pi_late_payment_test',
        status: PaymentStatus.SUCCEEDED,
        amountMinor: 100n,
        currency: 'USD',
        confirmedAt: new Date(),
      },
    });

    const pending = refund('pending');
    pending.payment_intent =
      'pi_late_payment_test';
    pending.metadata = {
      paymentId: payment.id,
      purchaseId: purchase.id,
    };

    stripeClient.createRefund.mockResolvedValue(
      pending,
    );

    const result =
      await service.requestLatePaymentRefund(
        payment.id,
      );

    expect(result).toMatchObject({
      purchaseId: purchase.id,
      paymentId: payment.id,
      refundId: 're_refund_test',
      status: 'pending',
    });

    const [
      updatedPurchase,
      updatedPayment,
      receivedLedger,
      allocationLedger,
    ] = await Promise.all([
      prisma.purchase.findUniqueOrThrow({
        where: { id: purchase.id },
      }),
      prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      }),
      prisma.ledgerTransaction.findUnique({
        where: {
          idempotencyKey:
            `late-payment-received:${payment.id}`,
        },
        include: { postings: true },
      }),
      prisma.ledgerTransaction.findUnique({
        where: {
          idempotencyKey:
            `payment-allocated:${payment.id}`,
        },
      }),
    ]);

    expect(updatedPurchase.status).toBe(
      PurchaseStatus.REFUND_PENDING,
    );
    expect(updatedPayment.status).toBe(
      PaymentStatus.REFUND_PENDING,
    );
    expect(receivedLedger).not.toBeNull();
    expect(allocationLedger).toBeNull();
    expect(
      await prisma.ticket.count({
        where: { purchaseId: purchase.id },
      }),
    ).toBe(0);

    expect(stripeClient.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentId:
          'pi_late_payment_test',
        paymentId: payment.id,
        purchaseId: purchase.id,
        idempotencyKey:
          `late-payment-refund:${payment.id}`,
      }),
    );
  });

  it('completes late-payment refund directly from payment clearing without jackpot reversal', async () => {
    const user = await fixturePrisma.user.create({
      data: {
        email: 'late-payment-complete@example.com',
        passwordHash: 'test-password-hash',
        status: UserStatus.ACTIVE,
      },
    });

    const draw = await fixturePrisma.lotteryDraw.create({
      data: {
        publicId:
          'weekly-late-payment-complete-test',
        type: 'WEEKLY',
        status: DrawStatus.SALES_OPEN,
        sequenceNumber: 93003,
        scheduledDrawAt: new Date(
          Date.now() + 60 * 60 * 1000,
        ),
        currency: 'USD',
        ticketPriceMinor: 100n,
      },
    });

    const purchase = await fixturePrisma.purchase.create({
      data: {
        publicId:
          'purchase-late-payment-complete-test',
        userId: user.id,
        drawId: draw.id,
        status: PurchaseStatus.PAYMENT_PENDING,
        requestedTicketCount: 1,
        ticketPriceMinor: 100n,
        totalAmountMinor: 100n,
        currency: 'USD',
        idempotencyKey:
          'purchase-late-payment-complete-key',
      },
    });

    const payment = await fixturePrisma.payment.create({
      data: {
        purchaseId: purchase.id,
        provider: 'STRIPE',
        providerTransactionId:
          'pi_late_payment_complete',
        status: PaymentStatus.SUCCEEDED,
        amountMinor: 100n,
        currency: 'USD',
        confirmedAt: new Date(),
      },
    });

    const pending = refund('pending');
    pending.payment_intent =
      'pi_late_payment_complete';
    pending.metadata = {
      paymentId: payment.id,
      purchaseId: purchase.id,
    };
    stripeClient.createRefund.mockResolvedValue(
      pending,
    );

    await service.requestLatePaymentRefund(
      payment.id,
    );

    const succeeded = refund('succeeded');
    succeeded.payment_intent =
      'pi_late_payment_complete';
    succeeded.metadata = {
      paymentId: payment.id,
      purchaseId: purchase.id,
    };

    const result =
      await service.processRefundEvent(
        succeeded,
      );

    expect(result).toEqual({
      paymentId: payment.id,
      completed: true,
      failed: false,
    });

    const [
      updatedPurchase,
      updatedPayment,
      refundLedger,
      allocationLedger,
    ] = await Promise.all([
      prisma.purchase.findUniqueOrThrow({
        where: { id: purchase.id },
      }),
      prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      }),
      prisma.ledgerTransaction.findUniqueOrThrow({
        where: {
          idempotencyKey:
            `late-payment-refund-completed:${payment.id}`,
        },
        include: { postings: true },
      }),
      prisma.ledgerTransaction.findUnique({
        where: {
          idempotencyKey:
            `payment-allocated:${payment.id}`,
        },
      }),
    ]);

    expect(updatedPurchase.status).toBe(
      PurchaseStatus.REFUNDED,
    );
    expect(updatedPayment.status).toBe(
      PaymentStatus.REFUNDED,
    );
    expect(allocationLedger).toBeNull();

    expect(refundLedger.postings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountCode:
            LedgerAccountCode.PAYMENT_CLEARING,
          side: LedgerSide.DEBIT,
          amountMinor: 100n,
        }),
        expect.objectContaining({
          accountCode:
            LedgerAccountCode.CASH,
          side: LedgerSide.CREDIT,
          amountMinor: 100n,
        }),
      ]),
    );
  });

  it('blocks refund after a ticket snapshot exists', async () => {
    const { purchase, draw } = await fixture();

    await fixturePrisma.ticketSnapshot.create({
      data: {
        drawId: draw.id,
        status: 'BUILDING',
        ticketCount: 1n,
        canonicalFormat: 'test',
      },
    });

    await expect(
      service.requestFullRefund(
        purchase.id,
        'Too late',
        null,
      ),
    ).rejects.toThrow(
      'after a ticket snapshot has been created',
    );

    expect(stripeClient.createRefund).not.toHaveBeenCalled();
  });
});
