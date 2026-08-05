import { LedgerSide } from '@prisma/client';

import { LedgerIntegrityService } from '../../src/ledger/ledger-integrity.service';
import {
  LedgerIntegrityIssueCodes,
} from '../../src/ledger/ledger-integrity.types';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('LedgerIntegrityService', () => {
  it('reports a healthy balanced sealed ledger', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'transaction-1',
          sealedAt: new Date(),
          postings: [
            {
              id: 'posting-1',
              side: LedgerSide.DEBIT,
              amountMinor: 100n,
            },
            {
              id: 'posting-2',
              side: LedgerSide.CREDIT,
              amountMinor: 100n,
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]);

    const prisma = {
      ledgerTransaction: {
        findMany,
      },
    } as unknown as PrismaService;

    const service =
      new LedgerIntegrityService(prisma);

    const report = await service.verify();

    expect(report).toMatchObject({
      healthy: true,
      checkedTransactions: 1,
      checkedPostings: 2,
      sealedTransactions: 1,
      unsealedTransactions: 0,
      balancedTransactions: 1,
      unbalancedTransactions: 0,
      transactionsWithoutPostings: 0,
      nonPositivePostings: 0,
      issues: [],
    });
  });

  it('detects broken ledger invariants', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'transaction-1',
          sealedAt: null,
          postings: [],
        },
        {
          id: 'transaction-2',
          sealedAt: new Date(),
          postings: [
            {
              id: 'posting-1',
              side: LedgerSide.DEBIT,
              amountMinor: 100n,
            },
            {
              id: 'posting-2',
              side: LedgerSide.CREDIT,
              amountMinor: 50n,
            },
            {
              id: 'posting-3',
              side: LedgerSide.CREDIT,
              amountMinor: 0n,
            },
          ],
        },
      ])
      .mockResolvedValueOnce([]);

    const service =
      new LedgerIntegrityService({
        ledgerTransaction: {
          findMany,
        },
      } as unknown as PrismaService);

    const report = await service.verify();

    expect(report.healthy).toBe(false);
    expect(
      report.unsealedTransactions,
    ).toBe(1);
    expect(
      report.transactionsWithoutPostings,
    ).toBe(1);
    expect(
      report.unbalancedTransactions,
    ).toBe(2);
    expect(
      report.nonPositivePostings,
    ).toBe(1);

    const codes = report.issues.map(
      (issue) => issue.code,
    );

    expect(codes).toContain(
      LedgerIntegrityIssueCodes.TRANSACTION_UNSEALED,
    );

    expect(codes).toContain(
      LedgerIntegrityIssueCodes.TRANSACTION_WITHOUT_POSTINGS,
    );

    expect(codes).toContain(
      LedgerIntegrityIssueCodes.UNBALANCED_TRANSACTION,
    );

    expect(codes).toContain(
      LedgerIntegrityIssueCodes.NON_POSITIVE_POSTING,
    );
  });

  it('paginates through the ledger', async () => {
    const firstPage = Array.from(
      { length: 500 },
      (_, index) => ({
        id: `transaction-${String(
          index,
        ).padStart(4, '0')}`,
        sealedAt: new Date(),
        postings: [
          {
            id: `debit-${index}`,
            side: LedgerSide.DEBIT,
            amountMinor: 1n,
          },
          {
            id: `credit-${index}`,
            side: LedgerSide.CREDIT,
            amountMinor: 1n,
          },
        ],
      }),
    );

    const findMany = jest
      .fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([]);

    const service =
      new LedgerIntegrityService({
        ledgerTransaction: {
          findMany,
        },
      } as unknown as PrismaService);

    const report = await service.verify();

    expect(
      report.checkedTransactions,
    ).toBe(500);

    expect(findMany).toHaveBeenCalledTimes(2);

    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: {
          id: 'transaction-0499',
        },
        skip: 1,
      }),
    );
  });
});
