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

function createDraw(status: DrawStatus): LotteryDraw {
  const now = new Date('2026-08-03T00:00:00.000Z');

  return {
    id: '11111111-1111-4111-8111-111111111111',
    publicId: 'W-2026-000001',
    type: DrawType.WEEKLY,
    status,
    sequenceNumber: 1,
    participationYear: null,
    salesOpenAt: new Date('2026-08-01T00:00:00.000Z'),
    salesCloseAt: new Date('2026-08-02T00:00:00.000Z'),
    scheduledDrawAt: new Date('2026-08-03T00:00:00.000Z'),
    completedAt:
      status === DrawStatus.COMPLETED ? now : null,
    publishedAt:
      status === DrawStatus.PUBLISHED ? now : null,
    currency: 'USD',
    ticketPriceMinor: 100n,
    winnerCount: 3,
    createdAt: now,
    updatedAt: now,
  };
}

describe('Lottery draw state transitions', () => {
  const updateMany = jest.fn();
  const findUnique = jest.fn();

  const prisma = {
    lotteryDraw: {
      updateMany,
      findUnique,
    },
  } as unknown as PrismaService;

  const service = new LotteryDrawsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens sales only from SCHEDULED', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue(
      createDraw(DrawStatus.SALES_OPEN),
    );

    const result = await service.openSales(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: '11111111-1111-4111-8111-111111111111',
        status: {
          in: [DrawStatus.SCHEDULED],
        },
      },
      data: {
        status: DrawStatus.SALES_OPEN,
      },
    });
    expect(result.status).toBe(DrawStatus.SALES_OPEN);
  });

  it('closes sales only from SALES_OPEN', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue(
      createDraw(DrawStatus.SALES_CLOSED),
    );

    const result = await service.closeSales(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.status).toBe(DrawStatus.SALES_CLOSED);
  });

  it('cancels only a scheduled or open draw', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue(
      createDraw(DrawStatus.CANCELLED),
    );

    const result = await service.cancel(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.status).toBe(DrawStatus.CANCELLED);
  });

  it('publishes only a completed draw', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue(
      createDraw(DrawStatus.PUBLISHED),
    );

    const result = await service.publish(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.status).toBe(DrawStatus.PUBLISHED);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: '11111111-1111-4111-8111-111111111111',
          status: {
            in: [DrawStatus.COMPLETED],
          },
        },
        data: expect.objectContaining({
          status: DrawStatus.PUBLISHED,
          publishedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('rejects an invalid transition', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue({
      status: DrawStatus.SALES_CLOSED,
    });

    await expect(
      service.openSales(
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns not found for a missing draw', async () => {
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue(null);

    await expect(
      service.closeSales(
        '11111111-1111-4111-8111-111111111111',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
