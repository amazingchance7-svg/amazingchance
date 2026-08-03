import {
  LedgerAccountCode,
  LedgerSide,
  LedgerTransactionType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { LedgerService } from '../../src/ledger/ledger.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('Immutable balanced ledger integration', () => {
  let prisma: PrismaService;
  let service: LedgerService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    service = new LedgerService(prisma);
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('appends, balances and seals one immutable transaction', async () => {
    const result = await service.append({
      type: LedgerTransactionType.PAYMENT_CONFIRMED,
      idempotencyKey: `ledger_${randomUUID()}`,
      referenceType: 'PAYMENT',
      referenceId: randomUUID(),
      currency: 'USD',
      postings: [
        {
          accountCode: LedgerAccountCode.CASH,
          side: LedgerSide.DEBIT,
          amountMinor: 100n,
        },
        {
          accountCode:
            LedgerAccountCode.PAYMENT_CLEARING,
          side: LedgerSide.CREDIT,
          amountMinor: 100n,
        },
      ],
    });

    expect(result.alreadyAppended).toBe(false);
    expect(result.transaction.sealedAt).not.toBeNull();
    expect(result.transaction.postings).toHaveLength(2);
  });

  it('returns the existing transaction for an identical retry', async () => {
    const input = {
      type: LedgerTransactionType.PAYMENT_CONFIRMED,
      idempotencyKey: `ledger_${randomUUID()}`,
      referenceType: 'PAYMENT',
      referenceId: randomUUID(),
      currency: 'USD',
      postings: [
        {
          accountCode: LedgerAccountCode.CASH,
          side: LedgerSide.DEBIT,
          amountMinor: 100n,
        },
        {
          accountCode:
            LedgerAccountCode.PAYMENT_CLEARING,
          side: LedgerSide.CREDIT,
          amountMinor: 100n,
        },
      ],
    };

    const first = await service.append(input);
    const second = await service.append(input);

    expect(first.alreadyAppended).toBe(false);
    expect(second.alreadyAppended).toBe(true);
    expect(second.transaction.id).toBe(
      first.transaction.id,
    );
  });

  it('rejects direct mutation of a sealed ledger transaction', async () => {
    const result = await service.append({
      type: LedgerTransactionType.PAYMENT_CONFIRMED,
      idempotencyKey: `ledger_${randomUUID()}`,
      referenceType: 'PAYMENT',
      referenceId: randomUUID(),
      currency: 'USD',
      postings: [
        {
          accountCode: LedgerAccountCode.CASH,
          side: LedgerSide.DEBIT,
          amountMinor: 100n,
        },
        {
          accountCode:
            LedgerAccountCode.PAYMENT_CLEARING,
          side: LedgerSide.CREDIT,
          amountMinor: 100n,
        },
      ],
    });

    await expect(
      prisma.ledgerTransaction.update({
        where: { id: result.transaction.id },
        data: { description: 'tampered' },
      }),
    ).rejects.toThrow();
  });

  it('rejects deletion of ledger postings', async () => {
    const result = await service.append({
      type: LedgerTransactionType.PAYMENT_CONFIRMED,
      idempotencyKey: `ledger_${randomUUID()}`,
      referenceType: 'PAYMENT',
      referenceId: randomUUID(),
      currency: 'USD',
      postings: [
        {
          accountCode: LedgerAccountCode.CASH,
          side: LedgerSide.DEBIT,
          amountMinor: 100n,
        },
        {
          accountCode:
            LedgerAccountCode.PAYMENT_CLEARING,
          side: LedgerSide.CREDIT,
          amountMinor: 100n,
        },
      ],
    });

    await expect(
      prisma.ledgerPosting.delete({
        where: {
          id: result.transaction.postings[0].id,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects additional postings after sealing', async () => {
    const result = await service.append({
      type: LedgerTransactionType.PAYMENT_CONFIRMED,
      idempotencyKey: `ledger_${randomUUID()}`,
      referenceType: 'PAYMENT',
      referenceId: randomUUID(),
      currency: 'USD',
      postings: [
        {
          accountCode: LedgerAccountCode.CASH,
          side: LedgerSide.DEBIT,
          amountMinor: 100n,
        },
        {
          accountCode:
            LedgerAccountCode.PAYMENT_CLEARING,
          side: LedgerSide.CREDIT,
          amountMinor: 100n,
        },
      ],
    });

    await expect(
      prisma.ledgerPosting.create({
        data: {
          transactionId: result.transaction.id,
          accountCode: LedgerAccountCode.CASH,
          side: LedgerSide.DEBIT,
          amountMinor: 1n,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects an unsealed or unbalanced transaction at commit', async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const ledger = await tx.ledgerTransaction.create({
          data: {
            type:
              LedgerTransactionType.PAYMENT_CONFIRMED,
            idempotencyKey: `ledger_${randomUUID()}`,
            referenceType: 'PAYMENT',
            referenceId: randomUUID(),
            currency: 'USD',
          },
        });

        await tx.ledgerPosting.createMany({
          data: [
            {
              transactionId: ledger.id,
              accountCode: LedgerAccountCode.CASH,
              side: LedgerSide.DEBIT,
              amountMinor: 100n,
            },
            {
              transactionId: ledger.id,
              accountCode:
                LedgerAccountCode.PAYMENT_CLEARING,
              side: LedgerSide.CREDIT,
              amountMinor: 99n,
            },
          ],
        });

        await tx.ledgerTransaction.update({
          where: { id: ledger.id },
          data: { sealedAt: new Date() },
        });
      }),
    ).rejects.toThrow();
  });
});
