import {
  ConfigService,
} from '@nestjs/config';

import {
  PayoutGatewayOutcome,
} from '../../src/payouts/payout-gateway';
import {
  ProductionPayoutReconciliationWorkerService,
} from '../../src/workers/production-payout-reconciliation-worker.service';

describe(
  'ProductionPayoutReconciliationWorkerService',
  () => {
    const queryRaw =
      jest.fn();

    const payoutFindUnique =
      jest.fn();

    const payoutUpdate =
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
              findUnique:
                payoutFindUnique,
              update:
                payoutUpdate,
            },
          }),
      );

    const prisma = {
      $transaction:
        transaction,
    };

    const prepareReconciliation =
      jest.fn();

    const finalizeReconciledSucceeded =
      jest.fn();

    const markReconciledFailed =
      jest.fn();

    const orchestrator = {
      prepareReconciliation,
      finalizeReconciledSucceeded,
      markReconciledFailed,
    };

    const reconcile =
      jest.fn();

    const gateway = {
      provider:
        'NUVEI',
      reconcile,
    };

    const getGateway =
      jest.fn();

    const registry = {
      get:
        getGateway,
    };

    const config = {
      get:
        jest.fn(
          (
            key:
              string,
          ) =>
            key ===
            'PAYOUT_WORKER_ENABLED'
              ? 'true'
              : undefined,
        ),
    } as unknown as ConfigService;

    const service =
      new ProductionPayoutReconciliationWorkerService(
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
      providerTransactionId:
        'provider-1',
    };

    beforeEach(() => {
      jest.clearAllMocks();

      queryRaw
        .mockResolvedValue([
          {
            id:
              'payout-1',
          },
        ]);

      payoutFindUnique
        .mockResolvedValue({
          reconciliationAttempts:
            0,
        });

      payoutUpdate
        .mockResolvedValue({});

      prepareReconciliation
        .mockResolvedValue(
          instruction,
        );

      getGateway
        .mockReturnValue(
          gateway,
        );
    });

    it(
      'returns idle when no payout is due for reconciliation',
      async () => {
        queryRaw
          .mockResolvedValue(
            [],
          );

        await expect(
          service.processNext(
            new Date(
              '2026-08-14T12:00:00.000Z',
            ),
          ),
        ).resolves.toEqual({
          processed:
            false,
          action:
            'IDLE',
          payoutId:
            null,
        });

        expect(
          reconcile,
        ).not.toHaveBeenCalled();

        expect(
          prepareReconciliation,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'persistently schedules the first reconciliation attempt before provider lookup',
      async () => {
        reconcile
          .mockResolvedValue({
            outcome:
              PayoutGatewayOutcome
                .AMBIGUOUS,
            failureCode:
              'LOOKUP_UNKNOWN',
            failureMessage:
              'Unknown provider state',
          });

        const now =
          new Date(
            '2026-08-14T12:00:00.000Z',
          );

        await service.processNext(
          now,
        );

        expect(
          payoutUpdate,
        ).toHaveBeenCalledWith({
          where: {
            id:
              'payout-1',
          },
          data: {
            reconciliationAttempts:
              1,
            lastReconciledAt:
              now,
            nextReconciliationAt:
              new Date(
                '2026-08-14T12:00:30.000Z',
              ),
          },
        });

        expect(
          prepareReconciliation,
        ).toHaveBeenCalledWith(
          'payout-1',
        );

        expect(
          reconcile,
        ).toHaveBeenCalledWith(
          instruction,
        );
      },
    );

    it(
      'applies increasing persistent reconciliation backoff',
      async () => {
        payoutFindUnique
          .mockResolvedValue({
            reconciliationAttempts:
              2,
          });

        reconcile
          .mockResolvedValue({
            outcome:
              PayoutGatewayOutcome
                .AMBIGUOUS,
            failureCode:
              'LOOKUP_UNKNOWN',
            failureMessage:
              'Unknown provider state',
          });

        const now =
          new Date(
            '2026-08-14T12:00:00.000Z',
          );

        await service.processNext(
          now,
        );

        expect(
          payoutUpdate,
        ).toHaveBeenCalledWith({
          where: {
            id:
              'payout-1',
          },
          data: {
            reconciliationAttempts:
              3,
            lastReconciledAt:
              now,
            nextReconciliationAt:
              new Date(
                '2026-08-14T12:05:00.000Z',
              ),
          },
        });
      },
    );

    it(
      'finalizes reconciled provider success without executing a payout',
      async () => {
        reconcile
          .mockResolvedValue({
            outcome:
              PayoutGatewayOutcome
                .SUCCEEDED,
            providerTransactionId:
              'provider-success',
          });

        await expect(
          service.processNext(),
        ).resolves.toEqual({
          processed:
            true,
          action:
            'RECONCILED_SUCCEEDED',
          payoutId:
            'payout-1',
        });

        expect(
          finalizeReconciledSucceeded,
        ).toHaveBeenCalledWith(
          'payout-1',
          'provider-success',
        );

        expect(
          markReconciledFailed,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'records definitive reconciled provider failure',
      async () => {
        reconcile
          .mockResolvedValue({
            outcome:
              PayoutGatewayOutcome
                .FAILED,
            providerTransactionId:
              'provider-failed',
            failureCode:
              'NUVEI_RECONCILIATION_DECLINED',
            failureMessage:
              'Provider confirmed payout was declined',
          });

        await expect(
          service.processNext(),
        ).resolves.toEqual({
          processed:
            true,
          action:
            'RECONCILED_FAILED',
          payoutId:
            'payout-1',
        });

        expect(
          markReconciledFailed,
        ).toHaveBeenCalledWith(
          'payout-1',
          {
            providerTransactionId:
              'provider-failed',
            failureCode:
              'NUVEI_RECONCILIATION_DECLINED',
            failureMessage:
              'Provider confirmed payout was declined',
          },
        );

        expect(
          finalizeReconciledSucceeded,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'keeps pending provider state unresolved for a later reconciliation',
      async () => {
        reconcile
          .mockResolvedValue({
            outcome:
              PayoutGatewayOutcome
                .PENDING,
            providerTransactionId:
              'provider-pending',
          });

        await expect(
          service.processNext(),
        ).resolves.toEqual({
          processed:
            true,
          action:
            'RECONCILIATION_PENDING',
          payoutId:
            'payout-1',
        });

        expect(
          finalizeReconciledSucceeded,
        ).not.toHaveBeenCalled();

        expect(
          markReconciledFailed,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'keeps ambiguous provider state unresolved and never performs payout execution',
      async () => {
        reconcile
          .mockResolvedValue({
            outcome:
              PayoutGatewayOutcome
                .AMBIGUOUS,
            failureCode:
              'NUVEI_RECONCILIATION_TIMEOUT',
            failureMessage:
              'Lookup timed out',
          });

        await expect(
          service.processNext(),
        ).resolves.toEqual({
          processed:
            true,
          action:
            'RECONCILIATION_AMBIGUOUS',
          payoutId:
            'payout-1',
        });

        expect(
          reconcile,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          finalizeReconciledSucceeded,
        ).not.toHaveBeenCalled();

        expect(
          markReconciledFailed,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'treats a thrown reconciliation lookup as ambiguous without terminal mutation',
      async () => {
        reconcile
          .mockRejectedValue(
            new Error(
              'network timeout',
            ),
          );

        await expect(
          service.processNext(),
        ).resolves.toEqual({
          processed:
            true,
          action:
            'RECONCILIATION_AMBIGUOUS',
          payoutId:
            'payout-1',
        });

        expect(
          reconcile,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          finalizeReconciledSucceeded,
        ).not.toHaveBeenCalled();

        expect(
          markReconciledFailed,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'fails closed when payout provider gateway is unavailable',
      async () => {
        getGateway
          .mockReturnValue(
            null,
          );

        await expect(
          service.processNext(),
        ).resolves.toEqual({
          processed:
            true,
          action:
            'RECONCILIATION_GATEWAY_MISSING',
          payoutId:
            'payout-1',
        });

        expect(
          reconcile,
        ).not.toHaveBeenCalled();

        expect(
          finalizeReconciledSucceeded,
        ).not.toHaveBeenCalled();

        expect(
          markReconciledFailed,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'reports disabled worker as healthy',
      () => {
        const disabledConfig = {
          get:
            jest.fn()
              .mockReturnValue(
                'false',
              ),
        } as unknown as ConfigService;

        const disabledService =
          new ProductionPayoutReconciliationWorkerService(
            prisma as never,
            disabledConfig,
            orchestrator as never,
            registry as never,
          );

        expect(
          disabledService
            .getOperationalStatus(),
        ).toMatchObject({
          enabled:
            false,
          healthy:
            true,
          inFlight:
            false,
          consecutiveFailures:
            0,
        });
      },
    );
  },
);
