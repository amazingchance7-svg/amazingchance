import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  ConfigService,
} from '@nestjs/config';
import {
  PayoutStatus,
  Prisma,
} from '@prisma/client';

import {
  PayoutGatewayOutcome,
} from '../payouts/payout-gateway';
import {
  PayoutGatewayRegistry,
} from '../payouts/payout-gateway.registry';
import {
  PayoutOrchestratorService,
} from '../payouts/payout-orchestrator.service';
import {
  PayoutPrismaService,
} from '../prisma/prisma.service';

const POLL_INTERVAL_MS =
  5_000;

const WORKER_STALE_AFTER_MS =
  30_000;

type ClaimedReconciliationRow = {
  id: string;
};

type ClaimedReconciliation = {
  id: string;
  attempt: number;
};

const MAX_RECONCILIATION_ATTEMPTS =
  6;

export type PayoutReconciliationWorkerAction =
  | 'IDLE'
  | 'RECONCILED_SUCCEEDED'
  | 'RECONCILED_FAILED'
  | 'RECONCILIATION_PENDING'
  | 'RECONCILIATION_AMBIGUOUS'
  | 'RECONCILIATION_EXHAUSTED'
  | 'RECONCILIATION_GATEWAY_MISSING';

export type PayoutReconciliationWorkerResult = {
  processed:
    boolean;
  action:
    PayoutReconciliationWorkerAction;
  payoutId:
    string | null;
};

export type PayoutReconciliationWorkerOperationalStatus = {
  enabled:
    boolean;
  healthy:
    boolean;
  inFlight:
    boolean;
  lastStartedAt:
    Date | null;
  lastCompletedAt:
    Date | null;
  consecutiveFailures:
    number;
  lastAction:
    PayoutReconciliationWorkerAction | null;
};

@Injectable()
export class ProductionPayoutReconciliationWorkerService
  implements
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger =
    new Logger(
      ProductionPayoutReconciliationWorkerService.name,
    );

  private timer:
    NodeJS.Timeout |
    undefined;

  private iterationInFlight =
    false;

  private lastStartedAt:
    Date |
    null =
      null;

  private lastCompletedAt:
    Date |
    null =
      null;

  private consecutiveFailures =
    0;

  private lastAction:
    PayoutReconciliationWorkerAction |
    null =
      null;

  constructor(
    private readonly prisma:
      PayoutPrismaService,
    private readonly config:
      ConfigService,
    private readonly orchestrator:
      PayoutOrchestratorService,
    private readonly gateways:
      PayoutGatewayRegistry,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      return;
    }

    this.timer =
      setInterval(
        () => {
          void this.runIteration(
            'scheduled',
          );
        },
        POLL_INTERVAL_MS,
      );

    this.timer.unref();

    void this.runIteration(
      'startup',
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(
        this.timer,
      );

      this.timer =
        undefined;
    }
  }

  getOperationalStatus():
    PayoutReconciliationWorkerOperationalStatus {
    const enabled =
      this.isEnabled();

    const heartbeatAt =
      this.lastCompletedAt ??
      this.lastStartedAt;

    const healthy =
      !enabled ||
      (
        heartbeatAt !==
          null &&
        Date.now() -
          heartbeatAt.getTime() <=
          WORKER_STALE_AFTER_MS &&
        this.consecutiveFailures <
          3
      );

    return {
      enabled,
      healthy,
      inFlight:
        this.iterationInFlight,
      lastStartedAt:
        this.lastStartedAt,
      lastCompletedAt:
        this.lastCompletedAt,
      consecutiveFailures:
        this.consecutiveFailures,
      lastAction:
        this.lastAction,
    };
  }

  async processNext(
    now:
      Date =
        new Date(),
  ): Promise<PayoutReconciliationWorkerResult> {
    const claimed =
      await this.claimNext(
        now,
      );

    if (!claimed) {
      return {
        processed:
          false,
        action:
          'IDLE',
        payoutId:
          null,
      };
    }

    const payoutId =
      claimed.id;

    const instruction =
      await this.orchestrator
        .prepareReconciliation(
          payoutId,
        );

    const gateway =
      this.gateways.get(
        instruction.provider,
      );

    if (!gateway) {
      this.logger.error(
        `Payout ${payoutId} cannot be reconciled because provider gateway ${instruction.provider} is not configured.`,
      );

      return {
        processed:
          true,
        action:
          'RECONCILIATION_GATEWAY_MISSING',
        payoutId,
      };
    }

    let result;

    try {
      result =
        await gateway.reconcile(
          instruction,
        );
    } catch (error) {
      this.logger.error(
        `Payout ${payoutId} reconciliation lookup failed. The payout will not be re-executed.`,
        error instanceof Error
          ? error.stack
          : undefined,
      );

      return {
        processed:
          true,
        action:
          claimed.attempt >=
          MAX_RECONCILIATION_ATTEMPTS
            ? 'RECONCILIATION_EXHAUSTED'
            : 'RECONCILIATION_AMBIGUOUS',
        payoutId,
      };
    }

    switch (result.outcome) {
      case PayoutGatewayOutcome.SUCCEEDED:
        await this.orchestrator
          .finalizeReconciledSucceeded(
            payoutId,
            result.providerTransactionId,
          );

        return {
          processed:
            true,
          action:
            'RECONCILED_SUCCEEDED',
          payoutId,
        };

      case PayoutGatewayOutcome.FAILED:
        await this.orchestrator
          .markReconciledFailed(
            payoutId,
            {
              providerTransactionId:
                result.providerTransactionId,
              failureCode:
                result.failureCode,
              failureMessage:
                result.failureMessage,
            },
          );

        return {
          processed:
            true,
          action:
            'RECONCILED_FAILED',
          payoutId,
        };

      case PayoutGatewayOutcome.PENDING:
        return {
          processed:
            true,
          action:
            claimed.attempt >=
            MAX_RECONCILIATION_ATTEMPTS
              ? 'RECONCILIATION_EXHAUSTED'
              : 'RECONCILIATION_PENDING',
          payoutId,
        };

      case PayoutGatewayOutcome.AMBIGUOUS:
        return {
          processed:
            true,
          action:
            claimed.attempt >=
            MAX_RECONCILIATION_ATTEMPTS
              ? 'RECONCILIATION_EXHAUSTED'
              : 'RECONCILIATION_AMBIGUOUS',
          payoutId,
        };
    }
  }

  private async claimNext(
    now:
      Date,
  ): Promise<ClaimedReconciliation | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows =
          await tx.$queryRaw<
            ClaimedReconciliationRow[]
          >(
            Prisma.sql`
              SELECT "id"
              FROM "payouts"
              WHERE "status" IN (
                ${PayoutStatus.PENDING}::"PayoutStatus",
                ${PayoutStatus.MANUAL_REVIEW}::"PayoutStatus"
              )
              AND (
                "nextReconciliationAt" IS NULL
                OR "nextReconciliationAt" <= ${now}
              )
              ORDER BY
                "nextReconciliationAt" ASC NULLS FIRST,
                "createdAt" ASC
              FOR UPDATE SKIP LOCKED
              LIMIT 1
            `,
          );

        const row =
          rows[0];

        if (!row) {
          return null;
        }

        const payout =
          await tx.payout.findUnique({
            where: {
              id:
                row.id,
            },
            select: {
              reconciliationAttempts:
                true,
            },
          });

        if (!payout) {
          return null;
        }

        if (
          payout.reconciliationAttempts >=
          MAX_RECONCILIATION_ATTEMPTS
        ) {
          return null;
        }

        const attempts =
          payout
            .reconciliationAttempts +
          1;

        await tx.payout.update({
          where: {
            id:
              row.id,
          },
          data: {
            reconciliationAttempts:
              attempts,
            lastReconciledAt:
              now,
            nextReconciliationAt:
              attempts >=
              MAX_RECONCILIATION_ATTEMPTS
                ? null
                : new Date(
                    now.getTime() +
                      this.backoffMs(
                        attempts,
                      ),
                  ),
          },
        });

        return {
          id:
            row.id,
          attempt:
            attempts,
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

  private backoffMs(
    attempt:
      number,
  ): number {
    if (attempt <= 1) {
      return 30_000;
    }

    if (attempt === 2) {
      return 60_000;
    }

    if (attempt === 3) {
      return 5 * 60_000;
    }

    if (attempt === 4) {
      return 15 * 60_000;
    }

    return 60 * 60_000;
  }

  private isEnabled(): boolean {
    return (
      this.config
        .get<string>(
          'NODE_ENV',
        ) ===
        'production' &&
      this.config
        .get<string>(
          'PAYOUT_WORKER_ENABLED',
        ) ===
        'true'
    );
  }

  private async runIteration(
    source:
      'startup' |
      'scheduled',
  ): Promise<void> {
    if (
      !this.isEnabled() ||
      this.iterationInFlight
    ) {
      return;
    }

    this.iterationInFlight =
      true;
    this.lastStartedAt =
      new Date();

    try {
      const result =
        await this.processNext();

      this.lastAction =
        result.action;

      this.consecutiveFailures =
        0;
      this.lastCompletedAt =
        new Date();
    } catch (error) {
      this.consecutiveFailures +=
        1;
      this.lastCompletedAt =
        new Date();

      this.logger.error(
        `Payout reconciliation worker ${source} iteration failed.`,
        error instanceof Error
          ? error.stack
          : undefined,
      );
    } finally {
      this.iterationInFlight =
        false;
    }
  }
}
