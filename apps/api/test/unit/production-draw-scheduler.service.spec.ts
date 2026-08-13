import {
  ConfigService,
} from '@nestjs/config';
import {
  DrawStatus,
} from '@prisma/client';

import {
  PrismaService,
} from '../../src/prisma/prisma.service';
import {
  ProductionDrawSchedulerService,
} from '../../src/workers/production-draw-scheduler.service';

describe(
  'ProductionDrawSchedulerService',
  () => {
    const queryRaw =
      jest.fn();
    const findUnique =
      jest.fn();
    const updateMany =
      jest.fn();

    const tx = {
      $queryRaw:
        queryRaw,
      lotteryDraw: {
        findUnique,
        updateMany,
      },
    };

    const prisma = {
      $transaction:
        jest.fn(
          async (
            callback:
              (value: typeof tx) =>
                unknown,
          ) =>
            callback(tx),
        ),
    } as unknown as PrismaService;

    const config = {
      get:
        jest.fn(),
    } as unknown as ConfigService;

    const service =
      new ProductionDrawSchedulerService(
        prisma,
        config,
      );

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it(
      'opens due scheduled sales',
      async () => {
        queryRaw.mockResolvedValue([
          {
            id:
              'draw-1',
            status:
              DrawStatus.SCHEDULED,
          },
        ]);

        findUnique.mockResolvedValue({
          id:
            'draw-1',
          status:
            DrawStatus.SCHEDULED,
          salesCloseAt:
            new Date(
              Date.now() +
                60_000,
            ),
        });

        updateMany.mockResolvedValue({
          count:
            1,
        });

        await expect(
          service.processNext(),
        ).resolves.toBe(true);

        expect(
          updateMany,
        ).toHaveBeenCalledWith({
          where: {
            id:
              'draw-1',
            status:
              DrawStatus.SCHEDULED,
          },
          data: {
            status:
              DrawStatus.SALES_OPEN,
          },
        });
      },
    );

    it(
      'closes due open sales',
      async () => {
        queryRaw.mockResolvedValue([
          {
            id:
              'draw-2',
            status:
              DrawStatus.SALES_OPEN,
          },
        ]);

        findUnique.mockResolvedValue({
          id:
            'draw-2',
          status:
            DrawStatus.SALES_OPEN,
          salesCloseAt:
            new Date(
              Date.now() -
                1_000,
            ),
        });

        updateMany.mockResolvedValue({
          count:
            1,
        });

        await expect(
          service.processNext(),
        ).resolves.toBe(true);

        expect(
          updateMany,
        ).toHaveBeenCalledWith({
          where: {
            id:
              'draw-2',
            status:
              DrawStatus.SALES_OPEN,
          },
          data: {
            status:
              DrawStatus.SALES_CLOSED,
          },
        });
      },
    );

    it(
      'fails closed to manual review when a scheduled draw missed the whole sales window',
      async () => {
        queryRaw.mockResolvedValue([
          {
            id:
              'draw-3',
            status:
              DrawStatus.SCHEDULED,
          },
        ]);

        findUnique.mockResolvedValue({
          id:
            'draw-3',
          status:
            DrawStatus.SCHEDULED,
          salesCloseAt:
            new Date(
              Date.now() -
                1_000,
            ),
        });

        updateMany.mockResolvedValue({
          count:
            1,
        });

        await expect(
          service.processNext(),
        ).resolves.toBe(true);

        expect(
          updateMany,
        ).toHaveBeenCalledWith({
          where: {
            id:
              'draw-3',
            status:
              DrawStatus.SCHEDULED,
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