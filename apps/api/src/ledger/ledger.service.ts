import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  LedgerAccountCode,
  LedgerSide,
  LedgerTransactionType,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export type LedgerPostingInput = {
  accountCode: LedgerAccountCode;
  side: LedgerSide;
  amountMinor: bigint;
};

export type AppendLedgerTransactionInput = {
  type: LedgerTransactionType;
  idempotencyKey: string;
  referenceType: string;
  referenceId: string;
  currency: string;
  description?: string;
  metadata?: Prisma.InputJsonValue;
  postings: LedgerPostingInput[];
};

export type AppendLedgerTransactionResult = {
  transaction: Prisma.LedgerTransactionGetPayload<{
    include: { postings: true };
  }>;
  alreadyAppended: boolean;
};

type LedgerClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    input: AppendLedgerTransactionInput,
  ): Promise<AppendLedgerTransactionResult> {
    this.validateInput(input);

    const existing = await this.findByIdempotencyKey(
      this.prisma,
      input.idempotencyKey,
    );

    if (existing) {
      this.assertIdempotentMatch(existing, input);

      return {
        transaction: existing,
        alreadyAppended: true,
      };
    }

    try {
      return await this.prisma.$transaction(
        (tx) => this.appendInTransaction(tx, input),
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const concurrent = await this.findByIdempotencyKey(
          this.prisma,
          input.idempotencyKey,
        );

        if (concurrent) {
          this.assertIdempotentMatch(concurrent, input);

          return {
            transaction: concurrent,
            alreadyAppended: true,
          };
        }
      }

      throw error;
    }
  }

  async appendInTransaction(
    tx: Prisma.TransactionClient,
    input: AppendLedgerTransactionInput,
  ): Promise<AppendLedgerTransactionResult> {
    this.validateInput(input);

    const existing = await this.findByIdempotencyKey(
      tx,
      input.idempotencyKey,
    );

    if (existing) {
      this.assertIdempotentMatch(existing, input);

      return {
        transaction: existing,
        alreadyAppended: true,
      };
    }

    const created = await tx.ledgerTransaction.create({
      data: {
        type: input.type,
        idempotencyKey: input.idempotencyKey,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        currency: input.currency,
        description: input.description,
        metadata: input.metadata,
      },
    });

    await tx.ledgerPosting.createMany({
      data: input.postings.map((posting) => ({
        transactionId: created.id,
        accountCode: posting.accountCode,
        side: posting.side,
        amountMinor: posting.amountMinor,
      })),
    });

    await tx.ledgerTransaction.update({
      where: { id: created.id },
      data: { sealedAt: new Date() },
    });

    const transaction =
      await tx.ledgerTransaction.findUniqueOrThrow({
        where: { id: created.id },
        include: { postings: true },
      });

    return {
      transaction,
      alreadyAppended: false,
    };
  }

  private findByIdempotencyKey(
    client: LedgerClient,
    idempotencyKey: string,
  ) {
    return client.ledgerTransaction.findUnique({
      where: { idempotencyKey },
      include: { postings: true },
    });
  }

  private validateInput(
    input: AppendLedgerTransactionInput,
  ): void {
    if (!input.idempotencyKey.trim()) {
      throw new BadRequestException(
        'Ledger idempotency key is required',
      );
    }

    if (!input.referenceType.trim() || !input.referenceId.trim()) {
      throw new BadRequestException(
        'Ledger reference type and ID are required',
      );
    }

    if (!/^[A-Z]{3}$/.test(input.currency)) {
      throw new BadRequestException(
        'Ledger currency must be a three-letter uppercase code',
      );
    }

    if (input.postings.length < 2) {
      throw new BadRequestException(
        'A ledger transaction requires at least two postings',
      );
    }

    let debitTotal = 0n;
    let creditTotal = 0n;

    for (const posting of input.postings) {
      if (posting.amountMinor <= 0n) {
        throw new BadRequestException(
          'Ledger posting amounts must be positive',
        );
      }

      if (posting.side === LedgerSide.DEBIT) {
        debitTotal += posting.amountMinor;
      } else {
        creditTotal += posting.amountMinor;
      }
    }

    if (debitTotal !== creditTotal) {
      throw new BadRequestException(
        'Ledger transaction postings must balance',
      );
    }
  }

  private assertIdempotentMatch(
    existing: Prisma.LedgerTransactionGetPayload<{
      include: { postings: true };
    }>,
    input: AppendLedgerTransactionInput,
  ): void {
    if (
      existing.type !== input.type ||
      existing.referenceType !== input.referenceType ||
      existing.referenceId !== input.referenceId ||
      existing.currency !== input.currency
    ) {
      throw new ConflictException(
        'Ledger idempotency key was reused for another business event',
      );
    }
  }
}