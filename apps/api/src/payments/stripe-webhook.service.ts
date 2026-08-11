import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentAttemptStatus,
  PaymentStatus,
  PurchaseStatus,
  Prisma,
  WebhookStatus,
} from '@prisma/client';
import {
  createHash,
} from 'node:crypto';
import type Stripe from 'stripe';

import { ticketSalesBlockReason } from '../lottery-draws/sales-window.policy';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentOrchestratorService } from './payment-orchestrator.service';
import { StripeClient } from './stripe.client';
import { StripeRefundService } from './stripe-refund.service';

const STRIPE_PROVIDER = 'STRIPE';

export type StripeWebhookResult = {
  providerEventId: string;
  eventType: string;
  paymentId: string | null;
  duplicate: boolean;
  ignored: boolean;
};

@Injectable()
export class StripeWebhookService {
  constructor(
    private readonly prisma:
      PrismaService,
    private readonly stripeClient:
      StripeClient,
    private readonly paymentOrchestrator:
      PaymentOrchestratorService,
    private readonly stripeRefundService:
      StripeRefundService,
  ) {}

  async handle(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<StripeWebhookResult> {
    if (
      !signature ||
      !signature.trim()
    ) {
      throw new BadRequestException(
        'Stripe-Signature header is required',
      );
    }

    const event =
      this.stripeClient.constructWebhookEvent(
        rawBody,
        signature,
      );

    const payloadHash =
      createHash('sha256')
        .update(rawBody)
        .digest('hex');

    const payload =
      this.parsePayload(
        rawBody,
      );

    const existing =
      await this.findExistingEvent(
        event.id,
      );

    if (
      existing &&
      existing.payloadHash !==
        payloadHash
    ) {
      throw new ConflictException(
        'Stripe event ID was reused with a different payload',
      );
    }

    if (
      existing?.status ===
      WebhookStatus.PROCESSED
    ) {
      return {
        providerEventId:
          event.id,
        eventType:
          event.type,
        paymentId:
          existing.paymentId,
        duplicate:
          true,
        ignored:
          false,
      };
    }

    const webhook =
      existing ??
      (await this.createWebhookEvent(
        event,
        signature,
        payloadHash,
        payload,
      ));

    try {
      const result =
        await this.processEvent(
          event,
        );

      await this.prisma.webhookEvent.update({
        where: {
          id:
            webhook.id,
        },
        data: {
          paymentId:
            result.paymentId,
          status:
            WebhookStatus.PROCESSED,
          processedAt:
            new Date(),
          errorMessage:
            null,
        },
      });

      return {
        providerEventId:
          event.id,
        eventType:
          event.type,
        paymentId:
          result.paymentId,
        duplicate:
          false,
        ignored:
          result.ignored,
      };
    } catch (error: unknown) {
      await this.prisma.webhookEvent.update({
        where: {
          id:
            webhook.id,
        },
        data: {
          status:
            WebhookStatus.FAILED,
          errorMessage:
            this.toSafeErrorMessage(
              error,
            ),
        },
      });

      throw error;
    }
  }

  private async processEvent(
    event: Stripe.Event,
  ): Promise<{
    paymentId: string | null;
    ignored: boolean;
  }> {
    switch (event.type) {
      case 'payment_intent.succeeded':
        return this.processSucceededPaymentIntent(
          event.data.object,
          event.created,
        );

      case 'payment_intent.payment_failed':
        return this.processFailedPaymentIntent(
          event.data.object,
        );

      case 'refund.created':
      case 'refund.updated':
      case 'refund.failed': {
        const refundResult =
          await this.stripeRefundService.processRefundEvent(
            event.data.object as Stripe.Refund,
          );

        return {
          paymentId: refundResult.paymentId,
          ignored: false,
        };
      }
      default:
        return {
          paymentId:
            null,
          ignored:
            true,
        };
    }
  }

  private async processSucceededPaymentIntent(
    paymentIntent:
      Stripe.PaymentIntent,
    eventCreatedSeconds: number,
  ): Promise<{
    paymentId: string;
    ignored: false;
  }> {
    const payment =
      await this.resolvePayment(
        paymentIntent,
      );

    this.assertPaymentMatchesIntent(
      payment,
      paymentIntent,
    );


    if (
      payment.status === PaymentStatus.REFUND_PENDING ||
      payment.status === PaymentStatus.PARTIALLY_REFUNDED ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      return {
        paymentId: payment.id,
        ignored: false,
      };
    }

    if (
      payment.status !== PaymentStatus.CREATED &&
      payment.status !== PaymentStatus.PENDING &&
      payment.status !== PaymentStatus.FAILED &&
      payment.status !== PaymentStatus.SUCCEEDED
    ) {
      throw new ConflictException(
        `Payment in ${payment.status} cannot transition to SUCCEEDED`,
      );
    }
const confirmedAt =
      new Date(
        eventCreatedSeconds *
          1000,
      );

    await this.prisma.payment.update({
      where: {
        id:
          payment.id,
      },
      data: {
        providerTransactionId:
          paymentIntent.id,
        status:
          PaymentStatus.SUCCEEDED,
        confirmedAt,
        failureCode:
          null,
        failureMessage:
          null,
        providerData:
          this.buildProviderData(
            paymentIntent,
          ),
      },
    });


    await this.prisma.paymentAttempt.updateMany({
      where: {
        paymentId: payment.id,
        providerSessionId: paymentIntent.id,
        status: {
          in: [
            PaymentAttemptStatus.CREATED,
            PaymentAttemptStatus.PENDING,
            PaymentAttemptStatus.FAILED,
          ],
        },
      },
      data: {
        status: PaymentAttemptStatus.SUCCEEDED,
        failureCode: null,
        failureMessage: null,
        responsePayload:
          this.buildProviderData(paymentIntent),
        finishedAt: confirmedAt,
      },
    });

    const purchase =
      await this.prisma.purchase.findUnique({
        where: {
          id: payment.purchaseId,
        },
        select: {
          id: true,
          status: true,
          draw: {
            select: {
              status: true,
              salesOpenAt: true,
              salesCloseAt: true,
              scheduledDrawAt: true,
            },
          },
        },
      });

    if (!purchase) {
      throw new NotFoundException(
        'Purchase not found for succeeded payment',
      );
    }
    if (
      payment.status === PaymentStatus.SUCCEEDED &&
      purchase.status === PurchaseStatus.COMPLETED
    ) {
      return {
        paymentId: payment.id,
        ignored: false,
      };
    }



    const salesBlockReason =
      ticketSalesBlockReason(
        purchase.draw,
        new Date(),
      );

    if (salesBlockReason) {
      await this.stripeRefundService
        .requestLatePaymentRefund(
          payment.id,
        );

      return {
        paymentId:
          payment.id,
        ignored:
          false,
      };
    }


    await this.paymentOrchestrator.confirmPayment(
      payment.id,
    );

    return {
      paymentId:
        payment.id,
      ignored:
        false,
    };
  }

  private async processFailedPaymentIntent(
    paymentIntent:
      Stripe.PaymentIntent,
  ): Promise<{
    paymentId: string;
    ignored: false;
  }> {
    const payment =
      await this.resolvePayment(
        paymentIntent,
      );

    this.assertPaymentMatchesIntent(
      payment,
      paymentIntent,
    );

    if (
      payment.status === PaymentStatus.SUCCEEDED ||
      payment.status === PaymentStatus.REFUND_PENDING ||
      payment.status === PaymentStatus.PARTIALLY_REFUNDED ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      return {
        paymentId: payment.id,
        ignored: false,
      };
    }

    if (
      payment.status !== PaymentStatus.CREATED &&
      payment.status !== PaymentStatus.PENDING &&
      payment.status !== PaymentStatus.FAILED
    ) {
      throw new ConflictException(
        `Payment in ${payment.status} cannot transition to FAILED`,
      );
    }
await this.prisma.payment.update({
      where: {
        id:
          payment.id,
      },
      data: {
        providerTransactionId:
          paymentIntent.id,
        status:
          PaymentStatus.FAILED,
        failureCode:
          paymentIntent
            .last_payment_error
            ?.code ??
          null,
        failureMessage:
          paymentIntent
            .last_payment_error
            ?.message ??
          null,
        providerData:
          this.buildProviderData(
            paymentIntent,
          ),
      },
    });


    await this.prisma.paymentAttempt.updateMany({
      where: {
        paymentId: payment.id,
        providerSessionId: paymentIntent.id,
        status: {
          in: [
            PaymentAttemptStatus.CREATED,
            PaymentAttemptStatus.PENDING,
            PaymentAttemptStatus.FAILED,
          ],
        },
      },
      data: {
        failureCode:
          paymentIntent
            .last_payment_error
            ?.code ??
          null,
        failureMessage:
          paymentIntent
            .last_payment_error
            ?.message ??
          null,
        responsePayload:
          this.buildProviderData(
            paymentIntent,
          ),
      },
    });

    return {
      paymentId:
        payment.id,
      ignored:
        false,
    };
  }

  private async resolvePayment(
    paymentIntent:
      Stripe.PaymentIntent,
  ) {
    const internalPaymentId =
      paymentIntent.metadata[
        'paymentId'
      ];

    if (
      internalPaymentId
    ) {
      const byId =
        await this.prisma.payment.findUnique({
          where: {
            id:
              internalPaymentId,
          },
        });

      if (byId) {
        this.assertStripePayment(
          byId.provider,
        );

        if (
          byId.providerTransactionId &&
          byId.providerTransactionId !==
            paymentIntent.id
        ) {
          throw new ConflictException(
            'Stripe payment intent does not match the stored provider transaction',
          );
        }

        return byId;
      }
    }

    const byProviderTransaction =
      await this.prisma.payment.findUnique({
        where: {
          providerTransactionId:
            paymentIntent.id,
        },
      });

    if (
      !byProviderTransaction
    ) {
      throw new NotFoundException(
        'Stripe payment was not found',
      );
    }

    this.assertStripePayment(
      byProviderTransaction.provider,
    );

    return byProviderTransaction;
  }

  private assertStripePayment(
    provider: string,
  ): void {
    if (
      provider !==
      STRIPE_PROVIDER
    ) {
      throw new ConflictException(
        'Payment is not owned by the Stripe provider',
      );
    }
  }

  private assertPaymentMatchesIntent(
    payment: {
      amountMinor: bigint;
      currency: string;
    },
    paymentIntent:
      Stripe.PaymentIntent,
  ): void {
    const stripeAmount =
      BigInt(
        paymentIntent.amount,
      );

    const stripeCurrency =
      paymentIntent.currency.toUpperCase();

    if (
      payment.amountMinor !==
        stripeAmount ||
      payment.currency !==
        stripeCurrency
    ) {
      throw new ConflictException(
        'Stripe payment amount or currency does not match the stored payment',
      );
    }
  }

  private buildProviderData(
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

  private async createWebhookEvent(
    event: Stripe.Event,
    signature: string,
    payloadHash: string,
    payload: Prisma.InputJsonValue,
  ) {
    try {
      return await this.prisma.webhookEvent.create({
        data: {
          provider:
            STRIPE_PROVIDER,
          providerEventId:
            event.id,
          eventType:
            event.type,
          status:
            WebhookStatus.VERIFIED,
          signature,
          payloadHash,
          payload,
        },
      });
    } catch (error: unknown) {
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code ===
          'P2002'
      ) {
        const concurrent =
          await this.findExistingEvent(
            event.id,
          );

        if (
          concurrent &&
          concurrent.payloadHash ===
            payloadHash
        ) {
          return concurrent;
        }
      }

      throw error;
    }
  }

  private findExistingEvent(
    providerEventId: string,
  ) {
    return this.prisma.webhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider:
            STRIPE_PROVIDER,
          providerEventId,
        },
      },
    });
  }

  private parsePayload(
    rawBody: Buffer,
  ): Prisma.InputJsonValue {
    try {
      return JSON.parse(
        rawBody.toString(
          'utf8',
        ),
      ) as Prisma.InputJsonValue;
    } catch {
      throw new BadRequestException(
        'Stripe webhook payload is not valid JSON',
      );
    }
  }

  private toSafeErrorMessage(
    error: unknown,
  ): string {
    if (
      error instanceof Error
    ) {
      return error.message.slice(
        0,
        500,
      );
    }

    return 'Stripe webhook processing failed';
  }
}
