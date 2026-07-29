import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  import {
    DrawStatus,
    DrawType,
    LotteryDraw,
    Prisma,
  } from '@prisma/client';
  
  import { PrismaService } from '../prisma/prisma.service';
  import { CreateLotteryDrawDto } from './dto/create-lottery-draw.dto';
  import { ListLotteryDrawsDto } from './dto/list-lottery-draws.dto';
  import { UpdateLotteryDrawDto } from './dto/update-lottery-draw.dto';
  
  type SerializedLotteryDraw = Omit<LotteryDraw, 'ticketPriceMinor'> & {
    ticketPriceMinor: string;
  };
  
  @Injectable()
  export class LotteryDrawsService {
    constructor(private readonly prisma: PrismaService) {}
  
    async create(
      dto: CreateLotteryDrawDto,
    ): Promise<SerializedLotteryDraw> {
      this.validateDates(
        dto.salesOpenAt,
        dto.salesCloseAt,
        dto.scheduledDrawAt,
      );
  
      const draw = await this.prisma.$transaction(async (tx) => {
        const latestDraw = await tx.lotteryDraw.findFirst({
          where: {
            type: dto.type,
          },
          orderBy: {
            sequenceNumber: 'desc',
          },
          select: {
            sequenceNumber: true,
          },
        });
  
        const sequenceNumber = (latestDraw?.sequenceNumber ?? 0) + 1;
        const drawYear = new Date(dto.scheduledDrawAt).getUTCFullYear();
  
        return tx.lotteryDraw.create({
          data: {
            publicId: this.createPublicId(
              dto.type,
              drawYear,
              sequenceNumber,
            ),
            type: dto.type,
            sequenceNumber,
            participationYear:
              dto.type === DrawType.ANNUAL
                ? (dto.participationYear ?? drawYear)
                : dto.participationYear,
            salesOpenAt: dto.salesOpenAt
              ? new Date(dto.salesOpenAt)
              : null,
            salesCloseAt: dto.salesCloseAt
              ? new Date(dto.salesCloseAt)
              : null,
            scheduledDrawAt: new Date(dto.scheduledDrawAt),
            currency: dto.currency ?? 'USD',
            ticketPriceMinor: BigInt(dto.ticketPriceMinor),
            winnerCount: dto.winnerCount ?? 3,
          },
        });
      });
  
      return this.serialize(draw);
    }
  
    async findAll(query: ListLotteryDrawsDto): Promise<{
      items: SerializedLotteryDraw[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }> {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const skip = (page - 1) * limit;
  
      const where: Prisma.LotteryDrawWhereInput = {
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
      };
  
      const [items, total] = await this.prisma.$transaction([
        this.prisma.lotteryDraw.findMany({
          where,
          skip,
          take: limit,
          orderBy: [
            {
              scheduledDrawAt: 'desc',
            },
            {
              sequenceNumber: 'desc',
            },
          ],
        }),
        this.prisma.lotteryDraw.count({
          where,
        }),
      ]);
  
      return {
        items: items.map((draw) => this.serialize(draw)),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }
  
    async findOne(id: string): Promise<SerializedLotteryDraw> {
      const draw = await this.prisma.lotteryDraw.findUnique({
        where: {
          id,
        },
      });
  
      if (!draw) {
        throw new NotFoundException('Lottery draw not found');
      }
  
      return this.serialize(draw);
    }
  
    async update(
      id: string,
      dto: UpdateLotteryDrawDto,
    ): Promise<SerializedLotteryDraw> {
      const existingDraw = await this.prisma.lotteryDraw.findUnique({
        where: {
          id,
        },
      });
  
      if (!existingDraw) {
        throw new NotFoundException('Lottery draw not found');
      }
  
      const salesOpenAt =
        dto.salesOpenAt !== undefined
          ? new Date(dto.salesOpenAt)
          : existingDraw.salesOpenAt;
  
      const salesCloseAt =
        dto.salesCloseAt !== undefined
          ? new Date(dto.salesCloseAt)
          : existingDraw.salesCloseAt;
  
      const scheduledDrawAt =
        dto.scheduledDrawAt !== undefined
          ? new Date(dto.scheduledDrawAt)
          : existingDraw.scheduledDrawAt;
  
      this.validateDates(
        salesOpenAt?.toISOString(),
        salesCloseAt?.toISOString(),
        scheduledDrawAt.toISOString(),
      );
  
      const draw = await this.prisma.lotteryDraw.update({
        where: {
          id,
        },
        data: {
          ...(dto.status !== undefined
            ? {
                status: dto.status,
              }
            : {}),
          ...(dto.salesOpenAt !== undefined
            ? {
                salesOpenAt,
              }
            : {}),
          ...(dto.salesCloseAt !== undefined
            ? {
                salesCloseAt,
              }
            : {}),
          ...(dto.scheduledDrawAt !== undefined
            ? {
                scheduledDrawAt,
              }
            : {}),
          ...(dto.currency !== undefined
            ? {
                currency: dto.currency,
              }
            : {}),
          ...(dto.ticketPriceMinor !== undefined
            ? {
                ticketPriceMinor: BigInt(dto.ticketPriceMinor),
              }
            : {}),
          ...(dto.winnerCount !== undefined
            ? {
                winnerCount: dto.winnerCount,
              }
            : {}),
          ...(dto.participationYear !== undefined
            ? {
                participationYear: dto.participationYear,
              }
            : {}),
        },
      });
  
      return this.serialize(draw);
    }
  
    async remove(id: string): Promise<SerializedLotteryDraw> {
      const draw = await this.prisma.lotteryDraw.findUnique({
        where: {
          id,
        },
        include: {
          _count: {
            select: {
              purchases: true,
              tickets: true,
            },
          },
        },
      });
  
      if (!draw) {
        throw new NotFoundException('Lottery draw not found');
      }
  
      if (
        draw.status !== DrawStatus.SCHEDULED &&
        draw.status !== DrawStatus.CANCELLED
      ) {
        throw new ConflictException(
          'Only scheduled or cancelled draws can be deleted',
        );
      }
  
      if (draw._count.purchases > 0 || draw._count.tickets > 0) {
        throw new ConflictException(
          'A draw with purchases or tickets cannot be deleted',
        );
      }
  
      const deletedDraw = await this.prisma.lotteryDraw.delete({
        where: {
          id,
        },
      });
  
      return this.serialize(deletedDraw);
    }
  
    private validateDates(
      salesOpenAt: string | undefined,
      salesCloseAt: string | undefined,
      scheduledDrawAt: string,
    ): void {
      const scheduledDate = new Date(scheduledDrawAt);
  
      if (Number.isNaN(scheduledDate.getTime())) {
        throw new BadRequestException(
          'scheduledDrawAt must be a valid date',
        );
      }
  
      if (salesOpenAt) {
        const openDate = new Date(salesOpenAt);
  
        if (openDate >= scheduledDate) {
          throw new BadRequestException(
            'salesOpenAt must be earlier than scheduledDrawAt',
          );
        }
      }
  
      if (salesCloseAt) {
        const closeDate = new Date(salesCloseAt);
  
        if (closeDate >= scheduledDate) {
          throw new BadRequestException(
            'salesCloseAt must be earlier than scheduledDrawAt',
          );
        }
      }
  
      if (salesOpenAt && salesCloseAt) {
        const openDate = new Date(salesOpenAt);
        const closeDate = new Date(salesCloseAt);
  
        if (openDate >= closeDate) {
          throw new BadRequestException(
            'salesOpenAt must be earlier than salesCloseAt',
          );
        }
      }
    }
  
    private createPublicId(
      type: DrawType,
      year: number,
      sequenceNumber: number,
    ): string {
      const prefix = type === DrawType.WEEKLY ? 'W' : 'A';
      const paddedSequence = sequenceNumber.toString().padStart(6, '0');
  
      return `${prefix}-${year}-${paddedSequence}`;
    }
  
    private serialize(draw: LotteryDraw): SerializedLotteryDraw {
      return {
        ...draw,
        ticketPriceMinor: draw.ticketPriceMinor.toString(),
      };
    }
  }