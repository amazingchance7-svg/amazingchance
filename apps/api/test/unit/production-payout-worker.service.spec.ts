import {
  ConfigService,
} from '@nestjs/config';
import {
  PayoutStatus,
} from '@prisma/client';

import {
  PayoutGatewayOutcome,
} from '../../src/payouts/payout-gateway';
import {
  ProductionPayoutWorkerService,
} from '../../src/workers/production-payout-worker.service';

describe(
  'ProductionPayoutWorkerService',
  () => {
    const queryRaw =
      jest.fn();

    const payoutUpdateMany =
      jest.fn();

    const payoutFindFirst =
      jest.fn();

    const transaction =
      jest.fn(
        async (
          callback: (
            tx: unknown,
          ) => unknown,
        ) =>
          callback({
            $queryRaw:
              queryRaw,
            payout: {
              updateMany:
                payoutUpdateMany,
            },
          }),
      );

    const prisma = {
      $transaction:
        transaction,
      payout: {
        findFirst:
          payoutFindFirst,
      },
    };

    const beginExecution =
      jest.fn();

    const recordProviderPending =
      jest.fn();

    const finalizeSucceeded =
      jest.fn();

    const markFailed =
      jest.fn();

    const markManualReview =
      jest.fn();

    const orchestrator = {
      beginExecution,
      recordProviderPending,
      finalizeSucceeded,
      markFailed,
      markManualReview,
    };

    const execute =
      jest.fn();

    const gateway = {
      provider:
        'NUVEI',
      execute,
    };

    const getGateway =
      jest.fn();

    const registry = {
      get:
        getGateway,
    };

    const config = {
      get:
        jest.fn(),
    } as unknown as ConfigService;

    const service =
      new ProductionPayoutWorkerService(
        prisma as never,
        config,
        orchestrator as never,
        registry as never,
      );

    const instruction = {
      payoutId:
        'payout-1',
      prizeId:
        'prize-1',
      userId:
        'user-1',
      amountMinor:
        '175',
      currency:
        'USD',
      provider:
        'NUVEI',
      destinationRef:
        'destination-1',
      idempotencyKey:
        'payout:prize-1',
    };

    beforeEach(() => {
      jest.clearAllMocks();

      payoutFindFirst
        .mockResolvedValue(
          null,
        );

      queryRaw
        .mockResolvedValue([
          {
            id:
              'payout-1',
          },
        ]);

      payoutUpdateMany
        .mockResolvedValue({
          count:
            1,
        });

      beginExecution
        .mockResolvedValue(
          instruction,
        );

      getGateway
        .mockReturnValue(
          gateway,
        );
    });

    it(
      'atomically claims CREATED payout before provider execution',
      async () => {
        execute
          .mockResolvedValue({
            outcome:
              PayoutGatewayOutcome
                .PENDING,
            providerTransactionId:
              'provider-1',
          });

        await service.processNext(
          new Date(
            '2026-08-14T07:00:00.000Z',
          ),
        );

        expect(
          payoutUpdateMany,
        ).toHaveBeenCalledWith({
          where: {
            id:
              'payout-1',
            status:
              PayoutStatus.CREATED,
          },
          data: {
            status:
              PayoutStatus.PROCESSING,
            processedAt:
              new Date(
                '2026-08-14T07:00:00.000Z',
              ),
          },
        });

        expect(
          execute,
        ).toHaveBeenCalledWith(
          instruction,
        );
      },
    );

    it(
      'finalizes provider success',
      async () => {
        execute
          .mockResolvedValue({
            outcome:
              PayoutGatewayOutcome
                .SUCCEEDED,
            providerTransactionId:
              'provider-success',
          });

        await expect(
          service.processNext(),
        ).resolves.toMatchObject({
          action:
            'PAYOUT_SUCCEEDED',
        });

        expect(
          finalizeSucceeded,
        ).toHaveBeenCalledWith(
          'payout-1',
          'provider-success',
        );
      },
    );

    it(
      'records provider pending without retrying',
      async () => {
        execute
          .mockResolvedValue({
            outcome:
              PayoutGatewayOutcome
                .PENDING,
            providerTransactionId:
              'provider-pending',
          });

        await expect(
          service.processNext(),
        ).resolves.toMatchObject({
          action:
            'PAYOUT_PENDING',
        });

        expect(
          recordProviderPending,
        ).toHaveBeenCalledWith(
          'payout-1',
          'provider-pending',
        );
      },
    );

    it(
      'records definitive provider failure',
      async () => {
        execute
          .mockResolvedValue({
            outcome:
              PayoutGatewayOutcome
                .FAILED,
            providerTransactionId:
              'provider-failed',
            failureCode:
              'DECLINED',
            failureMessage:
              'Provider declined payout',
          });

        await expect(
          service.processNext(),
        ).resolves.toMatchObject({
          action:
            'PAYOUT_FAILED',
        });

        expect(
          markFailed,
        ).toHaveBeenCalledWith(
          'payout-1',
          {
            providerTransactionId:
              'provider-failed',
            failureCode:
              'DECLINED',
            failureMessage:
              'Provider declined payout',
          },
        );
      },
    );

    it(
      'moves ambiguous provider result to manual review',
      async () => {
        execute
          .mockResolvedValue({
            outcome:
              PayoutGatewayOutcome
                .AMBIGUOUS,
            failureCode:
              'TIMEOUT',
            failureMessage:
              'Provider outcome unknown',
          });

        await expect(
          service.processNext(),
        ).resolves.toMatchObject({
          action:
            'PAYOUT_MANUAL_REVIEW',
        });

        expect(
          markManualReview,
        ).toHaveBeenCalledWith(
          'payout-1',
          expect.objectContaining({
            failureCode:
              'TIMEOUT',
          }),
        );
      },
    );

    it(
      'treats thrown provider call as ambiguous and never retries automatically',
      async () => {
        execute
          .mockRejectedValue(
            new Error(
              'network timeout',
            ),
          );

        await expect(
          service.processNext(),
        ).resolves.toMatchObject({
          action:
            'PAYOUT_MANUAL_REVIEW',
        });

        expect(
          execute,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          markManualReview,
        ).toHaveBeenCalledWith(
          'payout-1',
          expect.objectContaining({
            failureCode:
              'PAYOUT_PROVIDER_OUTCOME_UNKNOWN',
          }),
        );

        expect(
          finalizeSucceeded,
        ).not.toHaveBeenCalled();

        expect(
          recordProviderPending,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'moves stale PROCESSING payout to manual review without calling provider',
      async () => {
        payoutFindFirst
          .mockResolvedValue({
            id:
              'payout-stale',
          });

        await expect(
          service.processNext(
            new Date(
              '2026-08-14T07:00:00.000Z',
            ),
          ),
        ).resolves.toEqual({
          processed:
            true,
          action:
            'STALE_PROCESSING_TO_MANUAL_REVIEW',
          payoutId:
            'payout-stale',
        });

        expect(
          markManualReview,
        ).toHaveBeenCalledWith(
          'payout-stale',
          expect.objectContaining({
            failureCode:
              'PAYOUT_EXECUTION_UNCERTAIN',
          }),
        );

        expect(
          execute,
        ).not.toHaveBeenCalled();

        expect(
          beginExecution,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'moves payout to manual review when configured provider gateway is missing',
      async () => {
        getGateway
          .mockReturnValue(
            null,
          );

        await expect(
          service.processNext(),
        ).resolves.toMatchObject({
          action:
            'PAYOUT_MANUAL_REVIEW',
        });

        expect(
          markManualReview,
        ).toHaveBeenCalledWith(
          'payout-1',
          expect.objectContaining({
            failureCode:
              'PAYOUT_GATEWAY_NOT_CONFIGURED',
          }),
        );
      },
    );

    it(
      'returns idle when no payout is claimable',
      async () => {
        queryRaw
          .mockResolvedValue(
            [],
          );

        await expect(
          service.processNext(),
        ).resolves.toEqual({
          processed:
            false,
          action:
            'IDLE',
          payoutId:
            null,
        });

        expect(
          execute,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
