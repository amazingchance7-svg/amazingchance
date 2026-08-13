import {
  DrawStatus,
  DrawType,
  PaymentAttemptStatus,
  PaymentStatus,
  PurchaseStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type Stripe from 'stripe';

import { PlayerProtectionService } from '../../src/compliance/player-protection.service';
import { StripeClient } from '../../src/payments/stripe.client';
import { StripePaymentIntentService } from '../../src/payments/stripe-payment-intent.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PurchasesService } from '../../src/purchases/purchases.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('Stripe PaymentIntent initiation integration', () => {
  let prisma: PrismaService;
  let purchases: PurchasesService;
  let service: StripePaymentIntentService;

  const createPaymentIntent =
    jest.fn<
      Promise<Stripe.PaymentIntent>,
      [
        {
          amountMinor: number;
          currency: string;
          paymentId: string;
          purchaseId: string;
          idempotencyKey: string;
        },
      ]
    >();

  const retrievePaymentIntent =
    jest.fn<
      Promise<Stripe.PaymentIntent>,
      [string]
    >();

  beforeAll(async () => {
    prisma =
      await createTestPrisma();
    const playerProtection = {
      assertCanPurchaseInTransaction:
        jest.fn().mockResolvedValue({
          userId: 'fixture-user',
          countryCode: 'UA',
          policyVersion: 1,
          minimumAge: 18,
        }),
    } as unknown as PlayerProtectionService;
    purchases =
      new PurchasesService(
        prisma,
        playerProtection,
      );

    const stripeClient = {
      createPaymentIntent,
      retrievePaymentIntent,
    } as unknown as StripeClient;

    service =
      new StripePaymentIntentService(
        prisma,
        stripeClient,
        playerProtection,
      );
  });

  beforeEach(async () => {
    await cleanTestDatabase(
      prisma,
    );

    createPaymentIntent.mockReset();
    retrievePaymentIntent.mockReset();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createScenario() {
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
            `W-${randomUUID()}`,
          type:
            DrawType.WEEKLY,
          status:
            DrawStatus.SALES_OPEN,
          sequenceNumber:
            Math.floor(
              Math.random() *
                1_000_000_000,
            ),
          salesOpenAt:
            new Date(
              Date.now() -
                60_000,
            ),
          salesCloseAt:
            new Date(
              Date.now() +
                3_600_000,
            ),
          scheduledDrawAt:
            new Date(
              Date.now() +
                86_400_000,
            ),
          participationYear:
            2026,
          currency:
            'USD',
          ticketPriceMinor:
            100n,
        },
      });

    const purchase =
      await purchases.create(
        user.id,
        {
          drawId:
            draw.id,
          requestedTicketCount:
            3,
        },
        `purchase-${randomUUID()}`,
      );

    return {
      user,
      draw,
      purchase,
    };
  }

  function paymentIntent(
    input: {
      id?: string;
      paymentId: string;
      purchaseId: string;
      amount?: number;
      currency?: string;
      clientSecret?: string | null;
    },
  ): Stripe.PaymentIntent {
    return {
      id:
        input.id ??
        `pi_${randomUUID().replaceAll('-', '')}`,
      object:
        'payment_intent',
      amount:
        input.amount ??
        300,
      currency:
        input.currency ??
        'usd',
      client_secret:
        input.clientSecret === undefined
          ? 'test_client_secret'
          : input.clientSecret,
      livemode:
        false,
      metadata: {
        paymentId:
          input.paymentId,
        purchaseId:
          input.purchaseId,
      },
      payment_method_types: [
        'card',
      ],
      status:
        'requires_payment_method',
    } as unknown as Stripe.PaymentIntent;
  }

  it('creates one Stripe payment, one attempt, and moves the purchase to PAYMENT_PENDING', async () => {
    const scenario =
      await createScenario();

    createPaymentIntent
      .mockImplementation(
        async (input) =>
          paymentIntent({
            paymentId:
              input.paymentId,
            purchaseId:
              input.purchaseId,
            amount:
              input.amountMinor,
            currency:
              input.currency.toLowerCase(),
          }),
      );

    const result =
      await service.initiate(
        scenario.user.id,
        scenario.purchase.id,
      );

    expect(
      result.clientSecret,
    ).toBe(
      'test_client_secret',
    );

    expect(
      result.amountMinor,
    ).toBe('300');

    expect(
      result.currency,
    ).toBe('USD');

    expect(
      createPaymentIntent,
    ).toHaveBeenCalledTimes(1);

    const payment =
      await prisma.payment.findFirstOrThrow({
        where: {
          purchaseId:
            scenario.purchase.id,
          provider:
            'STRIPE',
        },
      });

    expect(
      payment.status,
    ).toBe(
      PaymentStatus.PENDING,
    );

    expect(
      payment.providerTransactionId,
    ).toBe(
      result.paymentIntentId,
    );

    const attempt =
      await prisma.paymentAttempt.findFirstOrThrow({
        where: {
          paymentId:
            payment.id,
        },
      });

    expect(
      attempt.status,
    ).toBe(
      PaymentAttemptStatus.PENDING,
    );

    expect(
      attempt.providerSessionId,
    ).toBe(
      result.paymentIntentId,
    );

    expect(
      (
        await prisma.purchase.findUniqueOrThrow({
          where: {
            id:
              scenario.purchase.id,
          },
        })
      ).status,
    ).toBe(
      PurchaseStatus.PAYMENT_PENDING,
    );

    expect(
      await prisma.purchaseStateEvent.count({
        where: {
          purchaseId:
            scenario.purchase.id,
          toStatus:
            PurchaseStatus.PAYMENT_PENDING,
        },
      }),
    ).toBe(1);
  });

  it('resumes the same provider intent without creating duplicate payment state', async () => {
    const scenario =
      await createScenario();

    let stored:
      Stripe.PaymentIntent | null =
        null;

    createPaymentIntent
      .mockImplementation(
        async (input) => {
          stored =
            paymentIntent({
              paymentId:
                input.paymentId,
              purchaseId:
                input.purchaseId,
              amount:
                input.amountMinor,
              currency:
                input.currency.toLowerCase(),
            });

          return stored;
        },
      );

    retrievePaymentIntent
      .mockImplementation(
        async () => {
          if (!stored) {
            throw new Error(
              'PaymentIntent missing',
            );
          }

          return stored;
        },
      );

    const first =
      await service.initiate(
        scenario.user.id,
        scenario.purchase.id,
      );

    const second =
      await service.initiate(
        scenario.user.id,
        scenario.purchase.id,
      );

    expect(
      second.paymentIntentId,
    ).toBe(
      first.paymentIntentId,
    );

    expect(
      createPaymentIntent,
    ).toHaveBeenCalledTimes(1);

    expect(
      retrievePaymentIntent,
    ).toHaveBeenCalledTimes(1);

    expect(
      await prisma.payment.count({
        where: {
          purchaseId:
            scenario.purchase.id,
        },
      }),
    ).toBe(1);

    expect(
      await prisma.paymentAttempt.count(),
    ).toBe(1);

    expect(
      await prisma.purchaseStateEvent.count({
        where: {
          purchaseId:
            scenario.purchase.id,
          toStatus:
            PurchaseStatus.PAYMENT_PENDING,
        },
      }),
    ).toBe(1);
  });

  it('does not disclose or initiate another users purchase', async () => {
    const scenario =
      await createScenario();

    const otherUser =
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

    await expect(
      service.initiate(
        otherUser.id,
        scenario.purchase.id,
      ),
    ).rejects.toThrow(
      'Purchase not found',
    );

    expect(
      createPaymentIntent,
    ).not.toHaveBeenCalled();

    expect(
      await prisma.payment.count(),
    ).toBe(0);
  });

  it('rejects expired purchases before contacting Stripe', async () => {
    const scenario =
      await createScenario();

    await prisma.purchase.update({
      where: {
        id:
          scenario.purchase.id,
      },
      data: {
        expiresAt:
          new Date(
            Date.now() -
              1_000,
          ),
      },
    });

    await expect(
      service.initiate(
        scenario.user.id,
        scenario.purchase.id,
      ),
    ).rejects.toThrow(
      'Purchase has expired',
    );

    expect(
      createPaymentIntent,
    ).not.toHaveBeenCalled();

    expect(
      await prisma.payment.count(),
    ).toBe(0);
  });

  it('rejects a Stripe intent whose amount does not match the purchase', async () => {
    const scenario =
      await createScenario();

    createPaymentIntent
      .mockImplementation(
        async (input) =>
          paymentIntent({
            paymentId:
              input.paymentId,
            purchaseId:
              input.purchaseId,
            amount:
              299,
            currency:
              input.currency.toLowerCase(),
          }),
      );

    await expect(
      service.initiate(
        scenario.user.id,
        scenario.purchase.id,
      ),
    ).rejects.toThrow(
      'Stripe PaymentIntent amount or currency does not match the purchase',
    );

    const payment =
      await prisma.payment.findFirstOrThrow({
        where: {
          purchaseId:
            scenario.purchase.id,
        },
      });

    expect(
      payment.providerTransactionId,
    ).toBeNull();
  });

  it('blocks user cancellation while a provider PaymentIntent is active', async () => {
    const scenario =
      await createScenario();

    createPaymentIntent
      .mockImplementation(
        async (input) =>
          paymentIntent({
            paymentId:
              input.paymentId,
            purchaseId:
              input.purchaseId,
            amount:
              input.amountMinor,
            currency:
              input.currency.toLowerCase(),
          }),
      );

    await service.initiate(
      scenario.user.id,
      scenario.purchase.id,
    );

    await expect(
      purchases.cancel(
        scenario.user.id,
        scenario.purchase.id,
      ),
    ).rejects.toThrow(
      'Purchase has an active provider payment and cannot be cancelled until that payment is resolved',
    );

    expect(
      (
        await prisma.purchase.findUniqueOrThrow({
          where: {
            id:
              scenario.purchase.id,
          },
        })
      ).status,
    ).toBe(
      PurchaseStatus.PAYMENT_PENDING,
    );
  });

  it('still allows cancellation after the provider payment has failed', async () => {
    const scenario =
      await createScenario();

    createPaymentIntent
      .mockImplementation(
        async (input) =>
          paymentIntent({
            paymentId:
              input.paymentId,
            purchaseId:
              input.purchaseId,
            amount:
              input.amountMinor,
            currency:
              input.currency.toLowerCase(),
          }),
      );

    await service.initiate(
      scenario.user.id,
      scenario.purchase.id,
    );

    await prisma.payment.updateMany({
      where: {
        purchaseId:
          scenario.purchase.id,
      },
      data: {
        status:
          PaymentStatus.FAILED,
      },
    });

    const cancelled =
      await purchases.cancel(
        scenario.user.id,
        scenario.purchase.id,
      );

    expect(
      cancelled.status,
    ).toBe(
      PurchaseStatus.CANCELLED,
    );
  });
});
