import {
  ConflictException,
} from '@nestjs/common';
import {
  DrawStatus,
} from '@prisma/client';

import {
  AutomatedDrawLifecycleService,
} from '../../src/workers/automated-draw-lifecycle.service';

describe(
  'AutomatedDrawLifecycleService',
  () => {
    const findFirst =
      jest.fn();
    const findUnique =
      jest.fn();
    const updateMany =
      jest.fn();

    const build =
      jest.fn();
    const finalizeSnapshot =
      jest.fn();
    const requestAndVerify =
      jest.fn();
    const finalizeWinners =
      jest.fn();
    const publish =
      jest.fn();

    const service =
      new AutomatedDrawLifecycleService(
        {
          lotteryDraw: {
            findFirst,
            findUnique,
            updateMany,
          },
        } as never,
        {
          build,
        } as never,
        {
          finalize:
            finalizeSnapshot,
        } as never,
        {
          requestAndVerify,
        } as never,
        {
          finalize:
            finalizeWinners,
        } as never,
        {
          publish,
        } as never,
      );

    beforeEach(() => {
      jest.clearAllMocks();
    });

    function queueLifecycleDraw(
      status: DrawStatus,
      id = 'draw-1',
    ) {
      findFirst
        .mockResolvedValueOnce(
          null,
        )
        .mockResolvedValueOnce({
          id,
          status,
        });
    }

    it.each([
      [
        DrawStatus.SALES_CLOSED,
        build,
        'SNAPSHOT_BUILT',
      ],
      [
        DrawStatus.SNAPSHOT_BUILDING,
        finalizeSnapshot,
        'SNAPSHOT_FINALIZED',
      ],
      [
        DrawStatus.SNAPSHOT_FINALIZED,
        requestAndVerify,
        'RANDOMNESS_VERIFIED',
      ],
      [
        DrawStatus.RANDOMNESS_VERIFIED,
        finalizeWinners,
        'WINNERS_AND_PRIZES_FINALIZED',
      ],
      [
        DrawStatus.WINNER_SELECTION_PENDING,
        finalizeWinners,
        'WINNERS_AND_PRIZES_FINALIZED',
      ],
    ])(
      'advances %s through exactly one lifecycle stage',
      async (
        status,
        expectedCall,
        expectedAction,
      ) => {
        queueLifecycleDraw(
          status,
        );

        expectedCall
          .mockResolvedValue({});

        await expect(
          service.processNext(
            new Date(
              '2026-08-13T20:00:00.000Z',
            ),
          ),
        ).resolves.toEqual({
          processed:
            true,
          action:
            expectedAction,
          drawId:
            'draw-1',
        });

        expect(
          expectedCall,
        ).toHaveBeenCalledWith(
          'draw-1',
        );
      },
    );

    it(
      'publishes completed draw',
      async () => {
        queueLifecycleDraw(
          DrawStatus.COMPLETED,
          'draw-2',
        );

        publish
          .mockResolvedValue({});

        await expect(
          service.processNext(),
        ).resolves.toEqual({
          processed:
            true,
          action:
            'DRAW_PUBLISHED',
          drawId:
            'draw-2',
        });
      },
    );

    it(
      'treats concurrent successful publication as idempotent success',
      async () => {
        queueLifecycleDraw(
          DrawStatus.COMPLETED,
          'draw-3',
        );

        publish
          .mockRejectedValue(
            new Error(
              'concurrent publication',
            ),
          );

        findUnique
          .mockResolvedValue({
            status:
              DrawStatus.PUBLISHED,
          });

        await expect(
          service.processNext(),
        ).resolves.toEqual({
          processed:
            true,
          action:
            'DRAW_ALREADY_PUBLISHED',
          drawId:
            'draw-3',
        });
      },
    );

    it(
      'does not request randomness before scheduled draw time',
      async () => {
        findFirst
          .mockResolvedValueOnce(
            null,
          )
          .mockResolvedValueOnce(
            null,
          );

        const now =
          new Date(
            '2026-08-13T20:00:00.000Z',
          );

        await expect(
          service.processNext(
            now,
          ),
        ).resolves.toEqual({
          processed:
            false,
          action:
            'IDLE',
          drawId:
            null,
        });

        expect(
          findFirst,
        ).toHaveBeenLastCalledWith(
          expect.objectContaining({
            where: {
              OR:
                expect.arrayContaining([
                  expect.objectContaining({
                    status:
                      DrawStatus
                        .SNAPSHOT_FINALIZED,
                    scheduledDrawAt: {
                      lte:
                        now,
                    },
                  }),
                ]),
            },
          }),
        );

        expect(
          requestAndVerify,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'moves stale RANDOMNESS_PENDING to manual review without retrying provider',
      async () => {
        findFirst
          .mockResolvedValueOnce({
            id:
              'draw-stale',
          });

        updateMany
          .mockResolvedValue({
            count:
              1,
          });

        await expect(
          service.processNext(
            new Date(
              '2026-08-13T20:00:00.000Z',
            ),
          ),
        ).resolves.toEqual({
          processed:
            true,
          action:
            'STALE_RANDOMNESS_TO_MANUAL_REVIEW',
          drawId:
            'draw-stale',
        });

        expect(
          updateMany,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where:
              expect.objectContaining({
                id:
                  'draw-stale',
                status:
                  DrawStatus
                    .RANDOMNESS_PENDING,
              }),
            data: {
              status:
                DrawStatus
                  .MANUAL_REVIEW,
            },
          }),
        );

        expect(
          requestAndVerify,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'moves deterministic lifecycle conflict to manual review so queue can continue',
      async () => {
        queueLifecycleDraw(
          DrawStatus.SALES_CLOSED,
          'draw-blocked',
        );

        build
          .mockRejectedValue(
            new ConflictException(
              'unresolved purchase blocks snapshot',
            ),
          );

        updateMany
          .mockResolvedValue({
            count:
              1,
          });

        await expect(
          service.processNext(),
        ).resolves.toEqual({
          processed:
            true,
          action:
            'DRAW_STAGE_TO_MANUAL_REVIEW',
          drawId:
            'draw-blocked',
        });

        expect(
          updateMany,
        ).toHaveBeenCalledWith({
          where: {
            id:
              'draw-blocked',
            status:
              DrawStatus.SALES_CLOSED,
          },
          data: {
            status:
              DrawStatus.MANUAL_REVIEW,
          },
        });
      },
    );
  },
);