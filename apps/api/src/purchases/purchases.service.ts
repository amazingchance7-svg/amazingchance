import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DrawStatus,
  PaymentStatus,
  Prisma,
  Purchase,
  PurchaseStatus,
  UserStatus,
} from '@prisma/client';

import {
  createCorrelationId,
  createPublicId,
} from '../common/utils/identifier.util';
import { PlayerProtectionService } from '../compliance/player-protection.service';
import { ticketSalesBlockReason } from '../lottery-draws/sales-window.policy';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import {
  createScopedIdempotencyKey,
  normalizeIdempotencyKey,
} from './purchase-idempotency.util';

type SerializedPurchase = Omit<
  Purchase,
  'ticketPriceMinor' | 'totalAmountMinor'
> & {
  ticketPriceMinor: string;
  totalAmountMinor: string;
};

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly playerProtection:
      PlayerProtectionService,
  ) {}

  async create(
    userId: string,
    dto: CreatePurchaseDto,
    suppliedIdempotencyKey: string | undefined,
  ): Promise<SerializedPurchase> {
    const normalizedKey =
      normalizeIdempotencyKey(
        suppliedIdempotencyKey,
      );

    const idempotencyKey =
      createScopedIdempotencyKey(
        userId,
        normalizedKey,
      );

    const existing =
      await this.prisma.purchase.findUnique({
        where: {
          idempotencyKey,
        },
      });

    if (existing) {
      return this.resolveIdempotentRetry(
        existing,
        userId,
        dto,
      );
    }

    const user =
      await this.prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          status: true,
          emailVerifiedAt: true,
        },
      });

    if (!user) {
      throw new NotFoundException(
        'User not found',
      );
    }

    if (
      user.status !== UserStatus.ACTIVE ||
      user.emailVerifiedAt === null
    ) {
      throw new ConflictException(
        'Only active users with verified email can make purchases',
      );
    }

    const draw =
      await this.prisma.lotteryDraw.findUnique({
        where: {
          id: dto.drawId,
        },
      });

    if (!draw) {
      throw new NotFoundException(
        'Lottery draw not found',
      );
    }

    this.validateDrawAvailability(draw);

    const totalAmountMinor =
      draw.ticketPriceMinor *
      BigInt(dto.requestedTicketCount);

    try {
      const purchase =
        await this.prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`
              SELECT "id"
              FROM "users"
              WHERE "id" = ${userId}::uuid
              FOR UPDATE
            `;

            await this.playerProtection
              .assertCanPurchaseInTransaction(
                tx,
                userId,
              );

            const createdPurchase =
              await tx.purchase.create({
                data: {
                  publicId:
                    createPublicId('PUR'),
                  userId,
                  drawId: draw.id,
                  status:
                    PurchaseStatus.CREATED,
                  requestedTicketCount:
                    dto.requestedTicketCount,
                  ticketPriceMinor:
                    draw.ticketPriceMinor,
                  totalAmountMinor,
                  currency: draw.currency,
                  idempotencyKey,
                  expiresAt: new Date(
                    Date.now() +
                      30 * 60 * 1000,
                  ),
                },
              });

            await tx.purchaseStateEvent.create({
              data: {
                purchaseId:
                  createdPurchase.id,
                fromStatus: null,
                toStatus:
                  PurchaseStatus.CREATED,
                cause: 'PURCHASE_CREATED',
                source: 'USER',
                correlationId:
                  createCorrelationId(),
                metadata: {
                  requestedTicketCount:
                    dto.requestedTicketCount,
                  drawPublicId:
                    draw.publicId,
                },
              },
            });

            return createdPurchase;
          },
        );

      return this.serialize(purchase);
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const concurrentPurchase =
        await this.prisma.purchase.findUnique({
          where: {
            idempotencyKey,
          },
        });

      if (!concurrentPurchase) {
        throw error;
      }

      return this.resolveIdempotentRetry(
        concurrentPurchase,
        userId,
        dto,
      );
    }
  }

  async findMine(
    userId: string,
  ): Promise<SerializedPurchase[]> {
    const purchases =
      await this.prisma.purchase.findMany({
        where: {
          userId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

    return purchases.map((purchase) =>
      this.serialize(purchase),
    );
  }

  async findOne(
    userId: string,
    id: string,
  ): Promise<SerializedPurchase> {
    const purchase =
      await this.prisma.purchase.findFirst({
        where: {
          id,
          userId,
        },
      });

    if (!purchase) {
      throw new NotFoundException(
        'Purchase not found',
      );
    }

    return this.serialize(purchase);
  }

  async cancel(
    userId: string,
    id: string,
  ): Promise<SerializedPurchase> {
    const purchase =
      await this.prisma.purchase.findFirst({
        where: {
          id,
          userId,
        },
        include: {
          payments: {
            select: {
              status: true,
              providerTransactionId:
                true,
            },
          },
        },
      });

    if (!purchase) {
      throw new NotFoundException(
        'Purchase not found',
      );
    }

    if (
      purchase.status !==
        PurchaseStatus.CREATED &&
      purchase.status !==
        PurchaseStatus.PAYMENT_PENDING
    ) {
      throw new ConflictException(
        'Only unpaid purchases can be cancelled',
      );
    }

    const hasActiveProviderPayment =
      purchase.payments.some(
        (payment) =>
          payment.providerTransactionId !==
            null &&
          (
            payment.status ===
              PaymentStatus.CREATED ||
            payment.status ===
              PaymentStatus.PENDING
          ),
      );

    if (hasActiveProviderPayment) {
      throw new ConflictException(
        'Purchase has an active provider payment and cannot be cancelled until that payment is resolved',
      );
    }

    const cancelledPurchase =
      await this.prisma.$transaction(
        async (tx) => {
          const updateResult =
            await tx.purchase.updateMany({
              where: {
                id: purchase.id,
                userId,
                status: {
                  in: [
                    PurchaseStatus.CREATED,
                    PurchaseStatus
                      .PAYMENT_PENDING,
                  ],
                },
              },
              data: {
                status:
                  PurchaseStatus.CANCELLED,
              },
            });

          if (updateResult.count !== 1) {
            throw new ConflictException(
              'Purchase state changed while cancellation was processing',
            );
          }

          await tx.purchaseStateEvent.create({
            data: {
              purchaseId: purchase.id,
              fromStatus: purchase.status,
              toStatus:
                PurchaseStatus.CANCELLED,
              cause:
                'CANCELLED_BY_USER',
              source: 'USER',
              correlationId:
                createCorrelationId(),
            },
          });

          return tx.purchase.findUniqueOrThrow({
            where: {
              id: purchase.id,
            },
          });
        },
      );

    return this.serialize(
      cancelledPurchase,
    );
  }

  private resolveIdempotentRetry(
    purchase: Purchase,
    userId: string,
    dto: CreatePurchaseDto,
  ): SerializedPurchase {
    const payloadMatches =
      purchase.userId === userId &&
      purchase.drawId === dto.drawId &&
      purchase.requestedTicketCount ===
        dto.requestedTicketCount;

    if (!payloadMatches) {
      throw new ConflictException(
        'Idempotency-Key was already used with a different purchase request',
      );
    }

    return this.serialize(purchase);
  }

  private isUniqueConstraintError(
    error: unknown,
  ): boolean {
    return (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private validateDrawAvailability(
    draw: {
      status: DrawStatus;
      salesOpenAt: Date | null;
      salesCloseAt: Date | null;
      scheduledDrawAt: Date;
    },
  ): void {
    const reason = ticketSalesBlockReason(
      draw,
      new Date(),
    );

    if (reason) {
      throw new ConflictException(reason);
    }
  }
  private serialize(
    purchase: Purchase,
  ): SerializedPurchase {
    return {
      ...purchase,
      ticketPriceMinor:
        purchase.ticketPriceMinor.toString(),
      totalAmountMinor:
        purchase.totalAmountMinor.toString(),
    };
  }
}
