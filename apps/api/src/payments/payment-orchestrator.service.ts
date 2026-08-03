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
} from '@prisma/client';

import {
  createCorrelationId,
  createPublicId,
} from '../common/utils/identifier.util';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { TicketAllocationService } from '../tickets/ticket-allocation.service';

export type ConfirmPaymentResult = {
  purchaseId: string;
  paymentId: string;
  ledgerTransactionId: string;
  ticketCount: number;
  alreadyProcessed: boolean;
};

type LockedDrawRow = {
  status: DrawStatus;
};

const MAX_TRANSACTION_ATTEMPTS = 3;

@Injectable()
export class PaymentOrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly allocation: TicketAllocationService,
  ) {}

  async confirmPayment(
    paymentId: string,
  ): Promise<ConfirmPaymentResult> {
    for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await this.confirmPaymentInTransaction(paymentId);
      } catch (error: unknown) {
        if (
          attempt === MAX_TRANSACTION_ATTEMPTS ||
          !this.isRetryableTransactionError(error)
        ) {
          throw error;
        }
      }
    }

    throw new Error('Payment confirmation retry loop exhausted');
  }

  private confirmPaymentInTransaction(
    paymentId: string,
  ): Promise<ConfirmPaymentResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          include: {
            purchase: {
              include: {
                ticketAllocation: true,
                tickets: {
                  select: { numberInDraw: true },
                  orderBy: { numberInDraw: 'asc' },
                },
              },
            },
          },
        });

        if (!payment) {
          throw new NotFoundException('Payment not found');
        }

        const purchase = payment.purchase;
        const ledgerIdempotencyKey = `payment-confirmed:${payment.id}`;

        if (purchase.status === PurchaseStatus.COMPLETED) {
          return this.validateCompletedPurchase(
            tx,
            payment.id,
            purchase,
            ledgerIdempotencyKey,
          );
        }

        if (payment.status !== PaymentStatus.SUCCEEDED) {
          throw new ConflictException(
            'Only a succeeded payment can be confirmed',
          );
        }

        if (
          payment.amountMinor !== purchase.totalAmountMinor ||
          payment.currency !== purchase.currency
        ) {
          throw new ConflictException(
            'Payment amount or currency does not match the purchase',
          );
        }

        if (purchase.status !== PurchaseStatus.PAYMENT_PENDING) {
          throw new ConflictException(
            `Purchase in ${purchase.status} cannot be completed`,
          );
        }

        const drawRows = await tx.$queryRaw<LockedDrawRow[]>`
          SELECT "status"
          FROM "lottery_draws"
          WHERE "id" = ${purchase.drawId}::uuid
          FOR SHARE
        `;
        const draw = drawRows[0];

        if (!draw) {
          throw new NotFoundException('Lottery draw not found');
        }

        if (draw.status !== DrawStatus.SALES_OPEN) {
          throw new ConflictException(
            `Tickets cannot be issued for a draw in ${draw.status}`,
          );
        }

        const correlationId = createCorrelationId();
        const ledgerResult = await this.ledger.appendInTransaction(tx, {
          type: LedgerTransactionType.PAYMENT_CONFIRMED,
          idempotencyKey: ledgerIdempotencyKey,
          referenceType: 'PAYMENT',
          referenceId: payment.id,
          currency: payment.currency,
          description: 'Payment confirmed for ticket purchase',
          metadata: {
            purchaseId: purchase.id,
            drawId: purchase.drawId,
          },
          postings: [
            {
              accountCode: LedgerAccountCode.CASH,
              side: LedgerSide.DEBIT,
              amountMinor: payment.amountMinor,
            },
            {
              accountCode: LedgerAccountCode.PAYMENT_CLEARING,
              side: LedgerSide.CREDIT,
              amountMinor: payment.amountMinor,
            },
          ],
        });

        const reserved = await this.allocation.reserveRange(tx, {
          purchaseId: purchase.id,
          drawId: purchase.drawId,
          ticketCount: purchase.requestedTicketCount,
          correlationId,
        });

        if (!reserved.alreadyAllocated) {
          const rows: {
            publicId: string;
            userId: string;
            purchaseId: string;
            drawId: string;
            numberInDraw: bigint;
          }[] = [];

          for (
            let number = reserved.allocation.startNumber;
            number <= reserved.allocation.endNumber;
            number += 1n
          ) {
            rows.push({
              publicId: createPublicId('TKT'),
              userId: purchase.userId,
              purchaseId: purchase.id,
              drawId: purchase.drawId,
              numberInDraw: number,
            });
          }

          await tx.ticket.createMany({ data: rows });
        }

        const ticketCount = await tx.ticket.count({
          where: { purchaseId: purchase.id },
        });

        if (ticketCount !== purchase.requestedTicketCount) {
          throw new ConflictException(
            'Issued ticket count does not match the purchase',
          );
        }

        const completedAt = new Date();
        const updated = await tx.purchase.updateMany({
          where: {
            id: purchase.id,
            status: PurchaseStatus.PAYMENT_PENDING,
          },
          data: {
            status: PurchaseStatus.COMPLETED,
            paymentConfirmedAt:
              purchase.paymentConfirmedAt ??
              payment.confirmedAt ??
              completedAt,
            completedAt,
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException(
            'Purchase state changed while payment confirmation was processing',
          );
        }

        await tx.purchaseStateEvent.create({
          data: {
            purchaseId: purchase.id,
            fromStatus: purchase.status,
            toStatus: PurchaseStatus.COMPLETED,
            cause: 'PAYMENT_CONFIRMED_AND_TICKETS_ISSUED',
            source: AuditActorType.PAYMENT_PROVIDER,
            correlationId,
            sealedAt: completedAt,
            metadata: {
              paymentId: payment.id,
              ledgerTransactionId: ledgerResult.transaction.id,
              ticketAllocationId: reserved.allocation.id,
              ticketCount: purchase.requestedTicketCount,
            },
          },
        });

        return {
          purchaseId: purchase.id,
          paymentId: payment.id,
          ledgerTransactionId: ledgerResult.transaction.id,
          ticketCount,
          alreadyProcessed:
            ledgerResult.alreadyAppended && reserved.alreadyAllocated,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async validateCompletedPurchase(
    tx: Prisma.TransactionClient,
    paymentId: string,
    purchase: {
      id: string;
      requestedTicketCount: number;
      ticketAllocation: {
        startNumber: bigint;
        endNumber: bigint;
      } | null;
      tickets: { numberInDraw: bigint }[];
    },
    ledgerIdempotencyKey: string,
  ): Promise<ConfirmPaymentResult> {
    const ledgerTransaction = await tx.ledgerTransaction.findUnique({
      where: { idempotencyKey: ledgerIdempotencyKey },
    });

    if (!ledgerTransaction) {
      throw new ConflictException(
        'Completed purchase is missing its ledger transaction',
      );
    }

    if (!purchase.ticketAllocation) {
      throw new ConflictException(
        'Completed purchase is missing its ticket allocation',
      );
    }

    const expectedStart = purchase.ticketAllocation.startNumber;
    const expectedEnd = purchase.ticketAllocation.endNumber;
    const expectedRangeSize = Number(expectedEnd - expectedStart + 1n);
    const ticketsMatchRange = purchase.tickets.every(
      (ticket, index) =>
        ticket.numberInDraw === expectedStart + BigInt(index),
    );

    if (
      purchase.tickets.length !== purchase.requestedTicketCount ||
      expectedRangeSize !== purchase.requestedTicketCount ||
      !ticketsMatchRange
    ) {
      throw new ConflictException(
        'Completed purchase has an inconsistent ticket allocation',
      );
    }

    return {
      purchaseId: purchase.id,
      paymentId,
      ledgerTransactionId: ledgerTransaction.id,
      ticketCount: purchase.tickets.length,
      alreadyProcessed: true,
    };
  }

  private isRetryableTransactionError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    );
  }
}
