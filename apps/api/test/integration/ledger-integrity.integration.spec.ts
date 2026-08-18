import {
  LedgerAccountCode,
  LedgerSide,
  LedgerTransactionType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { LedgerIntegrityService } from '../../src/ledger/ledger-integrity.service';
import { LedgerService } from '../../src/ledger/ledger.service';
import { PaymentPrismaService, PrismaService } from '../../src/prisma/prisma.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';
import {
  createTestPaymentPrisma,
} from './database-role.helper';

describe('Ledger integrity verification integration', () => {
  let prisma: PrismaService;
  let paymentPrisma: PaymentPrismaService;
  let ledgerService: LedgerService;
  let integrityService:
    LedgerIntegrityService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    paymentPrisma = await createTestPaymentPrisma();

    ledgerService =
      new LedgerService(paymentPrisma);

    integrityService =
      new LedgerIntegrityService(prisma);
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await Promise.all([
      prisma.$disconnect(),
      paymentPrisma.$disconnect(),
    ]);
  });

  it('reports a healthy ledger after valid transactions', async () => {
    await ledgerService.append({
      type:
        LedgerTransactionType
          .PAYMENT_CONFIRMED,
      idempotencyKey:
        `ledger-${randomUUID()}`,
      referenceType: 'PURCHASE',
      referenceId: randomUUID(),
      currency: 'USD',
      description:
        'Verified payment',
      postings: [
        {
          accountCode:
            LedgerAccountCode.CASH,
          side: LedgerSide.DEBIT,
          amountMinor: 500n,
        },
        {
          accountCode:
            LedgerAccountCode
              .PAYMENT_CLEARING,
          side: LedgerSide.CREDIT,
          amountMinor: 500n,
        },
      ],
    });

    await ledgerService.append({
      type:
        LedgerTransactionType
          .PAYMENT_CONFIRMED,
      idempotencyKey:
        `ledger-${randomUUID()}`,
      referenceType: 'PURCHASE',
      referenceId: randomUUID(),
      currency: 'USD',
      postings: [
        {
          accountCode:
            LedgerAccountCode.CASH,
          side: LedgerSide.DEBIT,
          amountMinor: 300n,
        },
        {
          accountCode:
            LedgerAccountCode
              .PAYMENT_CLEARING,
          side: LedgerSide.CREDIT,
          amountMinor: 300n,
        },
      ],
    });

    const report =
      await integrityService.verify();

    expect(report).toMatchObject({
      healthy: true,
      checkedTransactions: 2,
      checkedPostings: 4,
      sealedTransactions: 2,
      unsealedTransactions: 0,
      balancedTransactions: 2,
      unbalancedTransactions: 0,
      transactionsWithoutPostings: 0,
      nonPositivePostings: 0,
      issues: [],
    });
  });

  it('checks multiple currencies independently per transaction', async () => {
    await ledgerService.append({
      type:
        LedgerTransactionType
          .PAYMENT_CONFIRMED,
      idempotencyKey:
        `usd-${randomUUID()}`,
      referenceType: 'PURCHASE',
      referenceId: randomUUID(),
      currency: 'USD',
      postings: [
        {
          accountCode:
            LedgerAccountCode.CASH,
          side: LedgerSide.DEBIT,
          amountMinor: 100n,
        },
        {
          accountCode:
            LedgerAccountCode
              .PAYMENT_CLEARING,
          side: LedgerSide.CREDIT,
          amountMinor: 100n,
        },
      ],
    });

    await ledgerService.append({
      type:
        LedgerTransactionType
          .PAYMENT_CONFIRMED,
      idempotencyKey:
        `eur-${randomUUID()}`,
      referenceType: 'PURCHASE',
      referenceId: randomUUID(),
      currency: 'EUR',
      postings: [
        {
          accountCode:
            LedgerAccountCode.CASH,
          side: LedgerSide.DEBIT,
          amountMinor: 250n,
        },
        {
          accountCode:
            LedgerAccountCode
              .PAYMENT_CLEARING,
          side: LedgerSide.CREDIT,
          amountMinor: 250n,
        },
      ],
    });

    const report =
      await integrityService.verify();

    expect(report).toMatchObject({
      healthy: true,
      checkedTransactions: 2,
      checkedPostings: 4,
      sealedTransactions: 2,
      unsealedTransactions: 0,
      balancedTransactions: 2,
      unbalancedTransactions: 0,
      transactionsWithoutPostings: 0,
      nonPositivePostings: 0,
      issues: [],
    });
  });
});
