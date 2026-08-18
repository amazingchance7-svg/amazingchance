import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import {
  DrawStatus,
  DrawType,
  LotteryDraw,
  Prisma,
} from '@prisma/client';

import { DrawPrismaService } from '../prisma/prisma.service';
import {
  effectiveSalesCutoffAt,
  ticketSalesBlockReason,
} from './sales-window.policy';

const WEEK_MS =
  7 * 24 * 60 * 60 * 1000;
const ROLLOVER_INTERVAL_MS =
  30 * 1000;
const SALES_CUTOFF_MS =
  10 * 60 * 1000;

export type WeeklySalesAvailability = {
  available: boolean;
  reason:
    | 'AVAILABLE'
    | 'NO_WEEKLY_DRAW'
    | 'SALES_NOT_STARTED'
    | 'SALES_CLOSED';
  drawId: string | null;
  publicId: string | null;
  scheduledDrawAt: string | null;
  effectiveCutoffAt: string | null;
  ticketPriceMinor: string | null;
  currency: string | null;
};

@Injectable()
export class WeeklyDrawSalesService
  implements
    OnModuleInit,
    OnApplicationShutdown
{
  private readonly logger =
    new Logger(
      WeeklyDrawSalesService.name,
    );

  private timer:
    | NodeJS.Timeout
    | null = null;

  constructor(
    private readonly prisma:
      DrawPrismaService,
  ) {}

  onModuleInit(): void {
    if (
      process.env.NODE_ENV ===
      'test'
    ) {
      return;
    }

    void this.reconcile().catch(
      (error: unknown) => {
        this.logger.error(
          'Initial weekly draw rollover failed',
          error instanceof Error
            ? error.stack
            : undefined,
        );
      },
    );

    this.timer = setInterval(
      () => {
        void this.reconcile().catch(
          (error: unknown) => {
            this.logger.error(
              'Weekly draw rollover failed',
              error instanceof Error
                ? error.stack
                : undefined,
            );
          },
        );
      },
      ROLLOVER_INTERVAL_MS,
    );

    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async getAvailability(
    now = new Date(),
  ): Promise<WeeklySalesAvailability> {
    await this.reconcile(now);

    const draw =
      await this.prisma.lotteryDraw
        .findFirst({
          where: {
            type:
              DrawType.WEEKLY,
            status:
              DrawStatus.SALES_OPEN,
          },
          orderBy: [
            {
              scheduledDrawAt:
                'asc',
            },
            {
              sequenceNumber:
                'asc',
            },
          ],
        });

    if (!draw) {
      const latest =
        await this.prisma
          .lotteryDraw
          .findFirst({
            where: {
              type:
                DrawType.WEEKLY,
            },
            orderBy: {
              sequenceNumber:
                'desc',
            },
          });

      if (!latest) {
        return this.emptyAvailability(
          'NO_WEEKLY_DRAW',
        );
      }

      const cutoff =
        effectiveSalesCutoffAt(
          latest,
        );

      if (
        latest.salesOpenAt &&
        now <
          latest.salesOpenAt
      ) {
        return {
          available: false,
          reason:
            'SALES_NOT_STARTED',
          drawId: latest.id,
          publicId:
            latest.publicId,
          scheduledDrawAt:
            latest.scheduledDrawAt.toISOString(),
          effectiveCutoffAt:
            cutoff.toISOString(),
          ticketPriceMinor:
            latest.ticketPriceMinor.toString(),
          currency:
            latest.currency,
        };
      }

      return {
        available: false,
        reason:
          'SALES_CLOSED',
        drawId: latest.id,
        publicId:
          latest.publicId,
        scheduledDrawAt:
          latest.scheduledDrawAt.toISOString(),
        effectiveCutoffAt:
          cutoff.toISOString(),
        ticketPriceMinor:
          latest.ticketPriceMinor.toString(),
        currency:
          latest.currency,
      };
    }

    const reason =
      ticketSalesBlockReason(
        draw,
        now,
      );
    const cutoff =
      effectiveSalesCutoffAt(
        draw,
      );

    if (reason) {
      return {
        available: false,
        reason:
          draw.salesOpenAt &&
          now < draw.salesOpenAt
            ? 'SALES_NOT_STARTED'
            : 'SALES_CLOSED',
        drawId: draw.id,
        publicId:
          draw.publicId,
        scheduledDrawAt:
          draw.scheduledDrawAt.toISOString(),
        effectiveCutoffAt:
          cutoff.toISOString(),
        ticketPriceMinor:
          draw.ticketPriceMinor.toString(),
        currency: draw.currency,
      };
    }

    return {
      available: true,
      reason: 'AVAILABLE',
      drawId: draw.id,
      publicId:
        draw.publicId,
      scheduledDrawAt:
        draw.scheduledDrawAt.toISOString(),
      effectiveCutoffAt:
        cutoff.toISOString(),
      ticketPriceMinor:
        draw.ticketPriceMinor.toString(),
      currency:
        draw.currency,
    };
  }

  async reconcile(
    now = new Date(),
  ): Promise<LotteryDraw | null> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            20260811,
            2
          )
        `;

        let latest =
          await tx.lotteryDraw
            .findFirst({
              where: {
                type:
                  DrawType.WEEKLY,
                status: {
                  in: [
                    DrawStatus.SCHEDULED,
                    DrawStatus.SALES_OPEN,
                    DrawStatus.SALES_CLOSED,
                  ],
                },
              },
              orderBy: {
                sequenceNumber:
                  'desc',
              },
            });

        if (!latest) {
          return null;
        }

        const cutoff =
          effectiveSalesCutoffAt(
            latest,
          );

        if (
          now < cutoff
        ) {
          if (
            latest.status ===
              DrawStatus.SCHEDULED &&
            (
              !latest.salesOpenAt ||
              now >=
                latest.salesOpenAt
            )
          ) {
            latest =
              await tx.lotteryDraw
                .update({
                  where: {
                    id: latest.id,
                  },
                  data: {
                    status:
                      DrawStatus.SALES_OPEN,
                  },
                });
          }

          return latest;
        }

        if (
          latest.status ===
            DrawStatus.SALES_OPEN ||
          latest.status ===
            DrawStatus.SCHEDULED
        ) {
          latest =
            await tx.lotteryDraw
              .update({
                where: {
                  id: latest.id,
                },
                data: {
                  status:
                    DrawStatus.SALES_CLOSED,
                },
              });
        }

        const nextScheduledDrawAt =
          this.nextWeeklySlot(
            latest.scheduledDrawAt,
            now,
          );

        const nextSequenceNumber =
          latest.sequenceNumber + 1;
        const year =
          nextScheduledDrawAt
            .getUTCFullYear();

        return tx.lotteryDraw.create({
          data: {
            publicId:
              this.createPublicId(
                year,
                nextSequenceNumber,
              ),
            type:
              DrawType.WEEKLY,
            status:
              DrawStatus.SALES_OPEN,
            sequenceNumber:
              nextSequenceNumber,
            salesOpenAt: now,
            salesCloseAt: null,
            scheduledDrawAt:
              nextScheduledDrawAt,
            currency:
              latest.currency,
            ticketPriceMinor:
              latest.ticketPriceMinor,
            winnerCount:
              latest.winnerCount,
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

  private nextWeeklySlot(
    previousScheduledDrawAt: Date,
    now: Date,
  ): Date {
    let next =
      previousScheduledDrawAt
        .getTime() +
      WEEK_MS;

    const minimum =
      now.getTime() +
      SALES_CUTOFF_MS +
      1;

    if (next <= minimum) {
      const skipped =
        Math.floor(
          (minimum - next) /
            WEEK_MS,
        ) + 1;

      next +=
        skipped * WEEK_MS;
    }

    return new Date(next);
  }

  private createPublicId(
    year: number,
    sequenceNumber: number,
  ): string {
    return `W-${year}-${sequenceNumber
      .toString()
      .padStart(6, '0')}`;
  }

  private emptyAvailability(
    reason:
      | 'NO_WEEKLY_DRAW',
  ): WeeklySalesAvailability {
    return {
      available: false,
      reason,
      drawId: null,
      publicId: null,
      scheduledDrawAt: null,
      effectiveCutoffAt: null,
      ticketPriceMinor: null,
      currency: null,
    };
  }
}
