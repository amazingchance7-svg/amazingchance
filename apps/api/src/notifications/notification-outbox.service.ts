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
  NotificationOutboxStatus,
  NotificationOutboxType,
} from '@prisma/client';

import {
  EmailService,
} from '../email/email.service';
import {
  PrismaService,
} from '../prisma/prisma.service';

type ClaimedOutboxRow = {
  id: string;
};

type PurchaseCompletedPayload = {
  purchasePublicId: string;
  drawPublicId: string;
  ticketNumbers: string[];
};
type DrawWinnerPayload = {
  drawPublicId: string;
  rank: number;
  ticketPublicId: string;
};

type DrawPublishedPayload = {
  drawPublicId: string;
};

const POLL_INTERVAL_MS =
  5_000;

const STALE_LOCK_MS =
  5 * 60 * 1_000;

const MAX_RETRY_DELAY_MS =
  60 * 60 * 1_000;

@Injectable()
export class NotificationOutboxService
  implements
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger =
    new Logger(
      NotificationOutboxService.name,
    );

  private timer:
    NodeJS.Timeout |
    undefined;

  constructor(
    private readonly prisma:
      PrismaService,
    private readonly emailService:
      EmailService,
    private readonly configService:
      ConfigService,
  ) {}

  onModuleInit(): void {
    if (
      this.configService
        .get<string>(
          'NODE_ENV',
        ) !==
      'production'
    ) {
      return;
    }

    this.timer =
      setInterval(
        () => {
          void this.processNext()
            .catch(() => {
              this.logger.error(
                'Notification outbox worker iteration failed.',
              );
            });
        },
        POLL_INTERVAL_MS,
      );

    this.timer.unref();

    void this.processNext()
      .catch(() => {
        this.logger.error(
          'Notification outbox worker startup iteration failed.',
        );
      });
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

  async processNext():
    Promise<boolean> {
    const item =
      await this.claimNext();

    if (!item) {
      return false;
    }

    try {
      switch (item.type) {
        case NotificationOutboxType
          .PURCHASE_COMPLETED: {
          const payload =
            this.parsePurchaseCompletedPayload(
              item.payload,
            );

          await this.emailService
            .sendPurchaseConfirmation(
              item.recipientEmail,
              payload,
            );
          break;
        }

        case NotificationOutboxType
          .DRAW_WINNER: {
          const payload =
            this.parseDrawWinnerPayload(
              item.payload,
            );

          await this.emailService
            .sendWinnerNotification(
              item.recipientEmail,
              payload,
            );
          break;
        }

        case NotificationOutboxType
          .DRAW_PUBLISHED: {
          const payload =
            this.parseDrawPublishedPayload(
              item.payload,
            );

          await this.emailService
            .sendDrawPublishedNotification(
              item.recipientEmail,
              payload,
            );
          break;
        }
      }

      await this.prisma
        .notificationOutbox
        .update({
          where: {
            id:
              item.id,
          },
          data: {
            status:
              NotificationOutboxStatus
                .SENT,
            sentAt:
              new Date(),
            lockedAt:
              null,
            lastError:
              null,
          },
        });

      return true;
    } catch {
      const delayMs =
        Math.min(
          60_000 *
            2 **
              Math.max(
                item.attempts -
                  1,
                0,
              ),
          MAX_RETRY_DELAY_MS,
        );

      await this.prisma
        .notificationOutbox
        .update({
          where: {
            id:
              item.id,
          },
          data: {
            status:
              NotificationOutboxStatus
                .FAILED,
            lockedAt:
              null,
            lastError:
              'DELIVERY_FAILED',
            nextAttemptAt:
              new Date(
                Date.now() +
                  delayMs,
              ),
          },
        });

      return true;
    }
  }

  private async claimNext() {
    return this.prisma
      .$transaction(
        async (tx) => {
          const staleBefore =
            new Date(
              Date.now() -
                STALE_LOCK_MS,
            );

          const rows =
            await tx.$queryRaw<
              ClaimedOutboxRow[]
            >`
              SELECT "id"
              FROM "notification_outbox"
              WHERE
                (
                  "status" IN (
                    'PENDING',
                    'FAILED'
                  )
                  AND "nextAttemptAt" <= NOW()
                )
                OR (
                  "status" = 'PROCESSING'
                  AND "lockedAt" < ${staleBefore}
                )
              ORDER BY "createdAt" ASC
              LIMIT 1
              FOR UPDATE SKIP LOCKED
            `;

          const row =
            rows[0];

          if (!row) {
            return null;
          }

          return tx
            .notificationOutbox
            .update({
              where: {
                id:
                  row.id,
              },
              data: {
                status:
                  NotificationOutboxStatus
                    .PROCESSING,
                lockedAt:
                  new Date(),
                attempts: {
                  increment:
                    1,
                },
              },
            });
        },
      );
  }

  private parseDrawWinnerPayload(
    value: unknown,
  ): DrawWinnerPayload {
    if (
      !value ||
      Array.isArray(value) ||
      typeof value !==
        'object'
    ) {
      throw new Error(
        'Invalid draw-winner notification payload',
      );
    }

    const payload =
      value as Record<
        string,
        unknown
      >;

    if (
      typeof payload[
        'drawPublicId'
      ] !== 'string' ||
      typeof payload[
        'rank'
      ] !== 'number' ||
      !Number.isInteger(
        payload['rank'],
      ) ||
      payload['rank'] < 1 ||
      typeof payload[
        'ticketPublicId'
      ] !== 'string'
    ) {
      throw new Error(
        'Invalid draw-winner notification payload',
      );
    }

    return {
      drawPublicId:
        payload[
          'drawPublicId'
        ] as string,
      rank:
        payload[
          'rank'
        ] as number,
      ticketPublicId:
        payload[
          'ticketPublicId'
        ] as string,
    };
  }

  private parseDrawPublishedPayload(
    value: unknown,
  ): DrawPublishedPayload {
    if (
      !value ||
      Array.isArray(value) ||
      typeof value !==
        'object'
    ) {
      throw new Error(
        'Invalid draw-published notification payload',
      );
    }

    const payload =
      value as Record<
        string,
        unknown
      >;

    if (
      typeof payload[
        'drawPublicId'
      ] !== 'string'
    ) {
      throw new Error(
        'Invalid draw-published notification payload',
      );
    }

    return {
      drawPublicId:
        payload[
          'drawPublicId'
        ] as string,
    };
  }
  private parsePurchaseCompletedPayload(
    value: unknown,
  ): PurchaseCompletedPayload {
    if (
      !value ||
      Array.isArray(value) ||
      typeof value !==
        'object'
    ) {
      throw new Error(
        'Invalid purchase-completed notification payload',
      );
    }

    const payload =
      value as Record<
        string,
        unknown
      >;

    const ticketNumbers =
      payload[
        'ticketNumbers'
      ];

    if (
      typeof payload[
        'purchasePublicId'
      ] !== 'string' ||
      typeof payload[
        'drawPublicId'
      ] !== 'string' ||
      !Array.isArray(
        ticketNumbers,
      ) ||
      !ticketNumbers
        .every(
          (value) =>
            typeof value ===
            'string',
        )
    ) {
      throw new Error(
        'Invalid purchase-completed notification payload',
      );
    }

    return {
      purchasePublicId:
        payload[
          'purchasePublicId'
        ] as string,
      drawPublicId:
        payload[
          'drawPublicId'
        ] as string,
      ticketNumbers:
        ticketNumbers as string[],
    };
  }
}
