import {
  ConflictException,
} from '@nestjs/common';
import {
  LedgerAccountCode,
  LedgerSide,
  LedgerTransactionType,
  PrizeEligibilityCheckStatus,
  PrizeEligibilityCheckType,
  PrizeStatus,
  PayoutStatus,
} from '@prisma/client';

import {
  PayoutOrchestratorService,
} from '../../src/payouts/payout-orchestrator.service';

describe(
  'PayoutOrchestratorService',
  () => {
    const queryRaw =
      jest.fn();
    const prizeFindUnique =
      jest.fn();
    const payoutFindUnique =
      jest.fn();
    const payoutCreate =
      jest.fn();
    const payoutUpdate =
      jest.fn();
    const payoutUpdateMany =
      jest.fn();
    const prizeUpdateMany =
      jest.fn();
    const ledgerFindFirst =
      jest.fn();
    const ledgerFindUnique =
      jest.fn();

    const tx = {
      $queryRaw:
        queryRaw,
      prize: {
        findUnique:
          prizeFindUnique,
        updateMany:
          prizeUpdateMany,
      },
      payout: {
        findUnique:
          payoutFindUnique,
        create:
          payoutCreate,
        update:
          payoutUpdate,
        updateMany:
          payoutUpdateMany,
      },
      ledgerTransaction: {
        findFirst:
          ledgerFindFirst,
        findUnique:
          ledgerFindUnique,
      },
    };

    const prisma = {
      $transaction:
        jest.fn(
          async (
            callback:
              (client:
                typeof tx) =>
                Promise<unknown>,
          ) =>
            callback(tx),
        ),
    };

    const ledger = {
      appendInTransaction:
        jest.fn(),
    };

    const service =
      new PayoutOrchestratorService(
        prisma as never,
        ledger as never,
      );

    const eligibleClaim = {
      reviewedAt:
        new Date(),
      checks: [
        PrizeEligibilityCheckType
          .IDENTITY,
        PrizeEligibilityCheckType
          .AGE,
        PrizeEligibilityCheckType
          .JURISDICTION,
      ].map(
        (type) => ({
          type,
          status:
            PrizeEligibilityCheckStatus
              .PASSED,
        }),
      ),
    };

    beforeEach(() => {
      jest.clearAllMocks();
      queryRaw.mockResolvedValue([
        {
          id:
            'row-id',
        },
      ]);
    });

    it(
      'prepares one immutable payout for an approved eligible prize',
      async () => {
        prizeFindUnique
          .mockResolvedValue({
            id:
              'prize-id',
            userId:
              'user-id',
            status:
              PrizeStatus.APPROVED,
            amountMinor:
              175n,
            currency:
              'USD',
            claim:
              eligibleClaim,
            payouts:
              [],
          });

        payoutCreate
          .mockResolvedValue({
            id:
              'payout-id',
            prizeId:
              'prize-id',
            amountMinor:
              175n,
            currency:
              'USD',
            provider:
              'TEST_PROVIDER',
            destinationRef:
              'destination-token',
          });

        prizeUpdateMany
          .mockResolvedValue({
            count:
              1,
          });

        await expect(
          service.prepare({
            prizeId:
              'prize-id',
            provider:
              'test_provider',
            destinationRef:
              'destination-token',
          }),
        ).resolves.toMatchObject({
          payoutId:
            'payout-id',
          alreadyPrepared:
            false,
        });
      },
    );

    it(
      'moves a prepared payout into processing before provider execution',
      async () => {
        payoutFindUnique
          .mockResolvedValue({
            id:
              'payout-id',
            prizeId:
              'prize-id',
            userId:
              'user-id',
            amountMinor:
              175n,
            currency:
              'USD',
            provider:
              'TEST_PROVIDER',
            destinationRef:
              'destination-token',
            idempotencyKey:
              'payout:prize-id',
            status:
              PayoutStatus.CREATED,
            prize: {
              status:
                PrizeStatus
                  .PAYOUT_PENDING,
            },
          });

        payoutUpdateMany
          .mockResolvedValue({
            count:
              1,
          });

        await expect(
          service.beginExecution(
            'payout-id',
          ),
        ).resolves.toMatchObject({
          payoutId:
            'payout-id',
          idempotencyKey:
            'payout:prize-id',
        });
      },
    );

    it(
      'finalizes provider success with balanced sealed ledger settlement',
      async () => {
        payoutFindUnique
          .mockResolvedValue({
            id:
              'payout-id',
            prizeId:
              'prize-id',
            userId:
              'user-id',
            amountMinor:
              175n,
            currency:
              'USD',
            provider:
              'TEST_PROVIDER',
            providerTransactionId:
              null,
            status:
              PayoutStatus.PROCESSING,
            prize: {
              status:
                PrizeStatus
                  .PAYOUT_PENDING,
              paidAt:
                null,
            },
          });

        ledgerFindFirst
          .mockResolvedValue({
            id:
              'recognition-ledger-id',
            sealedAt:
              new Date(),
            postings: [
              {
                accountCode:
                  LedgerAccountCode
                    .PRIZE_PAYABLE,
                side:
                  LedgerSide.CREDIT,
                amountMinor:
                  175n,
              },
            ],
          });

        ledger.appendInTransaction
          .mockResolvedValue({
            transaction: {
              id:
                'payout-ledger-id',
            },
            alreadyAppended:
              false,
          });

        payoutUpdate
          .mockResolvedValue({});

        prizeUpdateMany
          .mockResolvedValue({
            count:
              1,
          });

        const result =
          await service
            .finalizeSucceeded(
              'payout-id',
              'provider-transaction-id',
            );

        expect(
          result.ledgerTransactionId,
        ).toBe(
          'payout-ledger-id',
        );

        expect(
          ledger.appendInTransaction,
        ).toHaveBeenCalledWith(
          tx,
          expect.objectContaining({
            type:
              LedgerTransactionType
                .PAYOUT_COMPLETED,
            postings: [
              {
                accountCode:
                  LedgerAccountCode
                    .PRIZE_PAYABLE,
                side:
                  LedgerSide.DEBIT,
                amountMinor:
                  175n,
              },
              {
                accountCode:
                  LedgerAccountCode
                    .PAYOUT_CLEARING,
                side:
                  LedgerSide.CREDIT,
                amountMinor:
                  175n,
              },
            ],
          }),
        );
      },
    );

    it(
      'rejects provider transaction identity replacement',
      async () => {
        payoutFindUnique
          .mockResolvedValue({
            id:
              'payout-id',
            prizeId:
              'prize-id',
            userId:
              'user-id',
            amountMinor:
              175n,
            currency:
              'USD',
            provider:
              'TEST_PROVIDER',
            providerTransactionId:
              'provider-original',
            status:
              PayoutStatus.PENDING,
            prize: {
              status:
                PrizeStatus
                  .PAYOUT_PENDING,
            },
          });

        await expect(
          service.finalizeSucceeded(
            'payout-id',
            'provider-other',
          ),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );
      },
    );
  },
);
