import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  import {
    DrawStatus,
    Purchase,
    PurchaseStatus,
    UserStatus,
  } from '@prisma/client';
  
  import {
    createCorrelationId,
    createIdempotencyKey,
    createPublicId,
  } from '../common/utils/identifier.util';
  import { PrismaService } from '../prisma/prisma.service';
  import { CreatePurchaseDto } from './dto/create-purchase.dto';
  
  type SerializedPurchase = Omit<
    Purchase,
    'ticketPriceMinor' | 'totalAmountMinor'
  > & {
    ticketPriceMinor: string;
    totalAmountMinor: string;
  };
  
  @Injectable()
  export class PurchasesService {
    constructor(private readonly prisma: PrismaService) {}
  
    async create(
      userId: string,
      dto: CreatePurchaseDto,
    ): Promise<SerializedPurchase> {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          status: true,
          emailVerifiedAt: true,
        },
      });
  
      if (!user) {
        throw new NotFoundException('User not found');
      }
  
      if (
        user.status !== UserStatus.ACTIVE ||
        user.emailVerifiedAt === null
      ) {
        throw new ConflictException(
          'Only active users with verified email can make purchases',
        );
      }
  
      const draw = await this.prisma.lotteryDraw.findUnique({
        where: {
          id: dto.drawId,
        },
      });
  
      if (!draw) {
        throw new NotFoundException('Lottery draw not found');
      }
  
      this.validateDrawAvailability(draw);
  
      const totalAmountMinor =
        draw.ticketPriceMinor * BigInt(dto.requestedTicketCount);
  
      const purchase = await this.prisma.$transaction(async (tx) => {
        const createdPurchase = await tx.purchase.create({
          data: {
            publicId: createPublicId('PUR'),
            userId,
            drawId: draw.id,
            status: PurchaseStatus.CREATED,
            requestedTicketCount: dto.requestedTicketCount,
            ticketPriceMinor: draw.ticketPriceMinor,
            totalAmountMinor,
            currency: draw.currency,
            idempotencyKey: createIdempotencyKey(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          },
        });
  
        await tx.purchaseStateEvent.create({
          data: {
            purchaseId: createdPurchase.id,
            fromStatus: null,
            toStatus: PurchaseStatus.CREATED,
            cause: 'PURCHASE_CREATED',
            source: 'USER',
            correlationId: createCorrelationId(),
            metadata: {
              requestedTicketCount: dto.requestedTicketCount,
              drawPublicId: draw.publicId,
            },
          },
        });
  
        return createdPurchase;
      });
  
      return this.serialize(purchase);
    }
  
    async findMine(userId: string): Promise<SerializedPurchase[]> {
      const purchases = await this.prisma.purchase.findMany({
        where: {
          userId,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
  
      return purchases.map((purchase) => this.serialize(purchase));
    }
  
    async findOne(
      userId: string,
      id: string,
    ): Promise<SerializedPurchase> {
      const purchase = await this.prisma.purchase.findFirst({
        where: {
          id,
          userId,
        },
      });
  
      if (!purchase) {
        throw new NotFoundException('Purchase not found');
      }
  
      return this.serialize(purchase);
    }
  
    async cancel(
      userId: string,
      id: string,
    ): Promise<SerializedPurchase> {
      const purchase = await this.prisma.purchase.findFirst({
        where: {
          id,
          userId,
        },
      });
  
      if (!purchase) {
        throw new NotFoundException('Purchase not found');
      }
  
      if (
        purchase.status !== PurchaseStatus.CREATED &&
        purchase.status !== PurchaseStatus.PAYMENT_PENDING
      ) {
        throw new ConflictException(
          'Only unpaid purchases can be cancelled',
        );
      }
  
      const cancelledPurchase = await this.prisma.$transaction(
        async (tx) => {
          const updatedPurchase = await tx.purchase.update({
            where: {
              id: purchase.id,
            },
            data: {
              status: PurchaseStatus.CANCELLED,
            },
          });
  
          await tx.purchaseStateEvent.create({
            data: {
              purchaseId: purchase.id,
              fromStatus: purchase.status,
              toStatus: PurchaseStatus.CANCELLED,
              cause: 'CANCELLED_BY_USER',
              source: 'USER',
              correlationId: createCorrelationId(),
            },
          });
  
          return updatedPurchase;
        },
      );
  
      return this.serialize(cancelledPurchase);
    }
  
    private validateDrawAvailability(draw: {
      status: DrawStatus;
      salesOpenAt: Date | null;
      salesCloseAt: Date | null;
      scheduledDrawAt: Date;
    }): void {
      const now = new Date();
  
      if (draw.status !== DrawStatus.SALES_OPEN) {
        throw new ConflictException(
          'Ticket sales are not open for this draw',
        );
      }
  
      if (draw.salesOpenAt && now < draw.salesOpenAt) {
        throw new ConflictException(
          'Ticket sales have not started yet',
        );
      }
  
      if (draw.salesCloseAt && now >= draw.salesCloseAt) {
        throw new ConflictException(
          'Ticket sales are already closed',
        );
      }
  
      if (now >= draw.scheduledDrawAt) {
        throw new BadRequestException(
          'The scheduled draw time has already passed',
        );
      }
    }
  
    private serialize(purchase: Purchase): SerializedPurchase {
      return {
        ...purchase,
        ticketPriceMinor: purchase.ticketPriceMinor.toString(),
        totalAmountMinor: purchase.totalAmountMinor.toString(),
      };
    }
  }