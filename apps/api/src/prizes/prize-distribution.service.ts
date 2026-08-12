import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  DrawType,
  Prisma,
} from '@prisma/client';

import {
  PrismaService,
} from '../prisma/prisma.service';

const BASIS_POINTS_TOTAL =
  10_000;

type PrizeRuleClient =
  | PrismaService
  | Prisma.TransactionClient;

export type PrizeDistributionEntry = {
  rank: number;
  shareBps: number;
};

export type ResolvedPrizeDistributionRule = {
  id: string;
  version: number;
  drawType: DrawType;
  effectiveAt: Date;
  entries:
    PrizeDistributionEntry[];
};

export type CalculatedPrize = {
  rank: number;
  shareBps: number;
  amountMinor: bigint;
};

@Injectable()
export class PrizeDistributionService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  resolve(
    drawType: DrawType,
    effectiveAt: Date,
    winnerCount: number,
  ): Promise<ResolvedPrizeDistributionRule> {
    return this.resolveWithClient(
      this.prisma,
      drawType,
      effectiveAt,
      winnerCount,
    );
  }

  resolveInTransaction(
    tx: Prisma.TransactionClient,
    drawType: DrawType,
    effectiveAt: Date,
    winnerCount: number,
  ): Promise<ResolvedPrizeDistributionRule> {
    return this.resolveWithClient(
      tx,
      drawType,
      effectiveAt,
      winnerCount,
    );
  }

  calculate(
    poolAmountMinor: bigint,
    rule:
      ResolvedPrizeDistributionRule,
  ): CalculatedPrize[] {
    if (poolAmountMinor <= 0n) {
      throw new ConflictException(
        'Prize pool must be positive',
      );
    }

    const calculated =
      rule.entries.map(
        (entry) => ({
          rank:
            entry.rank,
          shareBps:
            entry.shareBps,
          amountMinor:
            (
              poolAmountMinor *
              BigInt(
                entry.shareBps,
              )
            ) /
            BigInt(
              BASIS_POINTS_TOTAL,
            ),
        }),
      );

    const allocated =
      calculated.reduce(
        (
          total,
          prize,
        ) =>
          total +
          prize.amountMinor,
        0n,
      );

    const remainder =
      poolAmountMinor -
      allocated;

    if (remainder > 0n) {
      calculated[0] = {
        ...calculated[0],
        amountMinor:
          calculated[0]
            .amountMinor +
          remainder,
      };
    }

    if (
      calculated.some(
        (prize) =>
          prize.amountMinor <=
          0n,
      )
    ) {
      throw new ConflictException(
        'Prize pool is too small for the configured distribution rule',
      );
    }

    return calculated;
  }

  private async resolveWithClient(
    client:
      PrizeRuleClient,
    drawType:
      DrawType,
    effectiveAt:
      Date,
    winnerCount:
      number,
  ): Promise<ResolvedPrizeDistributionRule> {
    if (
      Number.isNaN(
        effectiveAt.getTime(),
      )
    ) {
      throw new ConflictException(
        'Prize distribution effective time is invalid',
      );
    }

    if (
      !Number.isInteger(
        winnerCount,
      ) ||
      winnerCount < 1
    ) {
      throw new ConflictException(
        'Winner count must be a positive integer',
      );
    }

    const rules =
      await client
        .prizeDistributionRule
        .findMany({
          where: {
            drawType,
            effectiveFrom: {
              lte:
                effectiveAt,
            },
            OR: [
              {
                effectiveTo:
                  null,
              },
              {
                effectiveTo: {
                  gt:
                    effectiveAt,
                },
              },
            ],
          },
          include: {
            entries: {
              orderBy: {
                rank:
                  'asc',
              },
            },
          },
          orderBy: {
            version:
              'desc',
          },
          take:
            2,
        });

    if (
      rules.length === 0
    ) {
      throw new ConflictException(
        `No prize distribution rule is effective for ${drawType}`,
      );
    }

    if (
      rules.length > 1
    ) {
      throw new ConflictException(
        `Multiple prize distribution rules are effective for ${drawType}`,
      );
    }

    const rule =
      rules[0];

    if (
      rule.entries.length !==
      winnerCount
    ) {
      throw new ConflictException(
        `Prize distribution rule version ${rule.version} does not match winner count ${winnerCount}`,
      );
    }

    const ranksValid =
      rule.entries.every(
        (
          entry,
          index,
        ) =>
          entry.rank ===
          index + 1,
      );

    if (!ranksValid) {
      throw new ConflictException(
        `Prize distribution rule version ${rule.version} must define contiguous ranks starting at 1`,
      );
    }

    const totalBps =
      rule.entries.reduce(
        (
          total,
          entry,
        ) =>
          total +
          entry.shareBps,
        0,
      );

    if (
      totalBps !==
      BASIS_POINTS_TOTAL
    ) {
      throw new ConflictException(
        `Prize distribution rule version ${rule.version} must total 10000 basis points`,
      );
    }

    return {
      id:
        rule.id,
      version:
        rule.version,
      drawType:
        rule.drawType,
      effectiveAt,
      entries:
        rule.entries.map(
          (entry) => ({
            rank:
              entry.rank,
            shareBps:
              entry.shareBps,
          }),
        ),
    };
  }
}
