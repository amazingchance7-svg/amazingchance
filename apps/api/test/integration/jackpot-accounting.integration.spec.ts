import {
  DrawStatus,
  DrawType,
  LedgerAccountCode,
  LedgerSide,
  LedgerTransactionType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { JackpotAccountingService } from '../../src/finance/jackpot-accounting.service';
import { LedgerService } from '../../src/ledger/ledger.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('Jackpot accounting integration', () => {
  let prisma: PrismaService;
  let ledger: LedgerService;
  let service: JackpotAccountingService;

  beforeAll(async () => {
    prisma =
      await createTestPrisma();

    ledger =
      new LedgerService(
        prisma,
      );

    service =
      new JackpotAccountingService(
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
    options?: {
      currency?: string;
      participationYear?: number;
      scheduledDrawAt?: Date;
    },
  ) {
    return prisma.lotteryDraw.create({
      data: {
        publicId:
          `W-${randomUUID()}`,
        type:
          DrawType.WEEKLY,
        status:
          DrawStatus.SALES_OPEN,
        sequenceNumber:
          Math.floor(
            Math.random() *
              1_000_000_000,
          ),
        scheduledDrawAt:
          options?.scheduledDrawAt ??
          new Date(
            '2026-08-15T20:00:00.000Z',
          ),
        participationYear:
          options?.participationYear,
        currency:
          options?.currency ??
          'USD',
        ticketPriceMinor:
          100n,
      },
    });
  }

  async function appendAllocation(
    input: {
      drawId: string;
      participationYear: number;
      currency?: string;
      weeklyMinor: bigint;
      annualMinor: bigint;
      companyMinor?: bigint;
    },
  ) {
    const companyMinor =
      input.companyMinor ??
      20n;

    const total =
      input.weeklyMinor +
      input.annualMinor +
      companyMinor;

    return ledger.append({
      type:
        LedgerTransactionType.PAYMENT_ALLOCATION,
      idempotencyKey:
        `allocation-${randomUUID()}`,
      referenceType:
        'PAYMENT',
      referenceId:
        randomUUID(),
      currency:
        input.currency ??
        'USD',
      metadata: {
        drawId:
          input.drawId,
        participationYear:
          input.participationYear,
      },
      postings: [
        {
          accountCode:
            LedgerAccountCode.PAYMENT_CLEARING,
          side:
            LedgerSide.DEBIT,
          amountMinor:
            total,
        },
        {
          accountCode:
            LedgerAccountCode.WEEKLY_JACKPOT,
          side:
            LedgerSide.CREDIT,
          amountMinor:
            input.weeklyMinor,
        },
        {
          accountCode:
            LedgerAccountCode.ANNUAL_JACKPOT,
          side:
            LedgerSide.CREDIT,
          amountMinor:
            input.annualMinor,
        },
        {
          accountCode:
            LedgerAccountCode.COMPANY_REVENUE,
          side:
            LedgerSide.CREDIT,
          amountMinor:
            companyMinor,
        },
      ],
    });
  }

  async function appendWeeklyJackpotDebit(
    drawId: string,
    amountMinor: bigint,
    currency = 'USD',
  ) {
    return ledger.append({
      type:
        LedgerTransactionType.PRIZE_RECOGNIZED,
      idempotencyKey:
        `weekly-prize-${randomUUID()}`,
      referenceType:
        'DRAW',
      referenceId:
        drawId,
      currency,
      metadata: {
        drawId,
      },
      postings: [
        {
          accountCode:
            LedgerAccountCode.WEEKLY_JACKPOT,
          side:
            LedgerSide.DEBIT,
          amountMinor,
        },
        {
          accountCode:
            LedgerAccountCode.PRIZE_PAYABLE,
          side:
            LedgerSide.CREDIT,
          amountMinor,
        },
      ],
    });
  }

  async function appendAnnualJackpotDebit(
    participationYear: number,
    amountMinor: bigint,
    currency = 'USD',
  ) {
    return ledger.append({
      type:
        LedgerTransactionType.PRIZE_RECOGNIZED,
      idempotencyKey:
        `annual-prize-${randomUUID()}`,
      referenceType:
        'ANNUAL_DRAW',
      referenceId:
        participationYear.toString(),
      currency,
      metadata: {
        participationYear,
      },
      postings: [
        {
          accountCode:
            LedgerAccountCode.ANNUAL_JACKPOT,
          side:
            LedgerSide.DEBIT,
          amountMinor,
        },
        {
          accountCode:
            LedgerAccountCode.PRIZE_PAYABLE,
          side:
            LedgerSide.CREDIT,
          amountMinor,
        },
      ],
    });
  }

  it('keeps weekly jackpot balances isolated by draw', async () => {
    const firstDraw =
      await createWeeklyDraw();

    const secondDraw =
      await createWeeklyDraw();

    await appendAllocation({
      drawId:
        firstDraw.id,
      participationYear:
        2026,
      weeklyMinor:
        70n,
      annualMinor:
        10n,
    });

    await appendAllocation({
      drawId:
        secondDraw.id,
      participationYear:
        2026,
      weeklyMinor:
        140n,
      annualMinor:
        20n,
      companyMinor:
        40n,
    });

    const first =
      await service.getWeeklyJackpot(
        firstDraw.id,
      );

    const second =
      await service.getWeeklyJackpot(
        secondDraw.id,
      );

    expect(
      first,
    ).toMatchObject({
      drawId:
        firstDraw.id,
      currency:
        'USD',
      creditMinor:
        70n,
      debitMinor:
        0n,
      balanceMinor:
        70n,
      postingCount:
        1,
      transactionCount:
        1,
    });

    expect(
      second,
    ).toMatchObject({
      drawId:
        secondDraw.id,
      currency:
        'USD',
      creditMinor:
        140n,
      debitMinor:
        0n,
      balanceMinor:
        140n,
      postingCount:
        1,
      transactionCount:
        1,
    });
  });

  it('accumulates one annual jackpot across multiple weekly draws in the same participation year', async () => {
    const firstDraw =
      await createWeeklyDraw({
        participationYear:
          2026,
      });

    const secondDraw =
      await createWeeklyDraw({
        participationYear:
          2026,
      });

    await appendAllocation({
      drawId:
        firstDraw.id,
      participationYear:
        2026,
      weeklyMinor:
        70n,
      annualMinor:
        10n,
    });

    await appendAllocation({
      drawId:
        secondDraw.id,
      participationYear:
        2026,
      weeklyMinor:
        210n,
      annualMinor:
        30n,
      companyMinor:
        60n,
    });

    const annual =
      await service.getAnnualJackpot(
        2026,
      );

    expect(
      annual,
    ).toEqual({
      participationYear:
        2026,
      currency:
        'USD',
      creditMinor:
        40n,
      debitMinor:
        0n,
      balanceMinor:
        40n,
      postingCount:
        2,
      transactionCount:
        2,
    });
  });

  it('falls back to scheduled draw year when participationYear is absent', async () => {
    const draw =
      await createWeeklyDraw({
        scheduledDrawAt:
          new Date(
            '2027-01-10T20:00:00.000Z',
          ),
      });

    await appendAllocation({
      drawId:
        draw.id,
      participationYear:
        2027,
      weeklyMinor:
        70n,
      annualMinor:
        10n,
    });

    const annual =
      await service.getAnnualJackpot(
        2027,
      );

    expect(
      annual.balanceMinor,
    ).toBe(10n);
  });

  it('does not mix currencies in jackpot balances', async () => {
    const usdDraw =
      await createWeeklyDraw({
        currency:
          'USD',
      });

    const eurDraw =
      await createWeeklyDraw({
        currency:
          'EUR',
      });

    await appendAllocation({
      drawId:
        usdDraw.id,
      participationYear:
        2026,
      currency:
        'USD',
      weeklyMinor:
        70n,
      annualMinor:
        10n,
    });

    await appendAllocation({
      drawId:
        eurDraw.id,
      participationYear:
        2026,
      currency:
        'EUR',
      weeklyMinor:
        350n,
      annualMinor:
        50n,
      companyMinor:
        100n,
    });

    const usdAnnual =
      await service.getAnnualJackpot(
        2026,
        'USD',
      );

    const eurAnnual =
      await service.getAnnualJackpot(
        2026,
        'EUR',
      );

    expect(
      usdAnnual.balanceMinor,
    ).toBe(10n);

    expect(
      eurAnnual.balanceMinor,
    ).toBe(50n);

    expect(
      (
        await service.getWeeklyJackpot(
          usdDraw.id,
        )
      ).balanceMinor,
    ).toBe(70n);

    expect(
      (
        await service.getWeeklyJackpot(
          eurDraw.id,
        )
      ).balanceMinor,
    ).toBe(350n);
  });

  it('subtracts recognized weekly prizes from the available weekly jackpot', async () => {
    const draw =
      await createWeeklyDraw();

    await appendAllocation({
      drawId:
        draw.id,
      participationYear:
        2026,
      weeklyMinor:
        700n,
      annualMinor:
        100n,
      companyMinor:
        200n,
    });

    await appendWeeklyJackpotDebit(
      draw.id,
      300n,
    );

    const result =
      await service.getWeeklyJackpot(
        draw.id,
      );

    expect(
      result.creditMinor,
    ).toBe(700n);

    expect(
      result.debitMinor,
    ).toBe(300n);

    expect(
      result.balanceMinor,
    ).toBe(400n);

    expect(
      result.postingCount,
    ).toBe(2);

    expect(
      result.transactionCount,
    ).toBe(2);
  });

  it('subtracts recognized annual prizes from the annual jackpot', async () => {
    const draw =
      await createWeeklyDraw({
        participationYear:
          2026,
      });

    await appendAllocation({
      drawId:
        draw.id,
      participationYear:
        2026,
      weeklyMinor:
        700n,
      annualMinor:
        100n,
      companyMinor:
        200n,
    });

    await appendAnnualJackpotDebit(
      2026,
      40n,
    );

    const result =
      await service.getAnnualJackpot(
        2026,
      );

    expect(
      result.creditMinor,
    ).toBe(100n);

    expect(
      result.debitMinor,
    ).toBe(40n);

    expect(
      result.balanceMinor,
    ).toBe(60n);
  });

  it('rejects a weekly jackpot request for a missing draw', async () => {
    await expect(
      service.getWeeklyJackpot(
        randomUUID(),
      ),
    ).rejects.toThrow(
      'Lottery draw not found',
    );
  });

  it('rejects weekly accounting for an annual draw', async () => {
    const draw =
      await prisma.lotteryDraw.create({
        data: {
          publicId:
            `A-${randomUUID()}`,
          type:
            DrawType.ANNUAL,
          status:
            DrawStatus.SCHEDULED,
          sequenceNumber:
            Math.floor(
              Math.random() *
                1_000_000_000,
            ),
          scheduledDrawAt:
            new Date(
              '2026-12-31T20:00:00.000Z',
            ),
          participationYear:
            2026,
          currency:
            'USD',
          ticketPriceMinor:
            100n,
        },
      });

    await expect(
      service.getWeeklyJackpot(
        draw.id,
      ),
    ).rejects.toThrow(
      'Weekly jackpot accounting is only available for weekly draws',
    );
  });

  it('rejects reservation checks above the available weekly balance', async () => {
    const draw =
      await createWeeklyDraw();

    await appendAllocation({
      drawId:
        draw.id,
      participationYear:
        2026,
      weeklyMinor:
        70n,
      annualMinor:
        10n,
    });

    await expect(
      service.assertWeeklyJackpotAvailable(
        draw.id,
        71n,
      ),
    ).rejects.toThrow(
      'Weekly jackpot has insufficient available balance',
    );

    await expect(
      service.assertWeeklyJackpotAvailable(
        draw.id,
        70n,
      ),
    ).resolves.toMatchObject({
      balanceMinor:
        70n,
    });
  });

  it('rejects reservation checks above the available annual balance', async () => {
    const draw =
      await createWeeklyDraw({
        participationYear:
          2026,
      });

    await appendAllocation({
      drawId:
        draw.id,
      participationYear:
        2026,
      weeklyMinor:
        70n,
      annualMinor:
        10n,
    });

    await expect(
      service.assertAnnualJackpotAvailable(
        2026,
        11n,
      ),
    ).rejects.toThrow(
      'Annual jackpot has insufficient available balance',
    );

    await expect(
      service.assertAnnualJackpotAvailable(
        2026,
        10n,
      ),
    ).resolves.toMatchObject({
      balanceMinor:
        10n,
    });
  });

  it('returns the global account balance from the same immutable ledger', async () => {
    const firstDraw =
      await createWeeklyDraw();

    const secondDraw =
      await createWeeklyDraw();

    await appendAllocation({
      drawId:
        firstDraw.id,
      participationYear:
        2026,
      weeklyMinor:
        70n,
      annualMinor:
        10n,
    });

    await appendAllocation({
      drawId:
        secondDraw.id,
      participationYear:
        2026,
      weeklyMinor:
        140n,
      annualMinor:
        20n,
      companyMinor:
        40n,
    });

    await appendWeeklyJackpotDebit(
      firstDraw.id,
      30n,
    );

    const account =
      await service.getAccountBalance(
        LedgerAccountCode.WEEKLY_JACKPOT,
        'USD',
      );

    expect(
      account,
    ).toEqual({
      currency:
        'USD',
      creditMinor:
        210n,
      debitMinor:
        30n,
      balanceMinor:
        180n,
      postingCount:
        3,
      transactionCount:
        3,
    });
  });

  it('returns zero for a valid empty jackpot scope', async () => {
    const draw =
      await createWeeklyDraw();

    const weekly =
      await service.getWeeklyJackpot(
        draw.id,
      );

    const annual =
      await service.getAnnualJackpot(
        2026,
      );

    expect(
      weekly.balanceMinor,
    ).toBe(0n);

    expect(
      annual.balanceMinor,
    ).toBe(0n);
  });
});
