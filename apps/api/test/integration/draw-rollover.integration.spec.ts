import {
  DrawStatus,
  DrawType,
} from '@prisma/client';
import {
  randomUUID,
} from 'node:crypto';

import {
  WeeklyDrawSalesService,
} from '../../src/lottery-draws/weekly-draw-sales.service';
import {
  PrismaService,
} from '../../src/prisma/prisma.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('SEC-002 weekly draw rollover integration', () => {
  let prisma: PrismaService;
  let service:
    WeeklyDrawSalesService;

  beforeAll(async () => {
    prisma =
      await createTestPrisma();
    service =
      new WeeklyDrawSalesService(
        prisma,
      );
  });

  beforeEach(async () => {
    await cleanTestDatabase(
      prisma,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createWeeklyDraw(
    input: {
      status: DrawStatus;
      scheduledDrawAt: Date;
      salesOpenAt?: Date | null;
      salesCloseAt?: Date | null;
      sequenceNumber?: number;
    },
  ) {
    return prisma.lotteryDraw.create({
      data: {
        publicId:
          `W-SEC002-${randomUUID()}`,
        type:
          DrawType.WEEKLY,
        status:
          input.status,
        sequenceNumber:
          input.sequenceNumber ??
          100,
        salesOpenAt:
          input.salesOpenAt ??
          null,
        salesCloseAt:
          input.salesCloseAt ??
          null,
        scheduledDrawAt:
          input.scheduledDrawAt,
        currency: 'USD',
        ticketPriceMinor: 100n,
        winnerCount: 3,
      },
    });
  }

  it('automatically opens a scheduled weekly draw when its sales window begins', async () => {
    const now =
      new Date(
        '2026-08-11T12:00:00.000Z',
      );

    const draw =
      await createWeeklyDraw({
        status:
          DrawStatus.SCHEDULED,
        salesOpenAt:
          new Date(
            '2026-08-11T11:00:00.000Z',
          ),
        scheduledDrawAt:
          new Date(
            '2026-08-11T18:00:00.000Z',
          ),
      });

    const availability =
      await service.getAvailability(
        now,
      );

    expect(
      availability.available,
    ).toBe(true);
    expect(
      availability.drawId,
    ).toBe(draw.id);

    expect(
      (
        await prisma.lotteryDraw
          .findUniqueOrThrow({
            where: {
              id: draw.id,
            },
          })
      ).status,
    ).toBe(
      DrawStatus.SALES_OPEN,
    );
  });

  it('closes the expired weekly draw and opens the next weekly draw', async () => {
    const now =
      new Date(
        '2026-08-11T12:00:00.000Z',
      );

    const previous =
      await createWeeklyDraw({
        status:
          DrawStatus.SALES_OPEN,
        sequenceNumber: 200,
        scheduledDrawAt:
          new Date(
            '2026-08-11T11:00:00.000Z',
          ),
      });

    const availability =
      await service.getAvailability(
        now,
      );

    expect(
      availability.available,
    ).toBe(true);
    expect(
      availability.drawId,
    ).not.toBe(previous.id);
    expect(
      availability.ticketPriceMinor,
    ).toBe('100');
    expect(
      availability.currency,
    ).toBe('USD');

    const oldDraw =
      await prisma.lotteryDraw
        .findUniqueOrThrow({
          where: {
            id: previous.id,
          },
        });

    const nextDraw =
      await prisma.lotteryDraw
        .findUniqueOrThrow({
          where: {
            id:
              availability.drawId!,
          },
        });

    expect(oldDraw.status).toBe(
      DrawStatus.SALES_CLOSED,
    );
    expect(
      nextDraw.sequenceNumber,
    ).toBe(201);
    expect(nextDraw.status).toBe(
      DrawStatus.SALES_OPEN,
    );
    expect(
      nextDraw.scheduledDrawAt
        .getTime(),
    ).toBeGreaterThan(
      now.getTime() +
        10 * 60 * 1000,
    );
  });

  it('is idempotent when rollover is requested repeatedly', async () => {
    const now =
      new Date(
        '2026-08-11T12:00:00.000Z',
      );

    await createWeeklyDraw({
      status:
        DrawStatus.SALES_OPEN,
      sequenceNumber: 300,
      scheduledDrawAt:
        new Date(
          '2026-08-11T11:00:00.000Z',
        ),
    });

    const first =
      await service.getAvailability(
        now,
      );
    const second =
      await service.getAvailability(
        now,
      );

    expect(first.drawId).toBe(
      second.drawId,
    );

    expect(
      await prisma.lotteryDraw.count({
        where: {
          type:
            DrawType.WEEKLY,
        },
      }),
    ).toBe(2);
  });

  it('skips obsolete weekly slots after downtime instead of creating expired draws', async () => {
    const now =
      new Date(
        '2026-08-11T12:00:00.000Z',
      );

    await createWeeklyDraw({
      status:
        DrawStatus.SALES_CLOSED,
      sequenceNumber: 400,
      scheduledDrawAt:
        new Date(
          '2026-07-01T20:00:00.000Z',
        ),
    });

    const availability =
      await service.getAvailability(
        now,
      );

    expect(
      availability.available,
    ).toBe(true);

    expect(
      new Date(
        availability
          .scheduledDrawAt!,
      ).getTime(),
    ).toBeGreaterThan(
      now.getTime() +
        10 * 60 * 1000,
    );

    expect(
      await prisma.lotteryDraw.count({
        where: {
          type:
            DrawType.WEEKLY,
        },
      }),
    ).toBe(2);
  });

  it('reports no availability before the first weekly draw exists', async () => {
    await expect(
      service.getAvailability(
        new Date(),
      ),
    ).resolves.toEqual({
      available: false,
      reason:
        'NO_WEEKLY_DRAW',
      drawId: null,
      publicId: null,
      scheduledDrawAt: null,
      effectiveCutoffAt: null,
      ticketPriceMinor: null,
      currency: null,
    });
  });
});
