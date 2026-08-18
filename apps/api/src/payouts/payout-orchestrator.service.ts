import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LedgerAccountCode,
  LedgerSide,
  LedgerTransactionType,
  Prisma,
  PrizeEligibilityCheckStatus,
  PrizeEligibilityCheckType,
  PrizeStatus,
  PayoutStatus,
} from '@prisma/client';

import {
  LedgerService,
} from '../ledger/ledger.service';
import {
  PayoutPrismaService,
} from '../prisma/prisma.service';

const REQUIRED_CHECKS =
  new Set<PrizeEligibilityCheckType>([
    PrizeEligibilityCheckType.IDENTITY,
    PrizeEligibilityCheckType.AGE,
    PrizeEligibilityCheckType.JURISDICTION,
  ]);

export type PreparePayoutInput = {
  prizeId: string;
  provider: string;
  destinationRef: string;
};

export type PreparedPayoutResult = {
  payoutId: string;
  prizeId: string;
  amountMinor: string;
  currency: string;
  provider: string;
  destinationRef: string;
  alreadyPrepared: boolean;
};

export type PayoutExecutionInstruction = {
  payoutId: string;
  prizeId: string;
  userId: string;
  amountMinor: string;
  currency: string;
  provider: string;
  destinationRef: string;
  idempotencyKey: string;
};

export type PayoutReconciliationInstruction = {
  payoutId:
    string;
  prizeId:
    string;
  userId:
    string;
  amountMinor:
    string;
  currency:
    string;
  provider:
    string;
  providerTransactionId:
    string | null;
};
type PayoutTerminalSource =
  | 'EXECUTION'
  | 'RECONCILIATION';
export type PayoutCompletionResult = {
  payoutId: string;
  prizeId: string;
  providerTransactionId: string;
  ledgerTransactionId: string;
  paidAt: Date;
  alreadyProcessed: boolean;
};

@Injectable()
export class PayoutOrchestratorService {
  constructor(
    private readonly prisma:
      PayoutPrismaService,
    private readonly ledger:
      LedgerService,
  ) {}

  prepare(
    input:
      PreparePayoutInput,
  ): Promise<PreparedPayoutResult> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockPrize(
          tx,
          input.prizeId,
        );

        const prize =
          await tx.prize.findUnique({
            where: {
              id:
                input.prizeId,
            },
            include: {
              claim: {
                include: {
                  checks:
                    true,
                },
              },
              payouts: {
                orderBy: {
                  createdAt:
                    'asc',
                },
              },
            },
          });

        if (!prize) {
          throw new NotFoundException(
            'Prize not found',
          );
        }

        const provider =
          input.provider
            .trim()
            .toUpperCase();

        const destinationRef =
          input.destinationRef
            .trim();

        if (!provider) {
          throw new ConflictException(
            'Payout provider is required',
          );
        }

        if (!destinationRef) {
          throw new ConflictException(
            'Payout destination reference is required',
          );
        }

        if (
          prize.payouts.length >
          1
        ) {
          throw new ConflictException(
            'Prize contains multiple payout instructions',
          );
        }

        const existing =
          prize.payouts[0];

        if (existing) {
          this.assertExistingMatches(
            existing,
            provider,
            destinationRef,
            prize.amountMinor,
            prize.currency,
          );

          if (
            prize.status !==
              PrizeStatus.PAYOUT_PENDING &&
            prize.status !==
              PrizeStatus.PAID
          ) {
            throw new ConflictException(
              'Existing payout instruction does not match prize state',
            );
          }

          return this.serializePrepared(
            existing,
            true,
          );
        }

        if (
          prize.status !==
          PrizeStatus.APPROVED
        ) {
          throw new ConflictException(
            `Prize in ${prize.status} cannot enter payout`,
          );
        }

        this.assertClaimEligibility(
          prize.claim,
        );

        const payout =
          await tx.payout.create({
            data: {
              prizeId:
                prize.id,
              userId:
                prize.userId,
              status:
                PayoutStatus.CREATED,
              amountMinor:
                prize.amountMinor,
              currency:
                prize.currency,
              idempotencyKey:
                `payout:${prize.id}`,
              provider,
              destinationRef,
            },
          });

        const updated =
          await tx.prize.updateMany({
            where: {
              id:
                prize.id,
              status:
                PrizeStatus.APPROVED,
            },
            data: {
              status:
                PrizeStatus
                  .PAYOUT_PENDING,
            },
          });

        if (
          updated.count !== 1
        ) {
          throw new ConflictException(
            'Prize state changed while payout was being prepared',
          );
        }

        return this.serializePrepared(
          payout,
          false,
        );
      },
      {
        isolationLevel:
          Prisma
            .TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  beginExecution(
    payoutId: string,
  ): Promise<PayoutExecutionInstruction> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockPayout(
          tx,
          payoutId,
        );

        const payout =
          await tx.payout.findUnique({
            where: {
              id:
                payoutId,
            },
            include: {
              prize:
                true,
            },
          });

        if (!payout) {
          throw new NotFoundException(
            'Payout not found',
          );
        }

        if (
          payout.prize.status !==
            PrizeStatus.PAYOUT_PENDING &&
          payout.prize.status !==
            PrizeStatus.PAID
        ) {
          throw new ConflictException(
            `Prize in ${payout.prize.status} cannot execute payout`,
          );
        }

        if (
          payout.status !==
          PayoutStatus.PROCESSING
        ) {
          throw new ConflictException(
            `Payout in ${payout.status} cannot be executed automatically`,
          );
        }

        return this.serializeExecution(
          payout,
        );
      },
      {
        isolationLevel:
          Prisma
            .TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  async prepareReconciliation(
    payoutId: string,
  ): Promise<PayoutReconciliationInstruction> {
    const payout =
      await this.prisma.payout.findUnique({
        where: {
          id:
            payoutId,
        },
        select: {
          id:
            true,
          prizeId:
            true,
          userId:
            true,
          amountMinor:
            true,
          currency:
            true,
          provider:
            true,
          providerTransactionId:
            true,
          status:
            true,
        },
      });

    if (!payout) {
      throw new NotFoundException(
        'Payout not found',
      );
    }

    if (
      payout.status !==
        PayoutStatus.PENDING &&
      payout.status !==
        PayoutStatus.MANUAL_REVIEW
    ) {
      throw new ConflictException(
        `Payout in ${payout.status} cannot be reconciled`,
      );
    }

    if (!payout.provider) {
      throw new ConflictException(
        'Payout reconciliation is missing provider evidence',
      );
    }

    return {
      payoutId:
        payout.id,
      prizeId:
        payout.prizeId,
      userId:
        payout.userId,
      amountMinor:
        payout.amountMinor
          .toString(),
      currency:
        payout.currency,
      provider:
        payout.provider,
      providerTransactionId:
        payout.providerTransactionId,
    };
  }
  recordProviderPending(
    payoutId: string,
    providerTransactionId: string,
  ): Promise<void> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockPayout(
          tx,
          payoutId,
        );

        const payout =
          await tx.payout.findUnique({
            where: {
              id:
                payoutId,
            },
          });

        if (!payout) {
          throw new NotFoundException(
            'Payout not found',
          );
        }

        const providerId =
          providerTransactionId.trim();

        if (!providerId) {
          throw new ConflictException(
            'Provider transaction ID is required',
          );
        }

        this.assertProviderTransactionMatch(
          payout.providerTransactionId,
          providerId,
        );

        if (
          payout.status ===
          PayoutStatus.PENDING
        ) {
          return;
        }

        if (
          payout.status !==
          PayoutStatus.PROCESSING
        ) {
          throw new ConflictException(
            `Payout in ${payout.status} cannot become provider-pending`,
          );
        }

        await tx.payout.update({
          where: {
            id:
              payout.id,
          },
          data: {
            status:
              PayoutStatus.PENDING,
            providerTransactionId:
              providerId,
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

  finalizeReconciledSucceeded(
    payoutId: string,
    providerTransactionId: string,
  ): Promise<PayoutCompletionResult> {
    return this.finalizeSucceeded(
      payoutId,
      providerTransactionId,
      'RECONCILIATION',
    );
  }
  finalizeSucceeded(
    payoutId: string,
    providerTransactionId: string,
    source:
      PayoutTerminalSource =
        'EXECUTION',
  ): Promise<PayoutCompletionResult> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockPayout(
          tx,
          payoutId,
        );

        const payout =
          await tx.payout.findUnique({
            where: {
              id:
                payoutId,
            },
            include: {
              prize:
                true,
            },
          });

        if (!payout) {
          throw new NotFoundException(
            'Payout not found',
          );
        }

        const providerId =
          providerTransactionId.trim();

        if (!providerId) {
          throw new ConflictException(
            'Provider transaction ID is required',
          );
        }

        this.assertProviderTransactionMatch(
          payout.providerTransactionId,
          providerId,
        );

        const ledgerKey =
          `payout-completed:${payout.id}`;

        if (
          payout.status ===
            PayoutStatus.SUCCEEDED &&
          payout.prize.status ===
            PrizeStatus.PAID
        ) {
          const existing =
            await tx.ledgerTransaction
              .findUnique({
                where: {
                  idempotencyKey:
                    ledgerKey,
                },
              });

          if (
            !existing ||
            !existing.sealedAt
          ) {
            throw new ConflictException(
              'Completed payout is missing sealed ledger evidence',
            );
          }

          if (
            payout.providerTransactionId !==
            providerId
          ) {
            throw new ConflictException(
              'Completed payout provider transaction does not match replay',
            );
          }

          return {
            payoutId:
              payout.id,
            prizeId:
              payout.prizeId,
            providerTransactionId:
              providerId,
            ledgerTransactionId:
              existing.id,
            paidAt:
              payout.prize.paidAt ??
              payout.processedAt ??
              payout.createdAt,
            alreadyProcessed:
              true,
          };
        }

        const reconciliationAllowed =
          source ===
            'RECONCILIATION' &&
          payout.status ===
            PayoutStatus.MANUAL_REVIEW;

        if (
          payout.status !==
            PayoutStatus.PROCESSING &&
          payout.status !==
            PayoutStatus.PENDING &&
          !reconciliationAllowed
        ) {
          throw new ConflictException(
            `Payout in ${payout.status} cannot be completed`,
          );
        }

        if (
          payout.prize.status !==
          PrizeStatus.PAYOUT_PENDING
        ) {
          throw new ConflictException(
            `Prize in ${payout.prize.status} cannot be paid`,
          );
        }

        const recognized =
          await tx.ledgerTransaction
            .findFirst({
              where: {
                type:
                  LedgerTransactionType
                    .PRIZE_RECOGNIZED,
                referenceType:
                  'PRIZE',
                referenceId:
                  payout.prizeId,
                sealedAt: {
                  not:
                    null,
                },
              },
              include: {
                postings:
                  true,
              },
            });

        if (!recognized) {
          throw new ConflictException(
            'Prize is missing sealed recognition ledger evidence',
          );
        }

        const payableCredit =
          recognized.postings
            .filter(
              (posting) =>
                posting.accountCode ===
                  LedgerAccountCode
                    .PRIZE_PAYABLE &&
                posting.side ===
                  LedgerSide.CREDIT,
            )
            .reduce(
              (
                total,
                posting,
              ) =>
                total +
                posting.amountMinor,
              0n,
            );

        if (
          payableCredit !==
          payout.amountMinor
        ) {
          throw new ConflictException(
            'Prize recognition ledger amount does not match payout amount',
          );
        }

        const settlement =
          await this.ledger
            .appendInTransaction(
              tx,
              {
                type:
                  LedgerTransactionType
                    .PAYOUT_COMPLETED,
                idempotencyKey:
                  ledgerKey,
                referenceType:
                  'PAYOUT',
                referenceId:
                  payout.id,
                currency:
                  payout.currency,
                description:
                  'Prize payout completed by provider',
                metadata: {
                  prizeId:
                    payout.prizeId,
                  userId:
                    payout.userId,
                  provider:
                    payout.provider,
                  providerTransactionId:
                    providerId,
                },
                postings: [
                  {
                    accountCode:
                      LedgerAccountCode
                        .PRIZE_PAYABLE,
                    side:
                      LedgerSide.DEBIT,
                    amountMinor:
                      payout.amountMinor,
                  },
                  {
                    accountCode:
                      LedgerAccountCode
                        .PAYOUT_CLEARING,
                    side:
                      LedgerSide.CREDIT,
                    amountMinor:
                      payout.amountMinor,
                  },
                ],
              },
            );

        const paidAt =
          new Date();

        await tx.payout.update({
          where: {
            id:
              payout.id,
          },
          data: {
            status:
              PayoutStatus.SUCCEEDED,
            providerTransactionId:
              providerId,
            failureCode:
              null,
            failureMessage:
              null,
            processedAt:
              paidAt,
          },
        });

        const prizeUpdated =
          await tx.prize.updateMany({
            where: {
              id:
                payout.prizeId,
              status:
                PrizeStatus
                  .PAYOUT_PENDING,
            },
            data: {
              status:
                PrizeStatus.PAID,
              paidAt,
            },
          });

        if (
          prizeUpdated.count !==
          1
        ) {
          throw new ConflictException(
            'Prize state changed while payout was completing',
          );
        }

        return {
          payoutId:
            payout.id,
          prizeId:
            payout.prizeId,
          providerTransactionId:
            providerId,
          ledgerTransactionId:
            settlement.transaction.id,
          paidAt,
          alreadyProcessed:
            settlement.alreadyAppended,
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

  markReconciledFailed(
    payoutId: string,
    input: {
      providerTransactionId?:
        string;
      failureCode:
        string;
      failureMessage:
        string;
    },
  ): Promise<void> {
    return this.markFailed(
      payoutId,
      input,
      'RECONCILIATION',
    );
  }

  markFailed(
    payoutId: string,
    input: {
      providerTransactionId?:
        string;
      failureCode:
        string;
      failureMessage:
        string;
    },
    source:
      PayoutTerminalSource =
        'EXECUTION',
  ): Promise<void> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockPayout(
          tx,
          payoutId,
        );

        const payout =
          await tx.payout.findUnique({
            where: {
              id:
                payoutId,
            },
          });

        if (!payout) {
          throw new NotFoundException(
            'Payout not found',
          );
        }

        if (
          payout.status ===
          PayoutStatus.FAILED
        ) {
          return;
        }

        const reconciliationAllowed =
          source ===
            'RECONCILIATION' &&
          payout.status ===
            PayoutStatus.MANUAL_REVIEW;

        if (
          payout.status !==
            PayoutStatus.PROCESSING &&
          payout.status !==
            PayoutStatus.PENDING &&
          !reconciliationAllowed
        ) {
          throw new ConflictException(
            `Payout in ${payout.status} cannot fail provider execution`,
          );
        }

        const providerId =
          input
            .providerTransactionId
            ?.trim() ||
          null;

        if (providerId) {
          this.assertProviderTransactionMatch(
            payout.providerTransactionId,
            providerId,
          );
        }

        await tx.payout.update({
          where: {
            id:
              payout.id,
          },
          data: {
            status:
              PayoutStatus.FAILED,
            providerTransactionId:
              providerId ??
              payout.providerTransactionId,
            failureCode:
              input.failureCode
                .trim(),
            failureMessage:
              input.failureMessage
                .trim(),
            processedAt:
              new Date(),
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

  markManualReview(
    payoutId: string,
    input: {
      providerTransactionId?:
        string;
      failureCode:
        string;
      failureMessage:
        string;
    },
  ): Promise<void> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockPayout(
          tx,
          payoutId,
        );

        const payout =
          await tx.payout.findUnique({
            where: {
              id:
                payoutId,
            },
          });

        if (!payout) {
          throw new NotFoundException(
            'Payout not found',
          );
        }

        if (
          payout.status ===
          PayoutStatus.MANUAL_REVIEW
        ) {
          return;
        }

        if (
          payout.status !==
            PayoutStatus.PROCESSING &&
          payout.status !==
            PayoutStatus.PENDING
        ) {
          throw new ConflictException(
            `Payout in ${payout.status} cannot enter manual review`,
          );
        }

        const providerId =
          input
            .providerTransactionId
            ?.trim() ||
          null;

        if (providerId) {
          this.assertProviderTransactionMatch(
            payout.providerTransactionId,
            providerId,
          );
        }

        const failureCode =
          input.failureCode.trim();

        const failureMessage =
          input.failureMessage.trim();

        if (!failureCode) {
          throw new ConflictException(
            'Manual review failure code is required',
          );
        }

        if (!failureMessage) {
          throw new ConflictException(
            'Manual review failure message is required',
          );
        }

        await tx.payout.update({
          where: {
            id:
              payout.id,
          },
          data: {
            status:
              PayoutStatus.MANUAL_REVIEW,
            providerTransactionId:
              providerId ??
              payout.providerTransactionId,
            failureCode,
            failureMessage,
            processedAt:
              new Date(),
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
  private async lockPrize(
    tx:
      Prisma.TransactionClient,
    prizeId:
      string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT "id"
      FROM "prizes"
      WHERE "id" =
        ${prizeId}::uuid
      FOR UPDATE
    `;
  }

  private async lockPayout(
    tx:
      Prisma.TransactionClient,
    payoutId:
      string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT "id"
      FROM "payouts"
      WHERE "id" =
        ${payoutId}::uuid
      FOR UPDATE
    `;
  }

  private assertClaimEligibility(
    claim:
      | {
          reviewedAt:
            Date | null;
          checks:
            Array<{
              type:
                PrizeEligibilityCheckType;
              status:
                PrizeEligibilityCheckStatus;
            }>;
        }
      | null,
  ): void {
    if (
      !claim ||
      !claim.reviewedAt
    ) {
      throw new ConflictException(
        'Payout requires a reviewed prize claim',
      );
    }

    if (
      claim.checks.length !==
      REQUIRED_CHECKS.size
    ) {
      throw new ConflictException(
        'Payout requires complete eligibility evidence',
      );
    }

    const seen =
      new Set(
        claim.checks.map(
          (check) =>
            check.type,
        ),
      );

    if (
      seen.size !==
        REQUIRED_CHECKS.size ||
      ![
        ...REQUIRED_CHECKS,
      ].every(
        (type) =>
          seen.has(type),
      )
    ) {
      throw new ConflictException(
        'Payout requires identity, age, and jurisdiction evidence',
      );
    }

    if (
      claim.checks.some(
        (check) =>
          check.status !==
          PrizeEligibilityCheckStatus
            .PASSED,
      )
    ) {
      throw new ConflictException(
        'Payout cannot proceed with failed eligibility evidence',
      );
    }
  }

  private assertExistingMatches(
    payout: {
      amountMinor:
        bigint;
      currency:
        string;
      provider:
        string | null;
      destinationRef:
        string | null;
    },
    provider:
      string,
    destinationRef:
      string,
    amountMinor:
      bigint,
    currency:
      string,
  ): void {
    if (
      payout.amountMinor !==
        amountMinor ||
      payout.currency !==
        currency ||
      payout.provider !==
        provider ||
      payout.destinationRef !==
        destinationRef
    ) {
      throw new ConflictException(
        'Existing payout instruction conflicts with requested payout identity',
      );
    }
  }

  private assertProviderTransactionMatch(
    existing:
      string | null,
    incoming:
      string,
  ): void {
    if (
      existing &&
      existing !==
        incoming
    ) {
      throw new ConflictException(
        'Provider transaction ID does not match recorded payout evidence',
      );
    }
  }

  private serializePrepared(
    payout: {
      id:
        string;
      prizeId:
        string;
      amountMinor:
        bigint;
      currency:
        string;
      provider:
        string | null;
      destinationRef:
        string | null;
    },
    alreadyPrepared:
      boolean,
  ): PreparedPayoutResult {
    if (
      !payout.provider ||
      !payout.destinationRef
    ) {
      throw new ConflictException(
        'Prepared payout is missing immutable provider evidence',
      );
    }

    return {
      payoutId:
        payout.id,
      prizeId:
        payout.prizeId,
      amountMinor:
        payout.amountMinor
          .toString(),
      currency:
        payout.currency,
      provider:
        payout.provider,
      destinationRef:
        payout.destinationRef,
      alreadyPrepared,
    };
  }

  private serializeExecution(
    payout: {
      id:
        string;
      prizeId:
        string;
      userId:
        string;
      amountMinor:
        bigint;
      currency:
        string;
      provider:
        string | null;
      destinationRef:
        string | null;
      idempotencyKey:
        string;
    },
  ): PayoutExecutionInstruction {
    if (
      !payout.provider ||
      !payout.destinationRef
    ) {
      throw new ConflictException(
        'Payout execution instruction is incomplete',
      );
    }

    return {
      payoutId:
        payout.id,
      prizeId:
        payout.prizeId,
      userId:
        payout.userId,
      amountMinor:
        payout.amountMinor
          .toString(),
      currency:
        payout.currency,
      provider:
        payout.provider,
      destinationRef:
        payout.destinationRef,
      idempotencyKey:
        payout.idempotencyKey,
    };
  }
}
