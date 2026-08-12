import {
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  DrawType,
  LedgerAccountCode,
  Prisma,
} from '@prisma/client';

import {
  PrismaService,
} from '../prisma/prisma.service';

type PoolRow = {
  amountMinor: bigint;
};

export type PrizePoolInput = {
  drawId: string;
  drawType: DrawType;
  participationYear:
    number | null;
  currency: string;
};

export type ResolvedPrizePool = {
  amountMinor: bigint;
  sourceAccountCode:
    LedgerAccountCode;
};

@Injectable()
export class PrizePoolService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  resolve(
    input: PrizePoolInput,
  ): Promise<ResolvedPrizePool> {
    return this.resolveWithClient(
      this.prisma,
      input,
    );
  }

  resolveInTransaction(
    tx: Prisma.TransactionClient,
    input: PrizePoolInput,
  ): Promise<ResolvedPrizePool> {
    return this.resolveWithClient(
      tx,
      input,
    );
  }

  private async resolveWithClient(
    client:
      PrismaService |
      Prisma.TransactionClient,
    input:
      PrizePoolInput,
  ): Promise<ResolvedPrizePool> {
    if (
      !/^[A-Z]{3}$/.test(
        input.currency,
      )
    ) {
      throw new ConflictException(
        'Prize pool currency is invalid',
      );
    }

    if (
      input.drawType ===
      DrawType.WEEKLY
    ) {
      const rows =
        await client.$queryRaw<
          PoolRow[]
        >`
          SELECT
            COALESCE(
              SUM(
                posting."amountMinor"
              ),
              0
            )::bigint AS "amountMinor"
          FROM "ledger_postings" posting
          JOIN "ledger_transactions" transaction
            ON transaction."id" =
              posting."transactionId"
          WHERE
            transaction."type" =
              'PAYMENT_ALLOCATION'
            AND transaction."currency" =
              ${input.currency}
            AND transaction."metadata"->>'drawId' =
              ${input.drawId}
            AND posting."accountCode" =
              'WEEKLY_JACKPOT'
            AND posting."side" =
              'CREDIT'
        `;

      return this.assertPositivePool(
        rows[0]?.amountMinor ??
          0n,
        LedgerAccountCode
          .WEEKLY_JACKPOT,
      );
    }

    if (
      input.participationYear ===
        null ||
      !Number.isInteger(
        input.participationYear,
      )
    ) {
      throw new ConflictException(
        'Annual draw requires a participation year for prize-pool attribution',
      );
    }

    const rows =
      await client.$queryRaw<
        PoolRow[]
      >`
        SELECT
          COALESCE(
            SUM(
              posting."amountMinor"
            ),
            0
          )::bigint AS "amountMinor"
        FROM "ledger_postings" posting
        JOIN "ledger_transactions" transaction
          ON transaction."id" =
            posting."transactionId"
        JOIN "lottery_draws" source_draw
          ON source_draw."id"::text =
            transaction."metadata"->>'drawId'
        WHERE
          transaction."type" =
            'PAYMENT_ALLOCATION'
          AND transaction."currency" =
            ${input.currency}
          AND posting."accountCode" =
            'ANNUAL_JACKPOT'
          AND posting."side" =
            'CREDIT'
          AND source_draw."type" =
            'WEEKLY'
          AND EXTRACT(
            YEAR FROM
              source_draw."scheduledDrawAt"
          )::integer =
            ${input.participationYear}
      `;

    return this.assertPositivePool(
      rows[0]?.amountMinor ??
        0n,
      LedgerAccountCode
        .ANNUAL_JACKPOT,
    );
  }

  private assertPositivePool(
    amountMinor: bigint,
    sourceAccountCode:
      LedgerAccountCode,
  ): ResolvedPrizePool {
    if (amountMinor <= 0n) {
      throw new ConflictException(
        'No positive ledger-backed prize pool is available for the draw',
      );
    }

    return {
      amountMinor,
      sourceAccountCode,
    };
  }
}
