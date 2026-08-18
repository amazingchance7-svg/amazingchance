import {
  ConflictException,
} from '@nestjs/common';

import { FinancialAllocationService } from '../../src/finance/financial-allocation.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';
import {
  createTestAdminPrisma,
} from './database-role.helper';

describe('Financial allocation integration', () => {
  let prisma: PrismaService;
  let fixturePrisma: Awaited<ReturnType<typeof createTestAdminPrisma>>;
  let service:
    FinancialAllocationService;

  beforeAll(async () => {
    prisma =
      await createTestPrisma();
    fixturePrisma =
      await createTestAdminPrisma();

    service =
      new FinancialAllocationService(
        prisma,
      );
  });

  beforeEach(async () => {
    await cleanTestDatabase(
      prisma,
    );
  });

  afterAll(async () => {
    await Promise.all([
      prisma.$disconnect(),
      fixturePrisma.$disconnect(),
    ]);
  });

  async function createRule(
    version: number,
    effectiveFrom: Date,
    effectiveTo: Date | null,
    weeklyJackpotBps = 7000,
    annualJackpotBps = 1000,
    companyRevenueBps = 2000,
  ) {
    return fixturePrisma.allocationRule.create({
      data: {
        version,
        weeklyJackpotBps,
        annualJackpotBps,
        companyRevenueBps,
        effectiveFrom,
        effectiveTo,
      },
    });
  }

  it('allocates an exact one-dollar ticket as 70/10/20', async () => {
    const rule =
      await createRule(
        1,
        new Date(
          '2026-01-01T00:00:00.000Z',
        ),
        null,
      );

    const result =
      await service.resolveAndAllocate(
        100n,
        new Date(
          '2026-08-08T00:00:00.000Z',
        ),
      );

    expect(
      result,
    ).toMatchObject({
      ruleId:
        rule.id,
      ruleVersion:
        1,
      weeklyJackpotBps:
        7000,
      annualJackpotBps:
        1000,
      companyRevenueBps:
        2000,
      sourceAmountMinor:
        100n,
      weeklyJackpotMinor:
        70n,
      annualJackpotMinor:
        10n,
      companyRevenueMinor:
        20n,
    });
  });

  it('preserves every minor unit using deterministic company-share remainder handling', async () => {
    await createRule(
      1,
      new Date(
        '2026-01-01T00:00:00.000Z',
      ),
      null,
    );

    const result =
      await service.resolveAndAllocate(
        101n,
        new Date(
          '2026-08-08T00:00:00.000Z',
        ),
      );

    expect(
      result.weeklyJackpotMinor,
    ).toBe(70n);

    expect(
      result.annualJackpotMinor,
    ).toBe(10n);

    expect(
      result.companyRevenueMinor,
    ).toBe(21n);

    expect(
      result.weeklyJackpotMinor +
        result.annualJackpotMinor +
        result.companyRevenueMinor,
    ).toBe(101n);
  });

  it('selects the rule version effective at the payment time', async () => {
    await createRule(
      1,
      new Date(
        '2026-01-01T00:00:00.000Z',
      ),
      new Date(
        '2026-07-01T00:00:00.000Z',
      ),
    );

    await createRule(
      2,
      new Date(
        '2026-07-01T00:00:00.000Z',
      ),
      null,
      6500,
      1500,
      2000,
    );

    const before =
      await service.resolveAndAllocate(
        100n,
        new Date(
          '2026-06-30T23:59:59.000Z',
        ),
      );

    const after =
      await service.resolveAndAllocate(
        100n,
        new Date(
          '2026-07-01T00:00:00.000Z',
        ),
      );

    expect(
      before.ruleVersion,
    ).toBe(1);

    expect(
      before.weeklyJackpotMinor,
    ).toBe(70n);

    expect(
      after.ruleVersion,
    ).toBe(2);

    expect(
      after.weeklyJackpotMinor,
    ).toBe(65n);

    expect(
      after.annualJackpotMinor,
    ).toBe(15n);
  });

  it('rejects overlapping effective rules', async () => {
    await createRule(
      1,
      new Date(
        '2026-01-01T00:00:00.000Z',
      ),
      null,
    );

    await createRule(
      2,
      new Date(
        '2026-06-01T00:00:00.000Z',
      ),
      null,
    );

    await expect(
      service.resolveAndAllocate(
        100n,
        new Date(
          '2026-08-08T00:00:00.000Z',
        ),
      ),
    ).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects a payment time with no effective allocation rule', async () => {
    await createRule(
      1,
      new Date(
        '2026-09-01T00:00:00.000Z',
      ),
      null,
    );

    await expect(
      service.resolveAndAllocate(
        100n,
        new Date(
          '2026-08-08T00:00:00.000Z',
        ),
      ),
    ).rejects.toThrow(
      'No financial allocation rule is effective for the payment time',
    );
  });

  it('builds a balanced PAYMENT_CLEARING to destination-account posting set', async () => {
    await createRule(
      1,
      new Date(
        '2026-01-01T00:00:00.000Z',
      ),
      null,
    );

    const allocation =
      await service.resolveAndAllocate(
        100n,
        new Date(
          '2026-08-08T00:00:00.000Z',
        ),
      );

    const postings =
      service.buildLedgerPostings(
        allocation,
      );

    const debitTotal =
      postings
        .filter(
          (posting) =>
            posting.side ===
            'DEBIT',
        )
        .reduce(
          (total, posting) =>
            total +
            posting.amountMinor,
          0n,
        );

    const creditTotal =
      postings
        .filter(
          (posting) =>
            posting.side ===
            'CREDIT',
        )
        .reduce(
          (total, posting) =>
            total +
            posting.amountMinor,
          0n,
        );

    expect(
      debitTotal,
    ).toBe(100n);

    expect(
      creditTotal,
    ).toBe(100n);
  });
});
