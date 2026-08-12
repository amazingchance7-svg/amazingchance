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
  'NotificationOutboxService',
  () => {
    it(
      'delivers a claimed purchase notification and marks it sent',
      async () => {
        const update =
          jest
            .fn()
            .mockResolvedValueOnce({
              id:
                'outbox-id',
              type:
                NotificationOutboxType
                  .PURCHASE_COMPLETED,
              status:
                NotificationOutboxStatus
                  .PROCESSING,
              recipientEmail:
                'user@example.com',
              payload: {
                purchasePublicId:
                  'PUR-123',
                drawPublicId:
                  'DRAW-123',
                ticketNumbers: [
                  '1',
                  '2',
                ],
              },
              attempts:
                1,
            })
            .mockResolvedValueOnce({});

        const prisma = {
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
                            'outbox-id',
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
        };

        const sendPurchaseConfirmation =
          jest.fn()
            .mockResolvedValue(
              undefined,
            );

        const service =
          new NotificationOutboxService(
            prisma as never,
            {
              sendPurchaseConfirmation,
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
          sendPurchaseConfirmation,
        ).toHaveBeenCalledWith(
          'user@example.com',
          {
            purchasePublicId:
              'PUR-123',
            drawPublicId:
              'DRAW-123',
            ticketNumbers: [
              '1',
              '2',
            ],
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
                lockedAt:
                  null,
                lastError:
                  null,
              }),
          }),
        );
      },
    );

    it(
      'records a safe retry state when delivery fails',
      async () => {
        const update =
          jest
            .fn()
            .mockResolvedValueOnce({
              id:
                'outbox-id',
              type:
                NotificationOutboxType
                  .PURCHASE_COMPLETED,
              status:
                NotificationOutboxStatus
                  .PROCESSING,
              recipientEmail:
                'user@example.com',
              payload: {
                purchasePublicId:
                  'PUR-123',
                drawPublicId:
                  'DRAW-123',
                ticketNumbers: [
                  '1',
                ],
              },
              attempts:
                2,
            })
            .mockResolvedValueOnce({});

        const prisma = {
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
                            'outbox-id',
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
        };

        const service =
          new NotificationOutboxService(
            prisma as never,
            {
              sendPurchaseConfirmation:
                jest
                  .fn()
                  .mockRejectedValue(
                    new Error(
                      'provider leaked sensitive response',
                    ),
                  ),
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
          update,
        ).toHaveBeenLastCalledWith(
          expect.objectContaining({
            data:
              expect.objectContaining({
                status:
                  NotificationOutboxStatus
                    .FAILED,
                lockedAt:
                  null,
                lastError:
                  'DELIVERY_FAILED',
              }),
          }),
        );

        const finalCall =
          update.mock
            .calls[1][0];

        expect(
          JSON.stringify(
            finalCall,
          ),
        ).not.toContain(
          'provider leaked sensitive response',
        );
      },
    );

    it(
      'returns false when no notification is due',
      async () => {
        const service =
          new NotificationOutboxService(
            {
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
                          .mockResolvedValue(
                            [],
                          ),
                    }),
                ),
            } as never,
            {} as never,
            new ConfigService({
              NODE_ENV:
                'test',
            }),
          );

        await expect(
          service.processNext(),
        ).resolves.toBe(
          false,
        );
      },
    );
  },
);
