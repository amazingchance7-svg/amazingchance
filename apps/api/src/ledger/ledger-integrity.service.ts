import { Injectable } from '@nestjs/common';
import { LedgerSide } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import {
  LedgerIntegrityIssueCodes,
  type LedgerIntegrityReport,
} from './ledger-integrity.types';

const PAGE_SIZE = 500;
const MAX_REPORTED_ISSUES = 100;

@Injectable()
export class LedgerIntegrityService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async verify(): Promise<LedgerIntegrityReport> {
    const report: LedgerIntegrityReport = {
      healthy: true,
      checkedAt: new Date().toISOString(),
      checkedTransactions: 0,
      checkedPostings: 0,
      sealedTransactions: 0,
      unsealedTransactions: 0,
      balancedTransactions: 0,
      unbalancedTransactions: 0,
      transactionsWithoutPostings: 0,
      nonPositivePostings: 0,
      issues: [],
    };

    let cursor: string | undefined;

    while (true) {
      const transactions =
        await this.prisma.ledgerTransaction.findMany({
          take: PAGE_SIZE,
          ...(cursor
            ? {
                skip: 1,
                cursor: {
                  id: cursor,
                },
              }
            : {}),
          orderBy: {
            id: 'asc',
          },
          include: {
            postings: true,
          },
        });

      if (transactions.length === 0) {
        break;
      }

      for (const transaction of transactions) {
        report.checkedTransactions += 1;
        report.checkedPostings +=
          transaction.postings.length;

        if (transaction.sealedAt) {
          report.sealedTransactions += 1;
        } else {
          report.unsealedTransactions += 1;

          this.addIssue(report, {
            code:
              LedgerIntegrityIssueCodes.TRANSACTION_UNSEALED,
            transactionId: transaction.id,
            details:
              'Ledger transaction is not sealed',
          });
        }

        if (transaction.postings.length === 0) {
          report.transactionsWithoutPostings += 1;

          this.addIssue(report, {
            code:
              LedgerIntegrityIssueCodes.TRANSACTION_WITHOUT_POSTINGS,
            transactionId: transaction.id,
            details:
              'Ledger transaction has no postings',
          });
        }

        let debitTotal = 0n;
        let creditTotal = 0n;

        for (const posting of transaction.postings) {
          if (posting.amountMinor <= 0n) {
            report.nonPositivePostings += 1;

            this.addIssue(report, {
              code:
                LedgerIntegrityIssueCodes.NON_POSITIVE_POSTING,
              transactionId: transaction.id,
              details:
                `Posting ${posting.id} has a non-positive amount`,
            });
          }

          if (posting.side === LedgerSide.DEBIT) {
            debitTotal += posting.amountMinor;
          } else {
            creditTotal += posting.amountMinor;
          }
        }

        if (
          transaction.postings.length > 0 &&
          debitTotal === creditTotal
        ) {
          report.balancedTransactions += 1;
        } else {
          report.unbalancedTransactions += 1;

          this.addIssue(report, {
            code:
              LedgerIntegrityIssueCodes.UNBALANCED_TRANSACTION,
            transactionId: transaction.id,
            details:
              `Debit total ${debitTotal.toString()} does not equal credit total ${creditTotal.toString()}`,
          });
        }
      }

      cursor =
        transactions[
          transactions.length - 1
        ].id;
    }

    report.healthy =
      report.unsealedTransactions === 0 &&
      report.unbalancedTransactions === 0 &&
      report.transactionsWithoutPostings === 0 &&
      report.nonPositivePostings === 0;

    return report;
  }

  private addIssue(
    report: LedgerIntegrityReport,
    issue: LedgerIntegrityReport['issues'][number],
  ): void {
    if (
      report.issues.length <
      MAX_REPORTED_ISSUES
    ) {
      report.issues.push(issue);
    }
  }
}
