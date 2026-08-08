import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  LedgerAccountCode,
  LedgerSide,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const BASIS_POINTS_TOTAL = 10_000;

type AllocationClient =
  | PrismaService
  | Prisma.TransactionClient;

export type FinancialAllocation = {
  ruleId: string;
  ruleVersion: number;
  weeklyJackpotBps: number;
  annualJackpotBps: number;
  companyRevenueBps: number;
  effectiveAt: Date;
  sourceAmountMinor: bigint;
  weeklyJackpotMinor: bigint;
  annualJackpotMinor: bigint;
  companyRevenueMinor: bigint;
};

@Injectable()
export class FinancialAllocationService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  resolveAndAllocate(
    amountMinor: bigint,
    effectiveAt: Date,
  ): Promise<FinancialAllocation> {
    return this.resolveAndAllocateWithClient(
      this.prisma,
      amountMinor,
      effectiveAt,
    );
  }

  resolveAndAllocateInTransaction(
    tx: Prisma.TransactionClient,
    amountMinor: bigint,
    effectiveAt: Date,
  ): Promise<FinancialAllocation> {
    return this.resolveAndAllocateWithClient(
      tx,
      amountMinor,
      effectiveAt,
    );
  }

  buildLedgerPostings(
    allocation: FinancialAllocation,
  ) {
    const credits = [
      {
        accountCode:
          LedgerAccountCode.WEEKLY_JACKPOT,
        side:
          LedgerSide.CREDIT,
        amountMinor:
          allocation.weeklyJackpotMinor,
      },
      {
        accountCode:
          LedgerAccountCode.ANNUAL_JACKPOT,
        side:
          LedgerSide.CREDIT,
        amountMinor:
          allocation.annualJackpotMinor,
      },
      {
        accountCode:
          LedgerAccountCode.COMPANY_REVENUE,
        side:
          LedgerSide.CREDIT,
        amountMinor:
          allocation.companyRevenueMinor,
      },
    ].filter(
      (posting) =>
        posting.amountMinor > 0n,
    );

    return [
      {
        accountCode:
          LedgerAccountCode.PAYMENT_CLEARING,
        side:
          LedgerSide.DEBIT,
        amountMinor:
          allocation.sourceAmountMinor,
      },
      ...credits,
    ];
  }

  private async resolveAndAllocateWithClient(
    client: AllocationClient,
    amountMinor: bigint,
    effectiveAt: Date,
  ): Promise<FinancialAllocation> {
    if (amountMinor <= 0n) {
      throw new BadRequestException(
        'Financial allocation amount must be positive',
      );
    }

    if (
      Number.isNaN(
        effectiveAt.getTime(),
      )
    ) {
      throw new BadRequestException(
        'Financial allocation effective time is invalid',
      );
    }

    const rules =
      await client.allocationRule.findMany({
        where: {
          effectiveFrom: {
            lte: effectiveAt,
          },
          OR: [
            {
              effectiveTo: null,
            },
            {
              effectiveTo: {
                gt: effectiveAt,
              },
            },
          ],
        },
        orderBy: {
          version: 'desc',
        },
        take: 2,
      });

    if (rules.length === 0) {
      throw new ConflictException(
        'No financial allocation rule is effective for the payment time',
      );
    }

    if (rules.length > 1) {
      throw new ConflictException(
        'Multiple financial allocation rules are effective for the payment time',
      );
    }

    const rule = rules[0];
    const total =
      rule.weeklyJackpotBps +
      rule.annualJackpotBps +
      rule.companyRevenueBps;

    if (total !== BASIS_POINTS_TOTAL) {
      throw new ConflictException(
        `Financial allocation rule version ${rule.version} must total 10000 basis points`,
      );
    }

    const weeklyJackpotMinor =
      (amountMinor *
        BigInt(
          rule.weeklyJackpotBps,
        )) /
      BigInt(BASIS_POINTS_TOTAL);

    const annualJackpotMinor =
      (amountMinor *
        BigInt(
          rule.annualJackpotBps,
        )) /
      BigInt(BASIS_POINTS_TOTAL);

    const companyRevenueMinor =
      amountMinor -
      weeklyJackpotMinor -
      annualJackpotMinor;

    return {
      ruleId: rule.id,
      ruleVersion: rule.version,
      weeklyJackpotBps:
        rule.weeklyJackpotBps,
      annualJackpotBps:
        rule.annualJackpotBps,
      companyRevenueBps:
        rule.companyRevenueBps,
      effectiveAt,
      sourceAmountMinor:
        amountMinor,
      weeklyJackpotMinor,
      annualJackpotMinor,
      companyRevenueMinor,
    };
  }
}
