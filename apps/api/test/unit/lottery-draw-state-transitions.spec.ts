import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  DrawStatus,
  DrawType,
  LotteryDraw,
} from '@prisma/client';

import { LotteryDrawsService } from '../../src/lottery-draws/lottery-draws.service';
import { PrismaService } from '../../src/prisma/prisma.service';

const DRAW_ID =
  '11111111-1111-4111-8111-111111111111';

function createDraw(
  status: DrawStatus,
): LotteryDraw {
  const now =
    new Date(
      '2026-08-03T00:00:00.000Z',
    );

  return {
    id: DRAW_ID,
    publicId:
      'W-2026-000001',
    type:
      DrawType.WEEKLY,
    status,
    sequenceNumber:
      1,
    participationYear:
      null,
    salesOpenAt:
      new Date(
        '2026-08-01T00:00:00.000Z',
      ),
    salesCloseAt:
      new Date(
        '2026-08-02T00:00:00.000Z',
      ),
    scheduledDrawAt:
      new Date(
        '2026-08-03T00:00:00.000Z',
      ),
    completedAt:
      status ===
      DrawStatus.COMPLETED
        ? now
        : null,
    publishedAt:
      status ===
      DrawStatus.PUBLISHED
        ? now
        : null,
    currency:
      'USD',
    ticketPriceMinor:
      100n,
    winnerCount:
      3,
    createdAt:
      now,
    updatedAt:
      now,
  };
}

describe(
  'Lottery draw state transitions',
  () => {
    const updateMany =
      jest.fn();
    const findUnique =
      jest.fn();

    const txFindUnique =
      jest.fn();
    const txFindUniqueOrThrow =
      jest.fn();
    const txUpdateMany =
      jest.fn();
    const createManyNotifications =
      jest.fn();

    const tx = {
      lotteryDraw: {
        findUnique:
          txFindUnique,
        findUniqueOrThrow:
          txFindUniqueOrThrow,
        updateMany:
          txUpdateMany,
      },
      notificationOutbox: {
        createMany:
          createManyNotifications,
      },
    };

    const transaction =
      jest.fn(
        async (
          callback: (
            txClient:
              typeof tx,
          ) => Promise<unknown>,
        ) =>
          callback(tx),
      );

    const prisma = {
      lotteryDraw: {
        updateMany,
        findUnique,
      },
      $transaction:
        transaction,
    } as unknown as PrismaService;

    const service =
      new LotteryDrawsService(
        prisma,
      );

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it(
      'opens sales only from SCHEDULED',
      async () => {
        updateMany
          .mockResolvedValue({
            count:
              1,
          });
        findUnique
          .mockResolvedValue(
            createDraw(
              DrawStatus
                .SALES_OPEN,
            ),
          );

        const result =
          await service.openSales(
            DRAW_ID,
          );

        expect(
          updateMany,
        ).toHaveBeenCalledWith({
          where: {
            id:
              DRAW_ID,
            status: {
              in: [
                DrawStatus
                  .SCHEDULED,
              ],
            },
          },
          data: {
            status:
              DrawStatus
                .SALES_OPEN,
          },
        });

        expect(
          result.status,
        ).toBe(
          DrawStatus
            .SALES_OPEN,
        );
      },
    );

    it(
      'closes sales only from SALES_OPEN',
      async () => {
        updateMany
          .mockResolvedValue({
            count:
              1,
          });
        findUnique
          .mockResolvedValue(
            createDraw(
              DrawStatus
                .SALES_CLOSED,
            ),
          );

        const result =
          await service.closeSales(
            DRAW_ID,
          );

        expect(
          result.status,
        ).toBe(
          DrawStatus
            .SALES_CLOSED,
        );
      },
    );

    it(
      'cancels only a scheduled or open draw',
      async () => {
        updateMany
          .mockResolvedValue({
            count:
              1,
          });
        findUnique
          .mockResolvedValue(
            createDraw(
              DrawStatus
                .CANCELLED,
            ),
          );

        const result =
          await service.cancel(
            DRAW_ID,
          );

        expect(
          result.status,
        ).toBe(
          DrawStatus
            .CANCELLED,
        );
      },
    );

    it(
      'publishes only a completed draw and enqueues notifications atomically',
      async () => {
        const completed =
          createDraw(
            DrawStatus
              .COMPLETED,
          );

        txFindUnique
          .mockResolvedValue({
            ...completed,
            winners: [
              {
                id:
                  'winner-1',
                rank:
                  1,
                ticket: {
                  publicId:
                    'TKT-1',
                  user: {
                    id:
                      'user-1',
                    email:
                      'winner1@example.com',
                  },
                },
              },
              {
                id:
                  'winner-2',
                rank:
                  2,
                ticket: {
                  publicId:
                    'TKT-2',
                  user: {
                    id:
                      'user-2',
                    email:
                      'winner2@example.com',
                  },
                },
              },
              {
                id:
                  'winner-3',
                rank:
                  3,
                ticket: {
                  publicId:
                    'TKT-3',
                  user: {
                    id:
                      'user-3',
                    email:
                      'winner3@example.com',
                  },
                },
              },
            ],
            tickets: [
              {
                user: {
                  id:
                    'user-1',
                  email:
                    'winner1@example.com',
                },
              },
              {
                user: {
                  id:
                    'user-4',
                  email:
                    'participant@example.com',
                },
              },
            ],
          });

        txUpdateMany
          .mockResolvedValue({
            count:
              1,
          });

        createManyNotifications
          .mockResolvedValue({
            count:
              5,
          });

        txFindUniqueOrThrow
          .mockResolvedValue({
            ...createDraw(
              DrawStatus
                .PUBLISHED,
            ),
            publishedAt:
              new Date(),
          });

        const result =
          await service.publish(
            DRAW_ID,
          );

        expect(
          transaction,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          txUpdateMany,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id:
                DRAW_ID,
              status:
                DrawStatus
                  .COMPLETED,
            },
            data:
              expect.objectContaining({
                status:
                  DrawStatus
                    .PUBLISHED,
                publishedAt:
                  expect.any(Date),
              }),
          }),
        );

        expect(
          createManyNotifications,
        ).toHaveBeenCalledWith({
          data:
            expect.arrayContaining([
              expect.objectContaining({
                idempotencyKey:
                  `draw-winner:${DRAW_ID}:winner-1`,
                recipientEmail:
                  'winner1@example.com',
              }),
              expect.objectContaining({
                idempotencyKey:
                  `draw-published:${DRAW_ID}:user-4`,
                recipientEmail:
                  'participant@example.com',
              }),
            ]),
          skipDuplicates:
            true,
        });

        expect(
          result.status,
        ).toBe(
          DrawStatus
            .PUBLISHED,
        );
      },
    );

    it(
      'rejects publishing when winner records are incomplete',
      async () => {
        const completed =
          createDraw(
            DrawStatus
              .COMPLETED,
          );

        txFindUnique
          .mockResolvedValue({
            ...completed,
            winners: [],
            tickets: [],
          });

        await expect(
          service.publish(
            DRAW_ID,
          ),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );

        expect(
          txUpdateMany,
        ).not.toHaveBeenCalled();
        expect(
          createManyNotifications,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'rejects an invalid transition',
      async () => {
        updateMany
          .mockResolvedValue({
            count:
              0,
          });
        findUnique
          .mockResolvedValue({
            status:
              DrawStatus
                .SALES_CLOSED,
          });

        await expect(
          service.openSales(
            DRAW_ID,
          ),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );
      },
    );

    it(
      'returns not found for a missing draw',
      async () => {
        updateMany
          .mockResolvedValue({
            count:
              0,
          });
        findUnique
          .mockResolvedValue(
            null,
          );

        await expect(
          service.closeSales(
            DRAW_ID,
          ),
        ).rejects.toBeInstanceOf(
          NotFoundException,
        );
      },
    );
  },
);
