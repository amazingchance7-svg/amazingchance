import {
  ConfigService,
} from '@nestjs/config';
import {
  NotificationOutboxStatus,
  NotificationOutboxType,
} from '@prisma/client';

import {
  NotificationOutboxService,
} from '../../src/notifications/notification-outbox.service';

describe(
  'NotificationOutboxService draw notifications',
  () => {
    function createPrisma(
      item: {
        id: string;
        type:
          NotificationOutboxType;
        recipientEmail: string;
        payload: unknown;
        attempts: number;
      },
    ) {
      const update =
        jest
          .fn()
          .mockResolvedValueOnce({
            ...item,
            status:
              NotificationOutboxStatus
                .PROCESSING,
          })
          .mockResolvedValueOnce({});

      return {
        prisma: {
          $transaction:
            jest.fn(
              async (
                callback: (
                  tx: unknown,
                ) => unknown,
              ) =>
                callback({
                  $queryRaw:
                    jest.fn()
                      .mockResolvedValue([
                        {
                          id:
                            item.id,
                        },
                      ]),
                  notificationOutbox: {
                    update,
                  },
                }),
            ),
          notificationOutbox: {
            update,
          },
        },
        update,
      };
    }

    it(
      'dispatches winner notification',
      async () => {
        const {
          prisma,
          update,
        } =
          createPrisma({
            id:
              'winner-outbox',
            type:
              NotificationOutboxType
                .DRAW_WINNER,
            recipientEmail:
              'winner@example.com',
            payload: {
              drawPublicId:
                'W-2026-001',
              rank:
                1,
              ticketPublicId:
                'TKT-001',
            },
            attempts:
              1,
          });

        const sendWinnerNotification =
          jest.fn()
            .mockResolvedValue(
              undefined,
            );

        const service =
          new NotificationOutboxService(
            prisma as never,
            {
              sendWinnerNotification,
            } as never,
            new ConfigService({
              NODE_ENV:
                'test',
            }),
          );

        await expect(
          service.processNext(),
        ).resolves.toBe(true);

        expect(
          sendWinnerNotification,
        ).toHaveBeenCalledWith(
          'winner@example.com',
          {
            drawPublicId:
              'W-2026-001',
            rank:
              1,
            ticketPublicId:
              'TKT-001',
          },
        );

        expect(
          update,
        ).toHaveBeenLastCalledWith(
          expect.objectContaining({
            data:
              expect.objectContaining({
                status:
                  NotificationOutboxStatus
                    .SENT,
              }),
          }),
        );
      },
    );

    it(
      'dispatches published draw notification',
      async () => {
        const {
          prisma,
        } =
          createPrisma({
            id:
              'published-outbox',
            type:
              NotificationOutboxType
                .DRAW_PUBLISHED,
            recipientEmail:
              'participant@example.com',
            payload: {
              drawPublicId:
                'W-2026-001',
            },
            attempts:
              1,
          });

        const sendDrawPublishedNotification =
          jest.fn()
            .mockResolvedValue(
              undefined,
            );

        const service =
          new NotificationOutboxService(
            prisma as never,
            {
              sendDrawPublishedNotification,
            } as never,
            new ConfigService({
              NODE_ENV:
                'test',
            }),
          );

        await expect(
          service.processNext(),
        ).resolves.toBe(true);

        expect(
          sendDrawPublishedNotification,
        ).toHaveBeenCalledWith(
          'participant@example.com',
          {
            drawPublicId:
              'W-2026-001',
          },
        );
      },
    );
  },
);
