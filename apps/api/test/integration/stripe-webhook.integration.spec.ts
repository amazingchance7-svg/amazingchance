import { ConfigService } from '@nestjs/config';
import {
  DrawStatus,
  DrawType,
  PaymentStatus,
  PrismaClient,
  PurchaseStatus,
  UserStatus,
  WebhookStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import Stripe from 'stripe';

import { PlayerProtectionService } from '../../src/compliance/player-protection.service';
import { FinancialAllocationService } from '../../src/finance/financial-allocation.service';
import { LedgerService } from '../../src/ledger/ledger.service';
import { PaymentOrchestratorService } from '../../src/payments/payment-orchestrator.service';
import { StripeClient } from '../../src/payments/stripe.client';
import { StripeRefundService } from '../../src/payments/stripe-refund.service';
import { StripeWebhookService } from '../../src/payments/stripe-webhook.service';
import {
  PaymentPrismaService,
  PrismaService,
} from '../../src/prisma/prisma.service';
import { TicketAllocationService } from '../../src/tickets/ticket-allocation.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';
import {
  createTestAdminPrisma,
  createTestPaymentPrisma,
} from './database-role.helper';

const STRIPE_SECRET_KEY =
  'test_stripe_secret_key_for_sdk_initialization';
const STRIPE_WEBHOOK_SECRET =
  'stripe_webhook_test_signing_value';

describe('Stripe webhook pipeline integration', () => {
  let prisma: PrismaService;
  let fixturePrisma: PrismaClient;
  let paymentPrisma: PaymentPrismaService;
  let service: StripeWebhookService;
  let stripe: Stripe;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    fixturePrisma =
      await createTestAdminPrisma();
    paymentPrisma =
      await createTestPaymentPrisma();

    const config = new ConfigService({
      STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET,
    });

    stripe = new Stripe(STRIPE_SECRET_KEY);
    const playerProtection = {
      assertCanPurchaseInTransaction:
        jest.fn().mockResolvedValue({
          userId: 'fixture-user',
          countryCode: 'UA',
          policyVersion: 1,
          minimumAge: 18,
        }),
    } as unknown as PlayerProtectionService;
    const orchestrator = new PaymentOrchestratorService(
      paymentPrisma,
      new LedgerService(paymentPrisma),
      new TicketAllocationService(),
      new FinancialAllocationService(paymentPrisma),
      playerProtection,
    );
    const refundService =
      new StripeRefundService(
        paymentPrisma,
        new LedgerService(paymentPrisma),
        new StripeClient(config),
      );
service = new StripeWebhookService(
      paymentPrisma,
      new StripeClient(config),
      orchestrator,
      refundService,
    );
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);

    await fixturePrisma.allocationRule.create({
      data: {
        version: 1,
        weeklyJackpotBps: 7000,
        annualJackpotBps: 1000,
        companyRevenueBps: 2000,
        effectiveFrom: new Date(
          '2026-01-01T00:00:00.000Z',
        ),
      },
    });
  });

  afterAll(async () => {
    await Promise.all([
      prisma.$disconnect(),
      fixturePrisma.$disconnect(),
      paymentPrisma.$disconnect(),
    ]);
  });

  async function createScenario(ticketCount = 2) {
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
        publicId: `W-${randomUUID()}`,
        type: DrawType.WEEKLY,
        status: DrawStatus.SALES_OPEN,
        sequenceNumber: Math.floor(
          Math.random() * 1_000_000_000,
        ),
        scheduledDrawAt: new Date(
          Date.now() + 86_400_000,
        ),
        participationYear: 2026,
        currency: 'USD',
        ticketPriceMinor: 100n,
      },
    });

    const purchase = await fixturePrisma.purchase.create({
      data: {
        publicId: `PUR-${randomUUID()}`,
        userId: user.id,
        drawId: draw.id,
        status: PurchaseStatus.PAYMENT_PENDING,
        requestedTicketCount: ticketCount,
        ticketPriceMinor: 100n,
        totalAmountMinor: BigInt(ticketCount) * 100n,
        currency: 'USD',
        idempotencyKey: randomUUID(),
      },
    });

    const payment = await fixturePrisma.payment.create({
      data: {
        purchaseId: purchase.id,
        provider: 'STRIPE',
        status: PaymentStatus.PENDING,
        amountMinor: purchase.totalAmountMinor,
        currency: purchase.currency,
      },
    });

    return { user, draw, purchase, payment };
  }

  function buildPaymentIntent(input: {
    paymentId: string;
    amountMinor: number;
    status: 'succeeded' | 'requires_payment_method';
    failureCode?: string;
    failureMessage?: string;
  }): Stripe.PaymentIntent {
    return {
      id: `pi_${randomUUID().replaceAll('-', '')}`,
      object: 'payment_intent',
      amount: input.amountMinor,
      amount_capturable: 0,
      amount_details: { tip: {} },
      amount_received:
        input.status === 'succeeded'
          ? input.amountMinor
          : 0,
      application: null,
      application_fee_amount: null,
      automatic_payment_methods: null,
      canceled_at: null,
      cancellation_reason: null,
      capture_method: 'automatic',
      client_secret: null,
      confirmation_method: 'automatic',
      created: 1_786_200_000,
      currency: 'usd',
      customer: null,
      description: null,
      excluded_payment_method_types: null,
      last_payment_error:
        input.status === 'requires_payment_method'
          ? ({
              type: 'card_error',
              code:
                input.failureCode ?? 'card_declined',
              message:
                input.failureMessage ?? 'Card declined',
            } as Stripe.PaymentIntent.LastPaymentError)
          : null,
      latest_charge: null,
      livemode: false,
      metadata: { paymentId: input.paymentId },
      next_action: null,
      on_behalf_of: null,
      payment_method: null,
      payment_method_configuration_details: null,
      payment_method_options: {},
      payment_method_types: ['card'],
      processing: null,
      receipt_email: null,
      review: null,
      setup_future_usage: null,
      shipping: null,
      source: null,
      statement_descriptor: null,
      statement_descriptor_suffix: null,
      status: input.status,
      transfer_data: null,
      transfer_group: null,
    } as unknown as Stripe.PaymentIntent;
  }

  function buildEvent(input: {
    id?: string;
    type:
      | 'payment_intent.succeeded'
      | 'payment_intent.payment_failed'
      | 'payment_intent.processing';
    paymentIntent: Stripe.PaymentIntent;
  }): Stripe.Event {
    return {
      id:
        input.id ??
        `evt_${randomUUID().replaceAll('-', '')}`,
      object: 'event',
      api_version: null,
      created: 1_786_200_000,
      data: { object: input.paymentIntent },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: input.type,
    } as Stripe.Event;
  }

  function signEvent(event: Stripe.Event) {
    const payload = JSON.stringify(event);
    const signature =
      stripe.webhooks.generateTestHeaderString({
        payload,
        secret: STRIPE_WEBHOOK_SECRET,
      });

    return {
      rawBody: Buffer.from(payload, 'utf8'),
      signature,
    };
  }

  it('accepts a valid signed succeeded event and issues tickets exactly once', async () => {
    const scenario = await createScenario(2);
    const event = buildEvent({
      type: 'payment_intent.succeeded',
      paymentIntent: buildPaymentIntent({
        paymentId: scenario.payment.id,
        amountMinor: 200,
        status: 'succeeded',
      }),
    });
    const signed = signEvent(event);

    const result = await service.handle(
      signed.rawBody,
      signed.signature,
    );

    expect(result).toMatchObject({
      providerEventId: event.id,
      eventType: 'payment_intent.succeeded',
      paymentId: scenario.payment.id,
      duplicate: false,
      ignored: false,
    });

    expect(
      (
        await prisma.payment.findUniqueOrThrow({
          where: { id: scenario.payment.id },
        })
      ).status,
    ).toBe(PaymentStatus.SUCCEEDED);

    expect(
      (
        await prisma.purchase.findUniqueOrThrow({
          where: { id: scenario.purchase.id },
        })
      ).status,
    ).toBe(PurchaseStatus.COMPLETED);

    expect(
      await prisma.ticket.count({
        where: { purchaseId: scenario.purchase.id },
      }),
    ).toBe(2);

    expect(await prisma.ledgerTransaction.count()).toBe(2);

    expect(
      (
        await prisma.webhookEvent.findUniqueOrThrow({
          where: {
            provider_providerEventId: {
              provider: 'STRIPE',
              providerEventId: event.id,
            },
          },
        })
      ).status,
    ).toBe(WebhookStatus.PROCESSED);
  });


  it('automatically starts late-payment refund when succeeded webhook arrives after cutoff', async () => {
    const scenario = await createScenario(1);

    await fixturePrisma.lotteryDraw.update({
      where: {
        id: scenario.draw.id,
      },
      data: {
        scheduledDrawAt: new Date(
          Date.now() + 5 * 60 * 1000,
        ),
      },
    });

    const event = buildEvent({
      type: 'payment_intent.succeeded',
      paymentIntent: buildPaymentIntent({
        paymentId: scenario.payment.id,
        amountMinor: 100,
        status: 'succeeded',
      }),
    });
    const signed = signEvent(event);

    const createRefundSpy = jest
      .spyOn(
        StripeClient.prototype,
        'createRefund',
      )
      .mockResolvedValue({
        id: 're_late_payment_webhook',
        object: 'refund',
        amount: 100,
        currency: 'usd',
        metadata: {
          paymentId: scenario.payment.id,
          purchaseId:
            scenario.purchase.id,
        },
        payment_intent:
          (event.data.object as Stripe.PaymentIntent).id,
        status: 'pending',
      } as unknown as Stripe.Refund);

    try {
      const result = await service.handle(
        signed.rawBody,
        signed.signature,
      );

      expect(result).toMatchObject({
        providerEventId: event.id,
        eventType:
          'payment_intent.succeeded',
        paymentId:
          scenario.payment.id,
        duplicate: false,
        ignored: false,
      });

      const [
        payment,
        purchase,
        tickets,
        paymentAllocation,
        latePaymentLedger,
        webhook,
      ] = await Promise.all([
        prisma.payment.findUniqueOrThrow({
          where: {
            id: scenario.payment.id,
          },
        }),
        prisma.purchase.findUniqueOrThrow({
          where: {
            id: scenario.purchase.id,
          },
        }),
        prisma.ticket.count({
          where: {
            purchaseId:
              scenario.purchase.id,
          },
        }),
        prisma.ledgerTransaction.findUnique({
          where: {
            idempotencyKey:
              `payment-allocated:${scenario.payment.id}`,
          },
        }),
        prisma.ledgerTransaction.findUnique({
          where: {
            idempotencyKey:
              `late-payment-received:${scenario.payment.id}`,
          },
        }),
        prisma.webhookEvent.findUniqueOrThrow({
          where: {
            provider_providerEventId: {
              provider: 'STRIPE',
              providerEventId:
                event.id,
            },
          },
        }),
      ]);

      expect(payment.status).toBe(
        PaymentStatus.REFUND_PENDING,
      );
      expect(purchase.status).toBe(
        PurchaseStatus.REFUND_PENDING,
      );
      expect(tickets).toBe(0);
      expect(paymentAllocation).toBeNull();
      expect(latePaymentLedger).not.toBeNull();
      expect(webhook.status).toBe(
        WebhookStatus.PROCESSED,
      );

      expect(createRefundSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentIntentId:
            (event.data.object as Stripe.PaymentIntent).id,
          paymentId:
            scenario.payment.id,
          purchaseId:
            scenario.purchase.id,
          idempotencyKey:
            `late-payment-refund:${scenario.payment.id}`,
        }),
      );
    } finally {
      createRefundSpy.mockRestore();
    }
  });


  it('does not downgrade REFUND_PENDING when a distinct succeeded event is delivered again', async () => {
    const scenario = await createScenario(1);

    await fixturePrisma.lotteryDraw.update({
      where: {
        id: scenario.draw.id,
      },
      data: {
        scheduledDrawAt: new Date(
          Date.now() + 5 * 60 * 1000,
        ),
      },
    });

    const paymentIntent = buildPaymentIntent({
      paymentId: scenario.payment.id,
      amountMinor: 100,
      status: 'succeeded',
    });

    const createRefundSpy = jest
      .spyOn(
        StripeClient.prototype,
        'createRefund',
      )
      .mockResolvedValue({
        id: 're_late_payment_duplicate',
        object: 'refund',
        amount: 100,
        currency: 'usd',
        metadata: {
          paymentId: scenario.payment.id,
          purchaseId: scenario.purchase.id,
        },
        payment_intent: paymentIntent.id,
        status: 'pending',
      } as unknown as Stripe.Refund);

    try {
      const firstEvent = buildEvent({
        id: `evt_first_${randomUUID().replaceAll('-', '')}`,
        type: 'payment_intent.succeeded',
        paymentIntent,
      });
      const secondEvent = buildEvent({
        id: `evt_second_${randomUUID().replaceAll('-', '')}`,
        type: 'payment_intent.succeeded',
        paymentIntent,
      });

      const firstSigned = signEvent(firstEvent);
      const secondSigned = signEvent(secondEvent);

      await service.handle(
        firstSigned.rawBody,
        firstSigned.signature,
      );

      expect(
        (
          await prisma.payment.findUniqueOrThrow({
            where: {
              id: scenario.payment.id,
            },
          })
        ).status,
      ).toBe(PaymentStatus.REFUND_PENDING);

      const second = await service.handle(
        secondSigned.rawBody,
        secondSigned.signature,
      );

      expect(second).toMatchObject({
        providerEventId: secondEvent.id,
        paymentId: scenario.payment.id,
        duplicate: false,
        ignored: false,
      });

      expect(
        (
          await prisma.payment.findUniqueOrThrow({
            where: {
              id: scenario.payment.id,
            },
          })
        ).status,
      ).toBe(PaymentStatus.REFUND_PENDING);

      expect(
        (
          await prisma.purchase.findUniqueOrThrow({
            where: {
              id: scenario.purchase.id,
            },
          })
        ).status,
      ).toBe(PurchaseStatus.REFUND_PENDING);

      expect(createRefundSpy).toHaveBeenCalledTimes(1);
      expect(
        await prisma.ticket.count({
          where: {
            purchaseId: scenario.purchase.id,
          },
        }),
      ).toBe(0);
    } finally {
      createRefundSpy.mockRestore();
    }
  });


  it('keeps a completed purchase completed when a distinct succeeded event arrives after cutoff', async () => {
    const scenario = await createScenario(1);

    const firstEvent = buildEvent({
      id: `evt_complete_first_${randomUUID().replaceAll('-', '')}`,
      type: 'payment_intent.succeeded',
      paymentIntent: buildPaymentIntent({
        paymentId: scenario.payment.id,
        amountMinor: 100,
        status: 'succeeded',
      }),
    });
    const firstSigned = signEvent(firstEvent);

    await service.handle(
      firstSigned.rawBody,
      firstSigned.signature,
    );

    expect(
      (
        await prisma.purchase.findUniqueOrThrow({
          where: {
            id: scenario.purchase.id,
          },
        })
      ).status,
    ).toBe(PurchaseStatus.COMPLETED);

    await fixturePrisma.lotteryDraw.update({
      where: {
        id: scenario.draw.id,
      },
      data: {
        scheduledDrawAt: new Date(
          Date.now() + 5 * 60 * 1000,
        ),
      },
    });

    const secondEvent = buildEvent({
      id: `evt_complete_second_${randomUUID().replaceAll('-', '')}`,
      type: 'payment_intent.succeeded',
      paymentIntent: firstEvent.data.object as Stripe.PaymentIntent,
    });
    const secondSigned = signEvent(secondEvent);

    const createRefundSpy = jest.spyOn(
      StripeClient.prototype,
      'createRefund',
    );

    try {
      const second = await service.handle(
        secondSigned.rawBody,
        secondSigned.signature,
      );

      expect(second).toMatchObject({
        providerEventId: secondEvent.id,
        paymentId: scenario.payment.id,
        duplicate: false,
        ignored: false,
      });

      expect(
        (
          await prisma.payment.findUniqueOrThrow({
            where: {
              id: scenario.payment.id,
            },
          })
        ).status,
      ).toBe(PaymentStatus.SUCCEEDED);

      expect(
        (
          await prisma.purchase.findUniqueOrThrow({
            where: {
              id: scenario.purchase.id,
            },
          })
        ).status,
      ).toBe(PurchaseStatus.COMPLETED);

      expect(
        await prisma.ticket.count({
          where: {
            purchaseId: scenario.purchase.id,
          },
        }),
      ).toBe(1);

      expect(createRefundSpy).not.toHaveBeenCalled();
    } finally {
      createRefundSpy.mockRestore();
    }
  });


  it('allows a failed Stripe PaymentIntent to succeed later without creating a second payment', async () => {
    const scenario = await createScenario(1);

    const failedIntent = buildPaymentIntent({
      paymentId: scenario.payment.id,
      amountMinor: 100,
      status: 'requires_payment_method',
      failureCode: 'card_declined',
      failureMessage: 'Card declined',
    });

    const attempt = await fixturePrisma.paymentAttempt.create({
      data: {
        paymentId: scenario.payment.id,
        attemptNumber: 1,
        idempotencyKey:
          `retry-attempt-${randomUUID()}`,
        providerSessionId: failedIntent.id,
        status: 'PENDING',
      },
    });

    const failedEvent = buildEvent({
      id: `evt_retry_failed_${randomUUID().replaceAll('-', '')}`,
      type: 'payment_intent.payment_failed',
      paymentIntent: failedIntent,
    });
    const failedSigned = signEvent(failedEvent);

    await service.handle(
      failedSigned.rawBody,
      failedSigned.signature,
    );

    expect(
      (
        await prisma.payment.findUniqueOrThrow({
          where: { id: scenario.payment.id },
        })
      ).status,
    ).toBe(PaymentStatus.FAILED);

    expect(
      (
        await prisma.paymentAttempt.findUniqueOrThrow({
          where: { id: attempt.id },
        })
      ).status,
    ).toBe('PENDING');

    const succeededIntent = {
      ...buildPaymentIntent({
        paymentId: scenario.payment.id,
        amountMinor: 100,
        status: 'succeeded',
      }),
      id: failedIntent.id,
    } as Stripe.PaymentIntent;

    const succeededEvent = buildEvent({
      id: `evt_retry_succeeded_${randomUUID().replaceAll('-', '')}`,
      type: 'payment_intent.succeeded',
      paymentIntent: succeededIntent,
    });
    const succeededSigned = signEvent(
      succeededEvent,
    );

    await service.handle(
      succeededSigned.rawBody,
      succeededSigned.signature,
    );

    const [
      payment,
      purchase,
      updatedAttempt,
      tickets,
    ] = await Promise.all([
      prisma.payment.findUniqueOrThrow({
        where: { id: scenario.payment.id },
      }),
      prisma.purchase.findUniqueOrThrow({
        where: { id: scenario.purchase.id },
      }),
      prisma.paymentAttempt.findUniqueOrThrow({
        where: { id: attempt.id },
      }),
      prisma.ticket.count({
        where: {
          purchaseId: scenario.purchase.id,
        },
      }),
    ]);

    expect(payment.status).toBe(
      PaymentStatus.SUCCEEDED,
    );
    expect(purchase.status).toBe(
      PurchaseStatus.COMPLETED,
    );
    expect(updatedAttempt.status).toBe(
      'SUCCEEDED',
    );
    expect(updatedAttempt.finishedAt).not.toBeNull();
    expect(tickets).toBe(1);
  });

  it('ignores a stale failed event after payment success instead of downgrading the payment', async () => {
    const scenario = await createScenario(1);

    const succeededIntent = buildPaymentIntent({
      paymentId: scenario.payment.id,
      amountMinor: 100,
      status: 'succeeded',
    });

    const succeededEvent = buildEvent({
      id: `evt_stale_success_${randomUUID().replaceAll('-', '')}`,
      type: 'payment_intent.succeeded',
      paymentIntent: succeededIntent,
    });

    const succeededSigned = signEvent(
      succeededEvent,
    );

    await service.handle(
      succeededSigned.rawBody,
      succeededSigned.signature,
    );

    const failedIntent = {
      ...buildPaymentIntent({
        paymentId: scenario.payment.id,
        amountMinor: 100,
        status: 'requires_payment_method',
        failureCode: 'card_declined',
      }),
      id: succeededIntent.id,
    } as Stripe.PaymentIntent;

    const staleFailedEvent = buildEvent({
      id: `evt_stale_failed_${randomUUID().replaceAll('-', '')}`,
      type: 'payment_intent.payment_failed',
      paymentIntent: failedIntent,
    });
    const staleFailedSigned = signEvent(
      staleFailedEvent,
    );

    await service.handle(
      staleFailedSigned.rawBody,
      staleFailedSigned.signature,
    );

    expect(
      (
        await prisma.payment.findUniqueOrThrow({
          where: { id: scenario.payment.id },
        })
      ).status,
    ).toBe(PaymentStatus.SUCCEEDED);

    expect(
      (
        await prisma.purchase.findUniqueOrThrow({
          where: { id: scenario.purchase.id },
        })
      ).status,
    ).toBe(PurchaseStatus.COMPLETED);

    expect(
      await prisma.ticket.count({
        where: {
          purchaseId: scenario.purchase.id,
        },
      }),
    ).toBe(1);

    expect(
      (
        await prisma.webhookEvent.findUniqueOrThrow({
          where: {
            provider_providerEventId: {
              provider: 'STRIPE',
              providerEventId:
                staleFailedEvent.id,
            },
          },
        })
      ).status,
    ).toBe(WebhookStatus.PROCESSED);
  });


  it('recovers immediately when cutoff is crossed during payment orchestration', async () => {
    const scenario = await createScenario(1);

    const event = buildEvent({
      id: `evt_cutoff_race_${randomUUID().replaceAll('-', '')}`,
      type: 'payment_intent.succeeded',
      paymentIntent: buildPaymentIntent({
        paymentId: scenario.payment.id,
        amountMinor: 100,
        status: 'succeeded',
      }),
    });
    const signed = signEvent(event);

    const orchestratorSpy = jest
      .spyOn(
        PaymentOrchestratorService.prototype,
        'confirmPayment',
      )
      .mockImplementationOnce(async () => {
        await fixturePrisma.lotteryDraw.update({
          where: {
            id: scenario.draw.id,
          },
          data: {
            scheduledDrawAt: new Date(
              Date.now() + 5 * 60 * 1000,
            ),
          },
        });

        throw new Error(
          'simulated orchestration failure after cutoff crossed',
        );
      });

    const createRefundSpy = jest
      .spyOn(
        StripeClient.prototype,
        'createRefund',
      )
      .mockResolvedValue({
        id: 're_cutoff_race_recovery',
        object: 'refund',
        amount: 100,
        currency: 'usd',
        metadata: {
          paymentId: scenario.payment.id,
          purchaseId: scenario.purchase.id,
        },
        payment_intent:
          (event.data.object as Stripe.PaymentIntent).id,
        status: 'pending',
      } as unknown as Stripe.Refund);

    try {
      const result = await service.handle(
        signed.rawBody,
        signed.signature,
      );

      expect(result).toMatchObject({
        providerEventId: event.id,
        paymentId: scenario.payment.id,
        duplicate: false,
        ignored: false,
      });

      const [
        payment,
        purchase,
        ticketCount,
        paymentAllocation,
        latePaymentLedger,
        webhook,
      ] = await Promise.all([
        prisma.payment.findUniqueOrThrow({
          where: {
            id: scenario.payment.id,
          },
        }),
        prisma.purchase.findUniqueOrThrow({
          where: {
            id: scenario.purchase.id,
          },
        }),
        prisma.ticket.count({
          where: {
            purchaseId: scenario.purchase.id,
          },
        }),
        prisma.ledgerTransaction.findUnique({
          where: {
            idempotencyKey:
              `payment-allocated:${scenario.payment.id}`,
          },
        }),
        prisma.ledgerTransaction.findUnique({
          where: {
            idempotencyKey:
              `late-payment-received:${scenario.payment.id}`,
          },
        }),
        prisma.webhookEvent.findUniqueOrThrow({
          where: {
            provider_providerEventId: {
              provider: 'STRIPE',
              providerEventId: event.id,
            },
          },
        }),
      ]);

      expect(payment.status).toBe(
        PaymentStatus.REFUND_PENDING,
      );
      expect(purchase.status).toBe(
        PurchaseStatus.REFUND_PENDING,
      );
      expect(ticketCount).toBe(0);
      expect(paymentAllocation).toBeNull();
      expect(latePaymentLedger).not.toBeNull();
      expect(webhook.status).toBe(
        WebhookStatus.PROCESSED,
      );
      expect(createRefundSpy).toHaveBeenCalledTimes(1);
    } finally {
      orchestratorSpy.mockRestore();
      createRefundSpy.mockRestore();
    }
  });

  it('deduplicates repeated delivery of the same signed event', async () => {
    const scenario = await createScenario(3);
    const event = buildEvent({
      type: 'payment_intent.succeeded',
      paymentIntent: buildPaymentIntent({
        paymentId: scenario.payment.id,
        amountMinor: 300,
        status: 'succeeded',
      }),
    });
    const signed = signEvent(event);

    const first = await service.handle(
      signed.rawBody,
      signed.signature,
    );
    const second = await service.handle(
      signed.rawBody,
      signed.signature,
    );

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(await prisma.webhookEvent.count()).toBe(1);
    expect(
      await prisma.ticket.count({
        where: { purchaseId: scenario.purchase.id },
      }),
    ).toBe(3);
    expect(await prisma.ledgerTransaction.count()).toBe(2);
  });

  it('rejects a tampered signature before any side effect', async () => {
    const scenario = await createScenario(1);
    const event = buildEvent({
      type: 'payment_intent.succeeded',
      paymentIntent: buildPaymentIntent({
        paymentId: scenario.payment.id,
        amountMinor: 100,
        status: 'succeeded',
      }),
    });
    const signed = signEvent(event);

    await expect(
      service.handle(
        signed.rawBody,
        `${signed.signature}tampered`,
      ),
    ).rejects.toThrow(
      'Invalid Stripe webhook signature',
    );

    expect(await prisma.webhookEvent.count()).toBe(0);
    expect(await prisma.ticket.count()).toBe(0);
    expect(await prisma.ledgerTransaction.count()).toBe(0);
  });

  it('processes payment_intent.payment_failed without issuing tickets', async () => {
    const scenario = await createScenario(2);
    const event = buildEvent({
      type: 'payment_intent.payment_failed',
      paymentIntent: buildPaymentIntent({
        paymentId: scenario.payment.id,
        amountMinor: 200,
        status: 'requires_payment_method',
        failureCode: 'card_declined',
        failureMessage: 'Card declined',
      }),
    });
    const signed = signEvent(event);

    await service.handle(
      signed.rawBody,
      signed.signature,
    );

    const payment =
      await prisma.payment.findUniqueOrThrow({
        where: { id: scenario.payment.id },
      });

    expect(payment.status).toBe(PaymentStatus.FAILED);
    expect(payment.failureCode).toBe('card_declined');
    expect(await prisma.ticket.count()).toBe(0);
    expect(await prisma.ledgerTransaction.count()).toBe(0);
  });

  it('rejects amount mismatches and records the webhook as failed', async () => {
    const scenario = await createScenario(2);
    const event = buildEvent({
      type: 'payment_intent.succeeded',
      paymentIntent: buildPaymentIntent({
        paymentId: scenario.payment.id,
        amountMinor: 199,
        status: 'succeeded',
      }),
    });
    const signed = signEvent(event);

    await expect(
      service.handle(
        signed.rawBody,
        signed.signature,
      ),
    ).rejects.toThrow(
      'Stripe payment amount or currency does not match the stored payment',
    );

    const webhook =
      await prisma.webhookEvent.findUniqueOrThrow({
        where: {
          provider_providerEventId: {
            provider: 'STRIPE',
            providerEventId: event.id,
          },
        },
      });

    expect(webhook.status).toBe(WebhookStatus.FAILED);
    expect(await prisma.ticket.count()).toBe(0);
    expect(await prisma.ledgerTransaction.count()).toBe(0);
  });

  it('rejects reuse of one event ID with a different valid payload', async () => {
    const scenario = await createScenario(2);
    const providerEventId =
      `evt_${randomUUID().replaceAll('-', '')}`;

    const first = buildEvent({
      id: providerEventId,
      type: 'payment_intent.payment_failed',
      paymentIntent: buildPaymentIntent({
        paymentId: scenario.payment.id,
        amountMinor: 200,
        status: 'requires_payment_method',
      }),
    });
    const firstSigned = signEvent(first);
    await service.handle(
      firstSigned.rawBody,
      firstSigned.signature,
    );

    const second = buildEvent({
      id: providerEventId,
      type: 'payment_intent.succeeded',
      paymentIntent: buildPaymentIntent({
        paymentId: scenario.payment.id,
        amountMinor: 200,
        status: 'succeeded',
      }),
    });
    const secondSigned = signEvent(second);

    await expect(
      service.handle(
        secondSigned.rawBody,
        secondSigned.signature,
      ),
    ).rejects.toThrow(
      'Stripe event ID was reused with a different payload',
    );

    expect(await prisma.webhookEvent.count()).toBe(1);
    expect(await prisma.ticket.count()).toBe(0);
  });

  it('stores unsupported signed events as processed and ignored', async () => {
    const scenario = await createScenario(1);
    const event = buildEvent({
      type: 'payment_intent.processing',
      paymentIntent: buildPaymentIntent({
        paymentId: scenario.payment.id,
        amountMinor: 100,
        status: 'requires_payment_method',
      }),
    });
    const signed = signEvent(event);

    const result = await service.handle(
      signed.rawBody,
      signed.signature,
    );

    expect(result.ignored).toBe(true);

    expect(
      (
        await prisma.webhookEvent.findUniqueOrThrow({
          where: {
            provider_providerEventId: {
              provider: 'STRIPE',
              providerEventId: event.id,
            },
          },
        })
      ).status,
    ).toBe(WebhookStatus.PROCESSED);
  });
});
