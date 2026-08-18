import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DrawStatus } from '@prisma/client';

import { LotteryDrawsService } from '../lottery-draws/lottery-draws.service';
import { DrawPrismaService } from '../prisma/prisma.service';
import { RandomnessEvidenceService } from '../randomness/randomness-evidence.service';
import { SnapshotBuilderService } from '../snapshots/snapshot-builder.service';
import { SnapshotFinalizerService } from '../snapshots/snapshot-finalizer.service';
import { WinnerSelectionService } from '../winners/winner-selection.service';

const RANDOMNESS_PENDING_STALE_MS =
  2 * 60_000;

export type AutomatedDrawLifecycleAction =
  | 'IDLE'
  | 'SNAPSHOT_BUILT'
  | 'SNAPSHOT_FINALIZED'
  | 'RANDOMNESS_VERIFIED'
  | 'WINNERS_AND_PRIZES_FINALIZED'
  | 'DRAW_PUBLISHED'
  | 'DRAW_ALREADY_PUBLISHED'
  | 'STALE_RANDOMNESS_TO_MANUAL_REVIEW'
  | 'DRAW_STAGE_TO_MANUAL_REVIEW'
  | 'DRAW_STATE_CHANGED';

export type AutomatedDrawLifecycleResult = {
  processed: boolean;
  action: AutomatedDrawLifecycleAction;
  drawId: string | null;
};

@Injectable()
export class AutomatedDrawLifecycleService {
  private readonly logger =
    new Logger(
      AutomatedDrawLifecycleService.name,
    );

  constructor(
    private readonly prisma: DrawPrismaService,
    private readonly snapshotBuilder: SnapshotBuilderService,
    private readonly snapshotFinalizer: SnapshotFinalizerService,
    private readonly randomness: RandomnessEvidenceService,
    private readonly winnerSelection: WinnerSelectionService,
    private readonly lotteryDraws: LotteryDrawsService,
  ) {}

  async processNext(
    now: Date = new Date(),
  ): Promise<AutomatedDrawLifecycleResult> {
    const staleRandomness =
      await this.processStaleRandomnessPending(
        now,
      );

    if (staleRandomness) {
      return staleRandomness;
    }

    const draw =
      await this.prisma.lotteryDraw.findFirst({
        where: {
          OR: [
            {
              status:
                DrawStatus.SALES_CLOSED,
            },
            {
              status:
                DrawStatus.SNAPSHOT_BUILDING,
            },
            {
              status:
                DrawStatus.SNAPSHOT_FINALIZED,
              scheduledDrawAt: {
                lte: now,
              },
            },
            {
              status: {
                in: [
                  DrawStatus.RANDOMNESS_VERIFIED,
                  DrawStatus.WINNER_SELECTION_PENDING,
                  DrawStatus.COMPLETED,
                ],
              },
            },
          ],
        },
        orderBy: [
          {
            scheduledDrawAt:
              'asc',
          },
          {
            createdAt:
              'asc',
          },
        ],
        select: {
          id: true,
          status: true,
        },
      });

    if (!draw) {
      return {
        processed: false,
        action: 'IDLE',
        drawId: null,
      };
    }

    switch (draw.status) {
      case DrawStatus.SALES_CLOSED:
        return this.runProtectedStage(
          draw.id,
          DrawStatus.SALES_CLOSED,
          'SNAPSHOT_BUILT',
          () =>
            this.snapshotBuilder.build(
              draw.id,
            ),
        );

      case DrawStatus.SNAPSHOT_BUILDING:
        return this.runProtectedStage(
          draw.id,
          DrawStatus.SNAPSHOT_BUILDING,
          'SNAPSHOT_FINALIZED',
          () =>
            this.snapshotFinalizer.finalize(
              draw.id,
            ),
        );

      case DrawStatus.SNAPSHOT_FINALIZED:
        return this.runProtectedStage(
          draw.id,
          DrawStatus.SNAPSHOT_FINALIZED,
          'RANDOMNESS_VERIFIED',
          () =>
            this.randomness.requestAndVerify(
              draw.id,
            ),
        );

      case DrawStatus.RANDOMNESS_VERIFIED:
      case DrawStatus.WINNER_SELECTION_PENDING:
        return this.runProtectedStage(
          draw.id,
          draw.status,
          'WINNERS_AND_PRIZES_FINALIZED',
          () =>
            this.winnerSelection.finalize(
              draw.id,
            ),
        );

      case DrawStatus.COMPLETED:
        return this.publish(draw.id);

      default:
        return {
          processed: false,
          action: 'IDLE',
          drawId: null,
        };
    }
  }

  private async processStaleRandomnessPending(
    now: Date,
  ): Promise<AutomatedDrawLifecycleResult | null> {
    const staleBefore =
      new Date(
        now.getTime() -
          RANDOMNESS_PENDING_STALE_MS,
      );

    const stale =
      await this.prisma.lotteryDraw.findFirst({
        where: {
          status:
            DrawStatus.RANDOMNESS_PENDING,
          updatedAt: {
            lte: staleBefore,
          },
        },
        orderBy: [
          {
            updatedAt:
              'asc',
          },
          {
            createdAt:
              'asc',
          },
        ],
        select: {
          id: true,
        },
      });

    if (!stale) {
      return null;
    }

    const moved =
      await this.prisma.lotteryDraw.updateMany({
        where: {
          id: stale.id,
          status:
            DrawStatus.RANDOMNESS_PENDING,
          updatedAt: {
            lte: staleBefore,
          },
        },
        data: {
          status:
            DrawStatus.MANUAL_REVIEW,
        },
      });

    if (moved.count !== 1) {
      return null;
    }

    this.logger.error(
      `Draw ${stale.id} remained in RANDOMNESS_PENDING beyond the safe recovery timeout and was moved to manual review. Automatic randomness retry is forbidden.`,
    );

    return {
      processed: true,
      action:
        'STALE_RANDOMNESS_TO_MANUAL_REVIEW',
      drawId:
        stale.id,
    };
  }

  private async runProtectedStage(
    drawId: string,
    expectedStatus: DrawStatus,
    successAction:
      AutomatedDrawLifecycleAction,
    operation: () => Promise<unknown>,
  ): Promise<AutomatedDrawLifecycleResult> {
    try {
      await operation();

      return {
        processed: true,
        action:
          successAction,
        drawId,
      };
    } catch (error) {
      if (
        !(
          error instanceof
          ConflictException
        )
      ) {
        throw error;
      }

      return this.failClosedDomainConflict(
        drawId,
        expectedStatus,
        error,
      );
    }
  }

  private async failClosedDomainConflict(
    drawId: string,
    expectedStatus: DrawStatus,
    error: ConflictException,
  ): Promise<AutomatedDrawLifecycleResult> {
    const moved =
      await this.prisma.lotteryDraw.updateMany({
        where: {
          id:
            drawId,
          status:
            expectedStatus,
        },
        data: {
          status:
            DrawStatus.MANUAL_REVIEW,
        },
      });

    if (moved.count === 1) {
      this.logger.error(
        `Draw ${drawId} encountered a deterministic lifecycle conflict in ${expectedStatus} and was moved to manual review: ${error.message}`,
      );

      return {
        processed: true,
        action:
          'DRAW_STAGE_TO_MANUAL_REVIEW',
        drawId,
      };
    }

    const current =
      await this.prisma.lotteryDraw.findUnique({
        where: {
          id:
            drawId,
        },
        select: {
          status:
            true,
        },
      });

    if (
      current &&
      current.status !==
        expectedStatus
    ) {
      return {
        processed: true,
        action:
          'DRAW_STATE_CHANGED',
        drawId,
      };
    }

    throw error;
  }

  private async publish(
    drawId: string,
  ): Promise<AutomatedDrawLifecycleResult> {
    try {
      await this.lotteryDraws.publish(
        drawId,
      );

      return {
        processed: true,
        action:
          'DRAW_PUBLISHED',
        drawId,
      };
    } catch (error) {
      const current =
        await this.prisma.lotteryDraw.findUnique({
          where: {
            id:
              drawId,
          },
          select: {
            status:
              true,
          },
        });

      if (
        current?.status ===
        DrawStatus.PUBLISHED
      ) {
        return {
          processed: true,
          action:
            'DRAW_ALREADY_PUBLISHED',
          drawId,
        };
      }

      if (
        error instanceof
          ConflictException &&
        current?.status ===
          DrawStatus.COMPLETED
      ) {
        return this.failClosedDomainConflict(
          drawId,
          DrawStatus.COMPLETED,
          error,
        );
      }

      if (
        current &&
        current.status !==
          DrawStatus.COMPLETED
      ) {
        return {
          processed: true,
          action:
            'DRAW_STATE_CHANGED',
          drawId,
        };
      }

      throw error;
    }
  }
}