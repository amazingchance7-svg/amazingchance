import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DrawStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AutomatedDrawLifecycleService } from './automated-draw-lifecycle.service';

type ClaimedDrawRow = {
  id: string;
  status: DrawStatus;
};

export type DrawSchedulerOperationalStatus = {
  enabled: boolean;
  healthy: boolean;
  inFlight: boolean;
  lastStartedAt: Date | null;
  lastCompletedAt: Date | null;
  consecutiveFailures: number;
  lastAction: string | null;
};

const POLL_INTERVAL_MS = 5_000;
const WORKER_STALE_AFTER_MS = 30_000;

@Injectable()
export class ProductionDrawSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger =
    new Logger(ProductionDrawSchedulerService.name);

  private timer: NodeJS.Timeout | undefined;
  private iterationInFlight = false;
  private lastStartedAt: Date | null = null;
  private lastCompletedAt: Date | null = null;
  private consecutiveFailures = 0;
  private lastAction: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly drawLifecycle?: AutomatedDrawLifecycleService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runIteration('scheduled');
    }, POLL_INTERVAL_MS);

    this.timer.unref();
    void this.runIteration('startup');
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  getOperationalStatus(): DrawSchedulerOperationalStatus {
    const enabled = this.isEnabled();
    const heartbeatAt =
      this.lastCompletedAt ?? this.lastStartedAt;

    const healthy =
      !enabled ||
      (
        heartbeatAt !== null &&
        Date.now() - heartbeatAt.getTime() <=
          WORKER_STALE_AFTER_MS &&
        this.consecutiveFailures < 3
      );

    return {
      enabled,
      healthy,
      inFlight: this.iterationInFlight,
      lastStartedAt: this.lastStartedAt,
      lastCompletedAt: this.lastCompletedAt,
      consecutiveFailures: this.consecutiveFailures,
      lastAction: this.lastAction,
    };
  }

  async processNext(): Promise<boolean> {
    const salesProcessed =
      await this.processSalesWindowTransition();

    if (salesProcessed) {
      return true;
    }

    if (!this.drawLifecycle) {
      this.lastAction = 'IDLE';
      return false;
    }

    const lifecycle =
      await this.drawLifecycle.processNext();

    this.lastAction = lifecycle.action;
    return lifecycle.processed;
  }

  private processSalesWindowTransition(): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        const rows =
          await tx.$queryRaw<ClaimedDrawRow[]>`
            SELECT
              "id",
              "status"
            FROM "lottery_draws"
            WHERE
              (
                "status" = 'SCHEDULED'
                AND "salesOpenAt" IS NOT NULL
                AND "salesOpenAt" <= NOW()
              )
              OR (
                "status" = 'SALES_OPEN'
                AND "salesCloseAt" IS NOT NULL
                AND "salesCloseAt" <= NOW()
              )
            ORDER BY
              CASE
                WHEN "status" = 'SCHEDULED'
                  THEN "salesOpenAt"
                ELSE "salesCloseAt"
              END ASC,
              "createdAt" ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
          `;

        const row = rows[0];

        if (!row) {
          return false;
        }

        const draw =
          await tx.lotteryDraw.findUnique({
            where: { id: row.id },
            select: {
              id: true,
              status: true,
              salesCloseAt: true,
            },
          });

        if (!draw) {
          this.lastAction = 'MISSING_DRAW';
          return true;
        }

        if (draw.status === DrawStatus.SCHEDULED) {
          const now = new Date();

          if (
            draw.salesCloseAt &&
            draw.salesCloseAt <= now
          ) {
            const reviewed =
              await tx.lotteryDraw.updateMany({
                where: {
                  id: draw.id,
                  status: DrawStatus.SCHEDULED,
                },
                data: {
                  status: DrawStatus.MANUAL_REVIEW,
                },
              });

            if (reviewed.count === 1) {
              this.lastAction =
                'STALE_SCHEDULE_TO_MANUAL_REVIEW';

              this.logger.error(
                `Scheduled draw ${draw.id} missed its sales window and was moved to manual review.`,
              );
            }

            return true;
          }

          const opened =
            await tx.lotteryDraw.updateMany({
              where: {
                id: draw.id,
                status: DrawStatus.SCHEDULED,
              },
              data: {
                status: DrawStatus.SALES_OPEN,
              },
            });

          if (opened.count === 1) {
            this.lastAction = 'SALES_OPENED';
          }

          return true;
        }

        if (draw.status === DrawStatus.SALES_OPEN) {
          const closed =
            await tx.lotteryDraw.updateMany({
              where: {
                id: draw.id,
                status: DrawStatus.SALES_OPEN,
              },
              data: {
                status: DrawStatus.SALES_CLOSED,
              },
            });

          if (closed.count === 1) {
            this.lastAction = 'SALES_CLOSED';
          }

          return true;
        }

        this.lastAction = 'STATE_CHANGED';
        return true;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private isEnabled(): boolean {
    return this.config.get<string>('NODE_ENV') ===
      'production';
  }

  private async runIteration(
    source: 'startup' | 'scheduled',
  ): Promise<void> {
    if (this.iterationInFlight) {
      this.logger.warn(
        `Draw scheduler skipped overlapping ${source} iteration.`,
      );
      return;
    }

    this.iterationInFlight = true;
    this.lastStartedAt = new Date();

    try {
      await this.processNext();
      this.consecutiveFailures = 0;
    } catch (error) {
      this.consecutiveFailures += 1;
      this.logger.error(
        `Draw scheduler ${source} iteration failed.`,
        error instanceof Error
          ? error.stack
          : undefined,
      );
    } finally {
      this.lastCompletedAt = new Date();
      this.iterationInFlight = false;
    }
  }
}