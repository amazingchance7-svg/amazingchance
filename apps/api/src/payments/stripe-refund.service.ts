import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActorType,
  DrawStatus,
  LedgerAccountCode,
  LedgerSide,
  LedgerTransactionType,
  PaymentStatus,
  Prisma,
  PurchaseStatus,
  TicketStatus,
} from '@prisma/client';
import type Stripe from 'stripe';

import { createCorrelationId } from '../common/utils/identifier.util';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeClient } from './stripe.client';

const STRIPE_PROVIDER = 'STRIPE';

type PreparedRefund = {
  purchaseId: string;
  purchasePublicId: string;
  paymentId: string;
  paymentIntentId: string;
  amountMinor: bigint;
  currency: string;
  providerRefundId: string | null;
  alreadyRequested: boolean;
};

export type StripeRefundRequestResult = {
  purchaseId: string;
  paymentId: string;
  refundId: string;
  amountMinor: string;
  currency: string;
  status: string | null;
  alreadyRequested: boolean;
};

export type StripeRefundCompletionResult = {
  purchaseId: string;
  paymentId: string;
  refundId: string;
  ledgerTransactionId: string;
  voidedTicketCount: number;
  alreadyProcessed: boolean;
};

@Injectable()
export class StripeRefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly stripeClient: StripeClient,
  ) {}

  async requestFullRefund(
    purchaseId: string,
    reason: string,
    actorId: string | null,
  ): Promise<StripeRefundRequestResult> {
    const prepared = await this.prepareRefund(
      purchaseId,
      reason,
      actorId,
    );

    const refund = prepared.providerRefundId
      ? await this.stripeClient.retrieveRefund(
          prepared.providerRefundId,
        )
      : await this.stripeClient.createRefund({
          paymentIntentId: prepared.paymentIntentId,
          paymentId: prepared.paymentId,
          purchaseId: prepared.purchaseId,
          idempotencyKey: `stripe-refund:${prepared.paymentId}`,
        });

    this.assertRefundMatchesPayment(
      refund,
      prepared.paymentIntentId,
      prepared.amountMinor,
      prepared.currency,
    );

    await this.persistRefundState(
      prepared.paymentId,
      refund,
    );

    return {
      purchaseId: prepared.purchaseId,
      paymentId: prepared.paymentId,
      refundId: refund.id,
      amountMinor: prepared.amountMinor.toString(),
      currency: prepared.currency,
      status: refund.status,
      alreadyRequested:
        prepared.alreadyRequested ||
        prepared.providerRefundId !== null,
    };
  }

  async processRefundEvent(
    refund: Stripe.Refund,
  ): Promise<{
    paymentId: string;
    completed: boolean;
    failed: boolean;
  }> {
    const payment = await this.resolvePayment(refund);

    this.assertRefundMatchesPayment(
      refund,
      payment.providerTransactionId,
      payment.amountMinor,
      payment.currency,
    );

    await this.persistRefundState(
      payment.id,
      refund,
    );

    if (refund.status === 'succeeded') {
      await this.completeSucceededRefund(
        payment.id,
        refund,
      );

      return {
        paymentId: payment.id,
        completed: true,
        failed: false,
      };
    }

    if (
      refund.status === 'failed' ||
      refund.status === 'canceled'
    ) {
      await this.markRefundFailed(
        payment.id,
        refund,
      );

      return {
        paymentId: payment.id,
        completed: false,
        failed: true,
      };
    }

    return {
      paymentId: payment.id,
      completed: false,
      failed: false,
    };
  }

  private prepareRefund(
    purchaseId: string,
    reason: string,
    actorId: string | null,
  ): Promise<PreparedRefund> {
    return this.prisma.$transaction(
      async (tx) => {
        const purchaseRows = await tx.$queryRaw<
          { id: string; drawId: string }[]
        >`
          SELECT "id", "drawId"
          FROM "purchases"
          WHERE "id" = ${purchaseId}::uuid
          FOR UPDATE
        `;

        const lockedPurchase = purchaseRows[0];

        if (!lockedPurchase) {
          throw new NotFoundException('Purchase not found');
        }

        const drawRows = await tx.$queryRaw<
          { status: DrawStatus }[]
        >`
          SELECT "status"
          FROM "lottery_draws"
          WHERE "id" = ${lockedPurchase.drawId}::uuid
          FOR UPDATE
        `;

        const draw = drawRows[0];

        if (!draw) {
          throw new NotFoundException(
            'Lottery draw not found',
          );
        }

        const purchase = await tx.purchase.findUnique({
          where: { id: purchaseId },
          include: {
            payments: {
              where: {
                provider: STRIPE_PROVIDER,
              },
              orderBy: {
                createdAt: 'desc',
              },
            },
            tickets: {
              select: {
                id: true,
                status: true,
              },
            },
            draw: {
              select: {
                snapshot: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        });

        if (!purchase) {
          throw new NotFoundException('Purchase not found');
        }

        const payment = purchase.payments.find(
          (candidate) =>
            candidate.status === PaymentStatus.SUCCEEDED ||
            candidate.status === PaymentStatus.REFUND_PENDING,
        );

        if (!payment) {
          throw new ConflictException(
            'Purchase does not have a refundable succeeded Stripe payment',
          );
        }

        if (!payment.providerTransactionId) {
          throw new ConflictException(
            'Stripe PaymentIntent ID is missing for the refundable payment',
          );
        }

        if (
          purchase.status === PurchaseStatus.REFUND_PENDING &&
          payment.status === PaymentStatus.REFUND_PENDING
        ) {
          return {
            purchaseId: purchase.id,
            purchasePublicId: purchase.publicId,
            paymentId: payment.id,
            paymentIntentId: payment.providerTransactionId,
            amountMinor: payment.amountMinor,
            currency: payment.currency,
            providerRefundId:
              this.readProviderRefundId(payment.providerData),
            alreadyRequested: true,
          };
        }

        if (purchase.status !== PurchaseStatus.COMPLETED) {
          throw new ConflictException(
            `Purchase in ${purchase.status} cannot be refunded`,
          );
        }

        if (payment.status !== PaymentStatus.SUCCEEDED) {
          throw new ConflictException(
            'Only a succeeded Stripe payment can enter refund processing',
          );
        }

        if (
          draw.status !== DrawStatus.SALES_OPEN &&
          draw.status !== DrawStatus.SALES_CLOSED
        ) {
          throw new ConflictException(
            `Refund cannot start after draw entered ${draw.status}`,
          );
        }

        if (purchase.draw.snapshot) {
          throw new ConflictException(
            'Refund cannot start after a ticket snapshot has been created',
          );
        }

        if (
          purchase.tickets.length === 0 ||
          purchase.tickets.some(
            (ticket) => ticket.status !== TicketStatus.ACTIVE,
          )
        ) {
          throw new ConflictException(
            'Refund requires the purchase to have active issued tickets',
          );
        }

        const correlationId = createCorrelationId();
        const now = new Date();

        const purchaseUpdate = await tx.purchase.updateMany({
          where: {
            id: purchase.id,
            status: PurchaseStatus.COMPLETED,
          },
          data: {
            status: PurchaseStatus.REFUND_PENDING,
          },
        });

        if (purchaseUpdate.count !== 1) {
          throw new ConflictException(
            'Purchase state changed while refund was being prepared',
          );
        }

        const paymentUpdate = await tx.payment.updateMany({
          where: {
            id: payment.id,
            status: PaymentStatus.SUCCEEDED,
          },
          data: {
            status: PaymentStatus.REFUND_PENDING,
          },
        });

        if (paymentUpdate.count !== 1) {
          throw new ConflictException(
            'Payment state changed while refund was being prepared',
          );
        }

        await tx.purchaseStateEvent.create({
          data: {
            purchaseId: purchase.id,
            fromStatus: PurchaseStatus.COMPLETED,
            toStatus: PurchaseStatus.REFUND_PENDING,
            cause: 'ADMIN_STRIPE_REFUND_REQUESTED',
            source: AuditActorType.ADMIN,
            correlationId,
            sealedAt: now,
            metadata: {
              actorId,
              reason: reason.trim(),
              paymentId: payment.id,
            },
          },
        });

        return {
          purchaseId: purchase.id,
          purchasePublicId: purchase.publicId,
          paymentId: payment.id,
          paymentIntentId: payment.providerTransactionId,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          providerRefundId: null,
          alreadyRequested: false,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async completeSucceededRefund(
    paymentId: string,
    refund: Stripe.Refund,
  ): Promise<StripeRefundCompletionResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          include: {
            purchase: {
              include: {
                tickets: {
                  select: {
                    id: true,
                    status: true,
                  },
                },
                draw: {
                  select: {
                    snapshot: {
                      select: {
                        id: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        if (!payment) {
          throw new NotFoundException('Payment not found');
        }

        const purchase = payment.purchase;
        const ledgerKey =
          `refund-completed:${payment.id}`;

        if (
          payment.status === PaymentStatus.REFUNDED &&
          purchase.status === PurchaseStatus.REFUNDED
        ) {
          const ledgerTransaction =
            await tx.ledgerTransaction.findUnique({
              where: {
                idempotencyKey: ledgerKey,
              },
            });

          if (!ledgerTransaction) {
            throw new ConflictException(
              'Refunded purchase is missing its refund ledger transaction',
            );
          }

          const activeTickets = purchase.tickets.filter(
            (ticket) => ticket.status === TicketStatus.ACTIVE,
          );

          if (activeTickets.length > 0) {
            throw new ConflictException(
              'Refunded purchase still has active tickets',
            );
          }

          return {
            purchaseId: purchase.id,
            paymentId: payment.id,
            refundId: refund.id,
            ledgerTransactionId: ledgerTransaction.id,
            voidedTicketCount: 0,
            alreadyProcessed: true,
          };
        }

        if (
          payment.status !== PaymentStatus.REFUND_PENDING ||
          purchase.status !== PurchaseStatus.REFUND_PENDING
        ) {
          throw new ConflictException(
            'Refund completion requires REFUND_PENDING payment and purchase states',
          );
        }

        if (purchase.draw.snapshot) {
          throw new ConflictException(
            'Refund cannot complete after a ticket snapshot has been created',
          );
        }

        const allocationTransaction =
          await tx.ledgerTransaction.findUnique({
            where: {
              idempotencyKey:
                `payment-allocated:${payment.id}`,
            },
            include: {
              postings: true,
            },
          });

        if (!allocationTransaction) {
          throw new ConflictException(
            'Refund requires the original payment allocation ledger transaction',
          );
        }

        const allocationCredits =
          allocationTransaction.postings.filter(
            (posting) =>
              posting.side === LedgerSide.CREDIT &&
              (
                posting.accountCode ===
                  LedgerAccountCode.WEEKLY_JACKPOT ||
                posting.accountCode ===
                  LedgerAccountCode.ANNUAL_JACKPOT ||
                posting.accountCode ===
                  LedgerAccountCode.COMPANY_REVENUE
              ),
          );

        const allocatedTotal =
          allocationCredits.reduce(
            (total, posting) =>
              total + posting.amountMinor,
            0n,
          );

        if (allocatedTotal !== payment.amountMinor) {
          throw new ConflictException(
            'Original payment allocation does not match the refund amount',
          );
        }

        const refundLedger =
          await this.ledger.appendInTransaction(
            tx,
            {
              type: LedgerTransactionType.REFUND_COMPLETED,
              idempotencyKey: ledgerKey,
              referenceType: 'PAYMENT',
              referenceId: payment.id,
              currency: payment.currency,
              description:
                'Full Stripe refund completed and payment allocation reversed',
              metadata: {
                purchaseId: purchase.id,
                stripeRefundId: refund.id,
                stripePaymentIntentId:
                  payment.providerTransactionId,
              },
              postings: [
                ...allocationCredits.map(
                  (posting) => ({
                    accountCode: posting.accountCode,
                    side: LedgerSide.DEBIT,
                    amountMinor: posting.amountMinor,
                  }),
                ),
                {
                  accountCode: LedgerAccountCode.CASH,
                  side: LedgerSide.CREDIT,
                  amountMinor: payment.amountMinor,
                },
              ],
            },
          );

        const now = new Date();

        const voided = await tx.ticket.updateMany({
          where: {
            purchaseId: purchase.id,
            status: TicketStatus.ACTIVE,
          },
          data: {
            status: TicketStatus.VOIDED_BY_REFUND,
            voidedAt: now,
            voidReason: 'PAYMENT_REFUNDED',
          },
        });

        const paymentUpdate = await tx.payment.updateMany({
          where: {
            id: payment.id,
            status: PaymentStatus.REFUND_PENDING,
          },
          data: {
            status: PaymentStatus.REFUNDED,
            providerData: this.mergeProviderData(
              payment.providerData,
              {
                stripeRefundId: refund.id,
                stripeRefundStatus: refund.status,
                stripeRefundAmount: refund.amount,
                stripeRefundCurrency: refund.currency,
              },
            ),
          },
        });

        if (paymentUpdate.count !== 1) {
          throw new ConflictException(
            'Payment state changed while refund completion was processing',
          );
        }

        const purchaseUpdate = await tx.purchase.updateMany({
          where: {
            id: purchase.id,
            status: PurchaseStatus.REFUND_PENDING,
          },
          data: {
            status: PurchaseStatus.REFUNDED,
          },
        });

        if (purchaseUpdate.count !== 1) {
          throw new ConflictException(
            'Purchase state changed while refund completion was processing',
          );
        }

        await tx.purchaseStateEvent.create({
          data: {
            purchaseId: purchase.id,
            fromStatus: PurchaseStatus.REFUND_PENDING,
            toStatus: PurchaseStatus.REFUNDED,
            cause: 'STRIPE_REFUND_SUCCEEDED',
            source: AuditActorType.PAYMENT_PROVIDER,
            correlationId: `stripe-refund:${refund.id}`,
            sealedAt: now,
            metadata: {
              paymentId: payment.id,
              stripeRefundId: refund.id,
              ledgerTransactionId:
                refundLedger.transaction.id,
              voidedTicketCount: voided.count,
            },
          },
        });

        return {
          purchaseId: purchase.id,
          paymentId: payment.id,
          refundId: refund.id,
          ledgerTransactionId:
            refundLedger.transaction.id,
          voidedTicketCount: voided.count,
          alreadyProcessed:
            refundLedger.alreadyAppended,
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async markRefundFailed(
    paymentId: string,
    refund: Stripe.Refund,
  ): Promise<void> {
    await this.prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          include: {
            purchase: true,
          },
        });

        if (!payment) {
          throw new NotFoundException('Payment not found');
        }

        if (
          payment.status !== PaymentStatus.REFUND_PENDING ||
          payment.purchase.status !==
            PurchaseStatus.REFUND_PENDING
        ) {
          return;
        }

        const now = new Date();

        await tx.payment.update({
          where: {
            id: payment.id,
          },
          data: {
            status: PaymentStatus.MANUAL_REVIEW,
            failureCode:
              refund.failure_reason ?? 'refund_failed',
            failureMessage:
              'Stripe refund requires manual review',
            providerData: this.mergeProviderData(
              payment.providerData,
              {
                stripeRefundId: refund.id,
                stripeRefundStatus: refund.status,
                stripeRefundFailureReason:
                  refund.failure_reason ?? null,
              },
            ),
          },
        });

        await tx.purchase.update({
          where: {
            id: payment.purchase.id,
          },
          data: {
            status: PurchaseStatus.MANUAL_REVIEW,
          },
        });

        await tx.purchaseStateEvent.create({
          data: {
            purchaseId: payment.purchase.id,
            fromStatus: PurchaseStatus.REFUND_PENDING,
            toStatus: PurchaseStatus.MANUAL_REVIEW,
            cause: 'STRIPE_REFUND_FAILED',
            source: AuditActorType.PAYMENT_PROVIDER,
            correlationId: `stripe-refund-failed:${refund.id}`,
            sealedAt: now,
            metadata: {
              paymentId: payment.id,
              stripeRefundId: refund.id,
              failureReason:
                refund.failure_reason ?? null,
            },
          },
        });
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async resolvePayment(
    refund: Stripe.Refund,
  ) {
    const paymentId =
      (refund.metadata ?? {})['paymentId'];

    if (paymentId) {
      const byId =
        await this.prisma.payment.findUnique({
          where: {
            id: paymentId,
          },
        });

      if (byId) {
        this.assertStripePayment(byId.provider);
        return byId;
      }
    }

    const paymentIntentId =
      this.paymentIntentId(refund);

    if (!paymentIntentId) {
      throw new NotFoundException(
        'Stripe refund does not identify a payment',
      );
    }

    const byProviderTransaction =
      await this.prisma.payment.findUnique({
        where: {
          providerTransactionId:
            paymentIntentId,
        },
      });

    if (!byProviderTransaction) {
      throw new NotFoundException(
        'Stripe refund payment was not found',
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
    if (provider !== STRIPE_PROVIDER) {
      throw new ConflictException(
        'Payment is not owned by the Stripe provider',
      );
    }
  }

  private assertRefundMatchesPayment(
    refund: Stripe.Refund,
    paymentIntentId: string | null,
    amountMinor: bigint,
    currency: string,
  ): void {
    const refundPaymentIntentId =
      this.paymentIntentId(refund);

    if (
      !paymentIntentId ||
      refundPaymentIntentId !== paymentIntentId
    ) {
      throw new ConflictException(
        'Stripe refund does not match the stored PaymentIntent',
      );
    }

    if (
      BigInt(refund.amount) !== amountMinor ||
      refund.currency.toUpperCase() !== currency
    ) {
      throw new ConflictException(
        'Only an exact full refund of the stored payment is supported',
      );
    }
  }

  private paymentIntentId(
    refund: Stripe.Refund,
  ): string | null {
    if (!refund.payment_intent) {
      return null;
    }

    return typeof refund.payment_intent === 'string'
      ? refund.payment_intent
      : refund.payment_intent.id;
  }

  private async persistRefundState(
    paymentId: string,
    refund: Stripe.Refund,
  ): Promise<void> {
    const payment =
      await this.prisma.payment.findUnique({
        where: {
          id: paymentId,
        },
      });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    await this.prisma.payment.update({
      where: {
        id: payment.id,
      },
      data: {
        providerData: this.mergeProviderData(
          payment.providerData,
          {
            stripeRefundId: refund.id,
            stripeRefundStatus: refund.status,
            stripeRefundAmount: refund.amount,
            stripeRefundCurrency: refund.currency,
          },
        ),
      },
    });
  }

  private readProviderRefundId(
    providerData: Prisma.JsonValue | null,
  ): string | null {
    if (
      !providerData ||
      Array.isArray(providerData) ||
      typeof providerData !== 'object'
    ) {
      return null;
    }

    const value =
      providerData['stripeRefundId'];

    return typeof value === 'string'
      ? value
      : null;
  }

  private mergeProviderData(
    providerData: Prisma.JsonValue | null,
    patch: Prisma.InputJsonObject,
  ): Prisma.InputJsonObject {
    if (
      !providerData ||
      Array.isArray(providerData) ||
      typeof providerData !== 'object'
    ) {
      return patch;
    }

    return {
      ...providerData,
      ...patch,
    } as Prisma.InputJsonObject;
  }
}
