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

import { PaginatedResult } from '../common/types/paginated-result.type';
import { scheduledSalesCutoffAt } from './sales-window.policy';
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

  async create(dto: CreateLotteryDrawDto): Promise<SerializedLotteryDraw> {
    this.validateDates(
      dto.salesOpenAt,
      dto.salesCloseAt,
      dto.scheduledDrawAt,
    );

    const draw = await this.prisma.$transaction(async (tx) => {
      const latestDraw = await tx.lotteryDraw.findFirst({
        where: { type: dto.type },
        orderBy: { sequenceNumber: 'desc' },
        select: { sequenceNumber: true },
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

  async findAll(
    query: ListLotteryDrawsDto,
  ): Promise<PaginatedResult<SerializedLotteryDraw>> {
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
          { scheduledDrawAt: 'desc' },
          { sequenceNumber: 'desc' },
        ],
      }),
      this.prisma.lotteryDraw.count({ where }),
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
      where: { id },
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
      where: { id },
    });

    if (!existingDraw) {
      throw new NotFoundException('Lottery draw not found');
    }

    if (existingDraw.status !== DrawStatus.SCHEDULED) {
      throw new ConflictException(
        'Only a scheduled draw can be edited',
      );
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

    const result = await this.prisma.lotteryDraw.updateMany({
      where: {
        id,
        status: DrawStatus.SCHEDULED,
      },
      data: {
        ...(dto.salesOpenAt !== undefined ? { salesOpenAt } : {}),
        ...(dto.salesCloseAt !== undefined ? { salesCloseAt } : {}),
        ...(dto.scheduledDrawAt !== undefined
          ? { scheduledDrawAt }
          : {}),
        ...(dto.currency !== undefined
          ? { currency: dto.currency }
          : {}),
        ...(dto.ticketPriceMinor !== undefined
          ? { ticketPriceMinor: BigInt(dto.ticketPriceMinor) }
          : {}),
        ...(dto.winnerCount !== undefined
          ? { winnerCount: dto.winnerCount }
          : {}),
        ...(dto.participationYear !== undefined
          ? { participationYear: dto.participationYear }
          : {}),
      },
    });

    if (result.count !== 1) {
      throw new ConflictException(
        'The draw changed state before the update completed',
      );
    }

    return this.findOne(id);
  }

  openSales(id: string): Promise<SerializedLotteryDraw> {
    return this.transitionStatus(
      id,
      [DrawStatus.SCHEDULED],
      DrawStatus.SALES_OPEN,
    );
  }

  closeSales(id: string): Promise<SerializedLotteryDraw> {
    return this.transitionStatus(
      id,
      [DrawStatus.SALES_OPEN],
      DrawStatus.SALES_CLOSED,
    );
  }

  cancel(id: string): Promise<SerializedLotteryDraw> {
    return this.transitionStatus(
      id,
      [DrawStatus.SCHEDULED, DrawStatus.SALES_OPEN],
      DrawStatus.CANCELLED,
    );
  }

  publish(id: string): Promise<SerializedLotteryDraw> {
    return this.transitionStatus(
      id,
      [DrawStatus.COMPLETED],
      DrawStatus.PUBLISHED,
      { publishedAt: new Date() },
    );
  }

  private async transitionStatus(
    id: string,
    allowedStatuses: DrawStatus[],
    nextStatus: DrawStatus,
    additionalData: Prisma.LotteryDrawUpdateManyMutationInput = {},
  ): Promise<SerializedLotteryDraw> {
    const result = await this.prisma.lotteryDraw.updateMany({
      where: {
        id,
        status: { in: allowedStatuses },
      },
      data: {
        ...additionalData,
        status: nextStatus,
      },
    });

    if (result.count === 1) {
      return this.findOne(id);
    }

    const existing = await this.prisma.lotteryDraw.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!existing) {
      throw new NotFoundException('Lottery draw not found');
    }

    throw new ConflictException(
      `Cannot transition lottery draw from ${existing.status} to ${nextStatus}`,
    );
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

    if (salesOpenAt && new Date(salesOpenAt) >= scheduledDate) {
      throw new BadRequestException(
        'salesOpenAt must be earlier than scheduledDrawAt',
      );
    }

    if (salesCloseAt) {
      const closeDate = new Date(salesCloseAt);
      const hardCutoff =
        scheduledSalesCutoffAt(
          scheduledDate,
        );

      if (closeDate > hardCutoff) {
        throw new BadRequestException(
          'salesCloseAt must be at least 10 minutes before scheduledDrawAt',
        );
      }
    }

    if (
      salesOpenAt &&
      salesCloseAt &&
      new Date(salesOpenAt) >= new Date(salesCloseAt)
    ) {
      throw new BadRequestException(
        'salesOpenAt must be earlier than salesCloseAt',
      );
    }
  }

  private createPublicId(
    type: DrawType,
    year: number,
    sequenceNumber: number,
  ): string {
    const prefix = type === DrawType.WEEKLY ? 'W' : 'A';
    const paddedSequence = sequenceNumber
      .toString()
      .padStart(6, '0');

    return `${prefix}-${year}-${paddedSequence}`;
  }

  private serialize(draw: LotteryDraw): SerializedLotteryDraw {
    return {
      ...draw,
      ticketPriceMinor: draw.ticketPriceMinor.toString(),
    };
  }
}
