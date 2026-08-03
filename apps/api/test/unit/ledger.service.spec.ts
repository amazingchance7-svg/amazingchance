import { BadRequestException } from '@nestjs/common';
import {
  LedgerAccountCode,
  LedgerSide,
  LedgerTransactionType,
} from '@prisma/client';

import { LedgerService } from '../../src/ledger/ledger.service';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('LedgerService', () => {
  const prisma = {} as PrismaService;
  const service = new LedgerService(prisma);

  const validInput = {
    type: LedgerTransactionType.PAYMENT_CONFIRMED,
    idempotencyKey: 'payment-confirmed:payment-1',
    referenceType: 'PAYMENT',
    referenceId: 'payment-1',
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

  it('rejects an unbalanced transaction before database access', async () => {
    await expect(
      service.append({
        ...validInput,
        postings: [
          validInput.postings[0],
          {
            ...validInput.postings[1],
            amountMinor: 99n,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects zero or negative posting amounts', async () => {
    await expect(
      service.append({
        ...validInput,
        postings: [
          {
            ...validInput.postings[0],
            amountMinor: 0n,
          },
          validInput.postings[1],
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires at least two postings', async () => {
    await expect(
      service.append({
        ...validInput,
        postings: [validInput.postings[0]],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
