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
  type PayoutExecutionInstruction,
} from '../payouts/payout-orchestrator.service';
import {
  PayoutPrismaService,
} from '../prisma/prisma.service';

const POLL_INTERVAL_MS =
  5_000;

const PROCESSING_STALE_AFTER_MS =
  5 * 60_000;

const WORKER_STALE_AFTER_MS =
  30_000;

type ClaimedPayoutRow = {
  id: string;
};

export type PayoutWorkerAction =
  | 'IDLE'
  | 'PAYOUT_SUCCEEDED'
  | 'PAYOUT_PENDING'
  | 'PAYOUT_FAILED'
  | 'PAYOUT_MANUAL_REVIEW'
  | 'STALE_PROCESSING_TO_MANUAL_REVIEW';

export type PayoutWorkerResult = {
  processed: boolean;
  action: PayoutWorkerAction;
  payoutId: string | null;
};

export type PayoutWorkerOperationalStatus = {
  enabled: boolean;
  healthy: boolean;
  inFlight: boolean;
  lastStartedAt: Date | null;
  lastCompletedAt: Date | null;
  consecutiveFailures: number;
  lastAction: PayoutWorkerAction | null;
};

@Injectable()
export class ProductionPayoutWorkerService
  implements
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger =
    new Logger(
      ProductionPayoutWorkerService.name,
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
    PayoutWorkerAction |
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
    PayoutWorkerOperationalStatus {
    const enabled =
      this.isEnabled();

    const heartbeatAt =
      this.lastCompletedAt ??
      this.lastStartedAt;

    const healthy =
      !enabled ||
      (
        heartbeatAt !== null &&
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
    now: Date = new Date(),
  ): Promise<PayoutWorkerResult> {
    const stale =
      await this.processStaleExecution(
        now,
      );

    if (stale) {
      this.lastAction =
        stale.action;

      return stale;
    }

    const payoutId =
      await this.claimNextCreatedPayout(
        now,
      );

    if (!payoutId) {
      this.lastAction =
        'IDLE';

      return {
        processed: false,
        action: 'IDLE',
        payoutId: null,
      };
    }

    const instruction =
      await this.orchestrator
        .beginExecution(
          payoutId,
        );

    const result =
      await this.executeGateway(
        instruction,
      );

    this.lastAction =
      result.action;

    return result;
  }

  private async claimNextCreatedPayout(
    now: Date,
  ): Promise<string | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows =
          await tx.$queryRaw<
            ClaimedPayoutRow[]
          >`
            SELECT "id"
            FROM "payouts"
            WHERE "status" = 'CREATED'
            ORDER BY
              "createdAt" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          `;

        const row =
          rows[0];

        if (!row) {
          return null;
        }

        const claimed =
          await tx.payout
            .updateMany({
              where: {
                id:
                  row.id,
                status:
                  PayoutStatus.CREATED,
              },
              data: {
                status:
                  PayoutStatus.PROCESSING,
                processedAt:
                  now,
              },
            });

        if (
          claimed.count !==
          1
        ) {
          return null;
        }

        return row.id;
      },
      {
        isolationLevel:
          Prisma
            .TransactionIsolationLevel
            .Serializable,
      },
    );
  }

  private async processStaleExecution(
    now: Date,
  ): Promise<PayoutWorkerResult | null> {
    const staleBefore =
      new Date(
        now.getTime() -
          PROCESSING_STALE_AFTER_MS,
      );

    const stale =
      await this.prisma.payout
        .findFirst({
          where: {
            status:
              PayoutStatus.PROCESSING,
            processedAt: {
              lte:
                staleBefore,
            },
          },
          orderBy: [
            {
              processedAt:
                'asc',
            },
            {
              createdAt:
                'asc',
            },
          ],
          select: {
            id:
              true,
          },
        });

    if (!stale) {
      return null;
    }

    await this.orchestrator
      .markManualReview(
        stale.id,
        {
          failureCode:
            'PAYOUT_EXECUTION_UNCERTAIN',
          failureMessage:
            'Payout remained in PROCESSING beyond the safe execution window. Provider outcome must be reconciled before any retry.',
        },
      );

    this.logger.error(
      `Payout ${stale.id} remained in PROCESSING beyond the safe execution window and was moved to manual review. Automatic retry is forbidden.`,
    );

    return {
      processed: true,
      action:
        'STALE_PROCESSING_TO_MANUAL_REVIEW',
      payoutId:
        stale.id,
    };
  }

  private async executeGateway(
    instruction:
      PayoutExecutionInstruction,
  ): Promise<PayoutWorkerResult> {
    const gateway =
      this.gateways.get(
        instruction.provider,
      );

    if (!gateway) {
      await this.orchestrator
        .markManualReview(
          instruction.payoutId,
          {
            failureCode:
              'PAYOUT_GATEWAY_NOT_CONFIGURED',
            failureMessage:
              `No payout gateway is configured for provider ${instruction.provider}.`,
          },
        );

      return {
        processed: true,
        action:
          'PAYOUT_MANUAL_REVIEW',
        payoutId:
          instruction.payoutId,
      };
    }

    let result;

    try {
      result =
        await gateway.execute(
          instruction,
        );
    } catch (error) {
      await this.orchestrator
        .markManualReview(
          instruction.payoutId,
          {
            failureCode:
              'PAYOUT_PROVIDER_OUTCOME_UNKNOWN',
            failureMessage:
              error instanceof Error
                ? error.message
                : 'Payout provider call failed with an unknown outcome.',
          },
        );

      this.logger.error(
        `Payout ${instruction.payoutId} provider execution ended with an unknown outcome. Automatic retry is forbidden.`,
        error instanceof Error
          ? error.stack
          : undefined,
      );

      return {
        processed: true,
        action:
          'PAYOUT_MANUAL_REVIEW',
        payoutId:
          instruction.payoutId,
      };
    }

    switch (result.outcome) {
      case PayoutGatewayOutcome.SUCCEEDED:
        await this.orchestrator
          .finalizeSucceeded(
            instruction.payoutId,
            result.providerTransactionId,
          );

        return {
          processed: true,
          action:
            'PAYOUT_SUCCEEDED',
          payoutId:
            instruction.payoutId,
        };

      case PayoutGatewayOutcome.PENDING:
        await this.orchestrator
          .recordProviderPending(
            instruction.payoutId,
            result.providerTransactionId,
          );

        return {
          processed: true,
          action:
            'PAYOUT_PENDING',
          payoutId:
            instruction.payoutId,
        };

      case PayoutGatewayOutcome.FAILED:
        await this.orchestrator
          .markFailed(
            instruction.payoutId,
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
          processed: true,
          action:
            'PAYOUT_FAILED',
          payoutId:
            instruction.payoutId,
        };

      case PayoutGatewayOutcome.AMBIGUOUS:
        await this.orchestrator
          .markManualReview(
            instruction.payoutId,
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
          processed: true,
          action:
            'PAYOUT_MANUAL_REVIEW',
          payoutId:
            instruction.payoutId,
        };
    }
  }

  private isEnabled():
    boolean {
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
      | 'startup'
      | 'scheduled',
  ): Promise<void> {
    if (
      this.iterationInFlight
    ) {
      this.logger.warn(
        `Payout worker skipped overlapping ${source} iteration.`,
      );

      return;
    }

    this.iterationInFlight =
      true;

    this.lastStartedAt =
      new Date();

    try {
      await this.processNext();

      this.consecutiveFailures =
        0;
    } catch (error) {
      this.consecutiveFailures +=
        1;

      this.logger.error(
        `Payout worker ${source} iteration failed.`,
        error instanceof Error
          ? error.stack
          : undefined,
      );
    } finally {
      this.lastCompletedAt =
        new Date();

      this.iterationInFlight =
        false;
    }
  }
}
