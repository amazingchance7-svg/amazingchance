import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  DrawStatus,
  PaymentAttemptStatus,
  PaymentStatus,
  Prisma,
  PurchaseStatus,
} from '@prisma/client';
import type Stripe from 'stripe';

import { createCorrelationId } from '../common/utils/identifier.util';
import { PrismaService } from '../prisma/prisma.service';
import { StripeClient } from './stripe.client';

const STRIPE_PROVIDER = 'STRIPE';

type LockedPurchaseRow = {
  id: string;
};

type PreparedPaymentIntent = {
  purchaseId: string;
  paymentId: string;
  paymentAttemptId: string;
  providerSessionId: string | null;
  providerIdempotencyKey: string;
  amountMinor: bigint;
  currency: string;
  expiresAt: Date | null;
};

export type StripePaymentIntentResult = {
  purchaseId: string;
  paymentId: string;
  paymentAttemptId: string;
  provider: typeof STRIPE_PROVIDER;
  paymentIntentId: string;
  clientSecret: string;
  amountMinor: string;
  currency: string;
  status: string;
  expiresAt: Date | null;
};

@Injectable()
export class StripePaymentIntentService {
  constructor(
    private readonly prisma:
      PrismaService,
    private readonly stripeClient:
      StripeClient,
  ) {}

  async initiate(
    userId: string,
    purchaseId: string,
  ): Promise<StripePaymentIntentResult> {
    const prepared =
      await this.prepare(
        userId,
        purchaseId,
      );

    const paymentIntent =
      prepared.providerSessionId
        ? await this.stripeClient
            .retrievePaymentIntent(
              prepared.providerSessionId,
            )
        : await this.stripeClient
            .createPaymentIntent({
              amountMinor:
                this.toStripeAmount(
                  prepared.amountMinor,
                ),
              currency:
                prepared.currency,
              paymentId:
                prepared.paymentId,
              purchaseId:
                prepared.purchaseId,
              idempotencyKey:
                prepared
                  .providerIdempotencyKey,
            });

    this.assertProviderIntent(
      paymentIntent,
      prepared,
    );

    if (!paymentIntent.client_secret) {
      throw new ConflictException(
        'Stripe PaymentIntent does not expose a client secret',
      );
    }

    await this.persistProviderIntent(
      prepared,
      paymentIntent,
    );

    return {
      purchaseId:
        prepared.purchaseId,
      paymentId:
        prepared.paymentId,
      paymentAttemptId:
        prepared.paymentAttemptId,
      provider:
        STRIPE_PROVIDER,
      paymentIntentId:
        paymentIntent.id,
      clientSecret:
        paymentIntent.client_secret,
      amountMinor:
        prepared.amountMinor.toString(),
      currency:
        prepared.currency,
      status:
        paymentIntent.status,
      expiresAt:
        prepared.expiresAt,
    };
  }

  private prepare(
    userId: string,
    purchaseId: string,
  ): Promise<PreparedPaymentIntent> {
    return this.prisma.$transaction(
      async (tx) => {
        const locked =
          await tx.$queryRaw<
            LockedPurchaseRow[]
          >`
            SELECT "id"
            FROM "purchases"
            WHERE "id" = ${purchaseId}::uuid
            FOR UPDATE
          `;

        if (locked.length === 0) {
          throw new NotFoundException(
            'Purchase not found',
          );
        }

        const purchase =
          await tx.purchase.findUnique({
            where: {
              id: purchaseId,
            },
            include: {
              draw: true,
              payments: {
                where: {
                  provider:
                    STRIPE_PROVIDER,
                },
                include: {
                  attempts: {
                    orderBy: {
                      attemptNumber:
                        'desc',
                    },
                  },
                },
                orderBy: {
                  createdAt:
                    'desc',
                },
              },
            },
          });

        if (
          !purchase ||
          purchase.userId !== userId
        ) {
          throw new NotFoundException(
            'Purchase not found',
          );
        }

        this.assertPurchaseCanPay(
          purchase,
        );

        let payment =
          purchase.payments[0];

        if (
          payment &&
          (
            payment.amountMinor !==
              purchase.totalAmountMinor ||
            payment.currency !==
              purchase.currency
          )
        ) {
          throw new ConflictException(
            'Existing Stripe payment does not match the purchase amount or currency',
          );
        }

        if (
          payment?.status ===
            PaymentStatus.SUCCEEDED ||
          payment?.status ===
            PaymentStatus.REFUND_PENDING ||
          payment?.status ===
            PaymentStatus.PARTIALLY_REFUNDED ||
          payment?.status ===
            PaymentStatus.REFUNDED
        ) {
          throw new ConflictException(
            'Purchase already has a completed Stripe payment',
          );
        }

        if (!payment) {
          payment =
            await tx.payment.create({
              data: {
                purchaseId:
                  purchase.id,
                provider:
                  STRIPE_PROVIDER,
                status:
                  PaymentStatus.PENDING,
                amountMinor:
                  purchase.totalAmountMinor,
                currency:
                  purchase.currency,
              },
              include: {
                attempts: true,
              },
            });
        } else if (
          payment.status ===
          PaymentStatus.CREATED
        ) {
          payment =
            await tx.payment.update({
              where: {
                id: payment.id,
              },
              data: {
                status:
                  PaymentStatus.PENDING,
              },
              include: {
                attempts: {
                  orderBy: {
                    attemptNumber:
                      'desc',
                  },
                },
              },
            });
        }

        const reusableAttempt =
          payment.attempts.find(
            (attempt) =>
              attempt.status ===
                PaymentAttemptStatus.PENDING ||
              (
                attempt.status ===
                  PaymentAttemptStatus.CREATED &&
                attempt.providerSessionId !==
                  null
              ),
          );

        let attempt =
          reusableAttempt;

        if (!attempt) {
          const attemptNumber =
            (
              payment.attempts[0]
                ?.attemptNumber ??
              0
            ) + 1;

          const providerIdempotencyKey =
            `stripe-payment-intent:${payment.id}:${attemptNumber}`;

          attempt =
            await tx.paymentAttempt.create({
              data: {
                paymentId:
                  payment.id,
                attemptNumber,
                idempotencyKey:
                  providerIdempotencyKey,
                status:
                  PaymentAttemptStatus.PENDING,
                requestPayload: {
                  amountMinor:
                    purchase.totalAmountMinor.toString(),
                  currency:
                    purchase.currency,
                  purchaseId:
                    purchase.id,
                  paymentId:
                    payment.id,
                },
              },
            });
        }

        if (
          purchase.status ===
          PurchaseStatus.CREATED
        ) {
          const correlationId =
            createCorrelationId();

          const updated =
            await tx.purchase.updateMany({
              where: {
                id:
                  purchase.id,
                userId,
                status:
                  PurchaseStatus.CREATED,
              },
              data: {
                status:
                  PurchaseStatus.PAYMENT_PENDING,
              },
            });

          if (updated.count !== 1) {
            throw new ConflictException(
              'Purchase state changed while payment initiation was processing',
            );
          }

          await tx.purchaseStateEvent.create({
            data: {
              purchaseId:
                purchase.id,
              fromStatus:
                PurchaseStatus.CREATED,
              toStatus:
                PurchaseStatus.PAYMENT_PENDING,
              cause:
                'STRIPE_PAYMENT_INTENT_REQUESTED',
              source:
                AuditActorType.USER,
              correlationId,
              metadata: {
                paymentId:
                  payment.id,
                paymentAttemptId:
                  attempt.id,
                provider:
                  STRIPE_PROVIDER,
              },
            },
          });
        }

        return {
          purchaseId:
            purchase.id,
          paymentId:
            payment.id,
          paymentAttemptId:
            attempt.id,
          providerSessionId:
            attempt.providerSessionId,
          providerIdempotencyKey:
            attempt.idempotencyKey,
          amountMinor:
            purchase.totalAmountMinor,
          currency:
            purchase.currency,
          expiresAt:
            purchase.expiresAt,
        };
      },
      {
        isolationLevel:
          Prisma
            .TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  private async persistProviderIntent(
    prepared: PreparedPaymentIntent,
    paymentIntent:
      Stripe.PaymentIntent,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const attempt =
          await tx.paymentAttempt.findUnique({
            where: {
              id:
                prepared.paymentAttemptId,
            },
          });

        if (!attempt) {
          throw new NotFoundException(
            'Payment attempt not found',
          );
        }

        if (
          attempt.providerSessionId &&
          attempt.providerSessionId !==
            paymentIntent.id
        ) {
          throw new ConflictException(
            'Payment attempt is already bound to another Stripe PaymentIntent',
          );
        }

        const payment =
          await tx.payment.findUnique({
            where: {
              id:
                prepared.paymentId,
            },
          });

        if (!payment) {
          throw new NotFoundException(
            'Payment not found',
          );
        }

        if (
          payment.providerTransactionId &&
          payment.providerTransactionId !==
            paymentIntent.id
        ) {
          throw new ConflictException(
            'Payment is already bound to another Stripe PaymentIntent',
          );
        }

        await tx.paymentAttempt.update({
          where: {
            id:
              attempt.id,
          },
          data: {
            providerSessionId:
              paymentIntent.id,
            status:
              PaymentAttemptStatus.PENDING,
            responsePayload:
              this.buildSafeProviderData(
                paymentIntent,
              ),
          },
        });

        await tx.payment.update({
          where: {
            id:
              payment.id,
          },
          data: {
            providerTransactionId:
              paymentIntent.id,
            status:
              PaymentStatus.PENDING,
            providerData:
              this.buildSafeProviderData(
                paymentIntent,
              ),
          },
        });
      },
      {
        isolationLevel:
          Prisma
            .TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  private assertPurchaseCanPay(
    purchase: {
      status: PurchaseStatus;
      expiresAt: Date | null;
      draw: {
        status: DrawStatus;
        salesOpenAt: Date | null;
        salesCloseAt: Date | null;
        scheduledDrawAt: Date;
      };
    },
  ): void {
    if (
      purchase.status !==
        PurchaseStatus.CREATED &&
      purchase.status !==
        PurchaseStatus.PAYMENT_PENDING
    ) {
      throw new ConflictException(
        `Purchase in ${purchase.status} cannot start a payment`,
      );
    }

    const now = new Date();

    if (
      purchase.expiresAt &&
      now >= purchase.expiresAt
    ) {
      throw new ConflictException(
        'Purchase has expired',
      );
    }

    if (
      purchase.draw.status !==
      DrawStatus.SALES_OPEN
    ) {
      throw new ConflictException(
        'Ticket sales are not open for this draw',
      );
    }

    if (
      purchase.draw.salesOpenAt &&
      now < purchase.draw.salesOpenAt
    ) {
      throw new ConflictException(
        'Ticket sales have not started yet',
      );
    }

    if (
      purchase.draw.salesCloseAt &&
      now >= purchase.draw.salesCloseAt
    ) {
      throw new ConflictException(
        'Ticket sales are already closed',
      );
    }

    if (
      now >=
      purchase.draw.scheduledDrawAt
    ) {
      throw new ConflictException(
        'The scheduled draw time has already passed',
      );
    }
  }

  private assertProviderIntent(
    paymentIntent:
      Stripe.PaymentIntent,
    prepared:
      PreparedPaymentIntent,
  ): void {
    const amount =
      BigInt(
        paymentIntent.amount,
      );

    const currency =
      paymentIntent.currency.toUpperCase();

    if (
      amount !==
        prepared.amountMinor ||
      currency !==
        prepared.currency
    ) {
      throw new ConflictException(
        'Stripe PaymentIntent amount or currency does not match the purchase',
      );
    }

    if (
      paymentIntent.metadata[
        'paymentId'
      ] !==
        prepared.paymentId ||
      paymentIntent.metadata[
        'purchaseId'
      ] !==
        prepared.purchaseId
    ) {
      throw new ConflictException(
        'Stripe PaymentIntent metadata does not match the purchase',
      );
    }
  }

  private toStripeAmount(
    amountMinor: bigint,
  ): number {
    if (
      amountMinor <= 0n ||
      amountMinor >
        BigInt(
          Number.MAX_SAFE_INTEGER,
        )
    ) {
      throw new ConflictException(
        'Purchase amount is outside the supported Stripe range',
      );
    }

    return Number(
      amountMinor,
    );
  }

  private buildSafeProviderData(
    paymentIntent:
      Stripe.PaymentIntent,
  ): Prisma.InputJsonObject {
    return {
      stripePaymentIntentId:
        paymentIntent.id,
      livemode:
        paymentIntent.livemode,
      amount:
        paymentIntent.amount,
      currency:
        paymentIntent.currency,
      status:
        paymentIntent.status,
      paymentMethodTypes:
        paymentIntent.payment_method_types,
    };
  }
}
