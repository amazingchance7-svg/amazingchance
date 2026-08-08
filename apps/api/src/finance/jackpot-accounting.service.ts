import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DrawType,
  LedgerAccountCode,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type JackpotBalanceRow = {
  creditMinor: bigint;
  debitMinor: bigint;
  postingCount: bigint;
  transactionCount: bigint;
};

export type JackpotBalance = {
  currency: string;
  creditMinor: bigint;
  debitMinor: bigint;
  balanceMinor: bigint;
  postingCount: number;
  transactionCount: number;
};

export type WeeklyJackpotBalance =
  JackpotBalance & {
    drawId: string;
    drawPublicId: string;
  };

export type AnnualJackpotBalance =
  JackpotBalance & {
    participationYear: number;
  };

@Injectable()
export class JackpotAccountingService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async getWeeklyJackpot(
    drawId: string,
  ): Promise<WeeklyJackpotBalance> {
    const draw =
      await this.prisma.lotteryDraw.findUnique({
        where: {
          id: drawId,
        },
        select: {
          id: true,
          publicId: true,
          type: true,
          currency: true,
        },
      });

    if (!draw) {
      throw new NotFoundException(
        'Lottery draw not found',
      );
    }

    if (
      draw.type !==
      DrawType.WEEKLY
    ) {
      throw new ConflictException(
        'Weekly jackpot accounting is only available for weekly draws',
      );
    }

    const [row] =
      await this.prisma.$queryRaw<
        JackpotBalanceRow[]
      >(Prisma.sql`
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN lp."side" = 'CREDIT'
                THEN lp."amountMinor"
                ELSE 0
              END
            ),
            0
          )::bigint AS "creditMinor",
          COALESCE(
            SUM(
              CASE
                WHEN lp."side" = 'DEBIT'
                THEN lp."amountMinor"
                ELSE 0
              END
            ),
            0
          )::bigint AS "debitMinor",
          COUNT(lp."id")::bigint
            AS "postingCount",
          COUNT(
            DISTINCT lt."id"
          )::bigint
            AS "transactionCount"
        FROM "ledger_postings" lp
        INNER JOIN "ledger_transactions" lt
          ON lt."id" = lp."transactionId"
        LEFT JOIN "payments" p
          ON lt."referenceType" = 'PAYMENT'
          AND lt."referenceId" = p."id"::text
        LEFT JOIN "purchases" pu
          ON pu."id" = p."purchaseId"
        WHERE
          lt."sealedAt" IS NOT NULL
          AND lt."currency" = ${draw.currency}
          AND lp."accountCode" = 'WEEKLY_JACKPOT'
          AND (
            pu."drawId" = ${draw.id}::uuid
            OR lt."metadata" ->> 'drawId'
              = ${draw.id}
          )
      `);

    const balance =
      this.normalizeBalance(
        row,
        draw.currency,
      );

    return {
      drawId:
        draw.id,
      drawPublicId:
        draw.publicId,
      ...balance,
    };
  }

  async getAnnualJackpot(
    participationYear: number,
    currency = 'USD',
  ): Promise<AnnualJackpotBalance> {
    this.validateParticipationYear(
      participationYear,
    );

    this.validateCurrency(
      currency,
    );

    const yearString =
      participationYear.toString();

    const [row] =
      await this.prisma.$queryRaw<
        JackpotBalanceRow[]
      >(Prisma.sql`
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN lp."side" = 'CREDIT'
                THEN lp."amountMinor"
                ELSE 0
              END
            ),
            0
          )::bigint AS "creditMinor",
          COALESCE(
            SUM(
              CASE
                WHEN lp."side" = 'DEBIT'
                THEN lp."amountMinor"
                ELSE 0
              END
            ),
            0
          )::bigint AS "debitMinor",
          COUNT(lp."id")::bigint
            AS "postingCount",
          COUNT(
            DISTINCT lt."id"
          )::bigint
            AS "transactionCount"
        FROM "ledger_postings" lp
        INNER JOIN "ledger_transactions" lt
          ON lt."id" = lp."transactionId"
        LEFT JOIN "payments" p
          ON lt."referenceType" = 'PAYMENT'
          AND lt."referenceId" = p."id"::text
        LEFT JOIN "purchases" pu
          ON pu."id" = p."purchaseId"
        LEFT JOIN "lottery_draws" d
          ON d."id" = pu."drawId"
        WHERE
          lt."sealedAt" IS NOT NULL
          AND lt."currency" = ${currency}
          AND lp."accountCode" = 'ANNUAL_JACKPOT'
          AND (
            (
              d."id" IS NOT NULL
              AND COALESCE(
                d."participationYear",
                EXTRACT(
                  YEAR
                  FROM d."scheduledDrawAt"
                )::integer
              ) = ${participationYear}
            )
            OR lt."metadata"
              ->> 'participationYear'
              = ${yearString}
          )
      `);

    return {
      participationYear,
      ...this.normalizeBalance(
        row,
        currency,
      ),
    };
  }

  async getAccountBalance(
    accountCode: LedgerAccountCode,
    currency = 'USD',
  ): Promise<JackpotBalance> {
    this.validateCurrency(
      currency,
    );

    const [row] =
      await this.prisma.$queryRaw<
        JackpotBalanceRow[]
      >(Prisma.sql`
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN lp."side" = 'CREDIT'
                THEN lp."amountMinor"
                ELSE 0
              END
            ),
            0
          )::bigint AS "creditMinor",
          COALESCE(
            SUM(
              CASE
                WHEN lp."side" = 'DEBIT'
                THEN lp."amountMinor"
                ELSE 0
              END
            ),
            0
          )::bigint AS "debitMinor",
          COUNT(lp."id")::bigint
            AS "postingCount",
          COUNT(
            DISTINCT lt."id"
          )::bigint
            AS "transactionCount"
        FROM "ledger_postings" lp
        INNER JOIN "ledger_transactions" lt
          ON lt."id" = lp."transactionId"
        WHERE
          lt."sealedAt" IS NOT NULL
          AND lt."currency" = ${currency}
          AND lp."accountCode" =
            ${accountCode}::"LedgerAccountCode"
      `);

    return this.normalizeBalance(
      row,
      currency,
    );
  }

  async assertWeeklyJackpotAvailable(
    drawId: string,
    amountMinor: bigint,
  ): Promise<WeeklyJackpotBalance> {
    this.validateRequestedAmount(
      amountMinor,
    );

    const balance =
      await this.getWeeklyJackpot(
        drawId,
      );

    if (
      balance.balanceMinor <
      amountMinor
    ) {
      throw new ConflictException(
        'Weekly jackpot has insufficient available balance',
      );
    }

    return balance;
  }

  async assertAnnualJackpotAvailable(
    participationYear: number,
    amountMinor: bigint,
    currency = 'USD',
  ): Promise<AnnualJackpotBalance> {
    this.validateRequestedAmount(
      amountMinor,
    );

    const balance =
      await this.getAnnualJackpot(
        participationYear,
        currency,
      );

    if (
      balance.balanceMinor <
      amountMinor
    ) {
      throw new ConflictException(
        'Annual jackpot has insufficient available balance',
      );
    }

    return balance;
  }

  private normalizeBalance(
    row:
      | JackpotBalanceRow
      | undefined,
    currency: string,
  ): JackpotBalance {
    const creditMinor =
      row?.creditMinor ?? 0n;

    const debitMinor =
      row?.debitMinor ?? 0n;

    return {
      currency,
      creditMinor,
      debitMinor,
      balanceMinor:
        creditMinor -
        debitMinor,
      postingCount:
        Number(
          row?.postingCount ??
            0n,
        ),
      transactionCount:
        Number(
          row?.transactionCount ??
            0n,
        ),
    };
  }

  private validateParticipationYear(
    participationYear: number,
  ): void {
    if (
      !Number.isInteger(
        participationYear,
      ) ||
      participationYear < 2000 ||
      participationYear > 2200
    ) {
      throw new BadRequestException(
        'Participation year is invalid',
      );
    }
  }

  private validateCurrency(
    currency: string,
  ): void {
    if (
      !/^[A-Z]{3}$/.test(
        currency,
      )
    ) {
      throw new BadRequestException(
        'Currency must be a three-letter uppercase code',
      );
    }
  }

  private validateRequestedAmount(
    amountMinor: bigint,
  ): void {
    if (
      amountMinor <= 0n
    ) {
      throw new BadRequestException(
        'Requested jackpot amount must be positive',
      );
    }
  }
}
