import {
  AdminOperationsController,
} from '../../src/admin-operations/admin-operations.controller';
import {
  Permissions,
} from '../../src/authorization/permissions.constants';
import {
  REQUIRED_PERMISSIONS_KEY,
} from '../../src/authorization/authorization.constants';
import {
  NotificationOutboxService,
} from '../../src/notifications/notification-outbox.service';
import {
  ProductionDrawSchedulerService,
} from '../../src/workers/production-draw-scheduler.service';
import {
  ProductionPayoutReconciliationWorkerService,
} from '../../src/workers/production-payout-reconciliation-worker.service';
import {
  ProductionPayoutWorkerService,
} from '../../src/workers/production-payout-worker.service';

describe(
  'Admin operations notification observability',
  () => {
    it(
      'returns worker and queue operational status only',
      async () => {
        const snapshot = {
          worker: {
            enabled:
              true,
            healthy:
              true,
            inFlight:
              false,
            lastStartedAt:
              new Date(
                '2026-08-13T10:00:00.000Z',
              ),
            lastCompletedAt:
              new Date(
                '2026-08-13T10:00:01.000Z',
              ),
            consecutiveFailures:
              0,
          },
          queue: {
            pending:
              2,
            processing:
              1,
            failed:
              3,
            deadLetter:
              1,
            oldestReadyAt:
              new Date(
                '2026-08-13T09:00:00.000Z',
              ),
          },
        };

        const notificationOutbox = {
          getOperationalSnapshot:
            jest
              .fn()
              .mockResolvedValue(
                snapshot,
              ),
        } as unknown as NotificationOutboxService;

        const drawScheduler = {
          getOperationalStatus:
            jest.fn().mockReturnValue({
              enabled:
                true,
              healthy:
                true,
              inFlight:
                false,
              lastStartedAt:
                null,
              lastCompletedAt:
                null,
              consecutiveFailures:
                0,
              lastAction:
                'IDLE',
            }),
        } as unknown as ProductionDrawSchedulerService;

        const payoutWorker = {
          getOperationalStatus:
            jest.fn().mockReturnValue({
              enabled:
                true,
              healthy:
                true,
              inFlight:
                false,
              lastStartedAt:
                null,
              lastCompletedAt:
                null,
              consecutiveFailures:
                0,
              lastAction:
                'IDLE',
            }),
        } as unknown as ProductionPayoutWorkerService;

        const payoutReconciliationWorker = {
          getOperationalStatus:
            jest.fn().mockReturnValue({
              enabled:
                true,
              healthy:
                true,
              inFlight:
                false,
              lastStartedAt:
                null,
              lastCompletedAt:
                null,
              consecutiveFailures:
                0,
              lastAction:
                'IDLE',
            }),
        } as unknown as ProductionPayoutReconciliationWorkerService;

        const controller =
          new AdminOperationsController(
            {} as never,
            {} as never,
            {} as never,
            notificationOutbox,
            drawScheduler,
            payoutWorker,
            payoutReconciliationWorker,
          );

        await expect(
          controller
            .notificationWorkerStatus(),
        ).resolves.toEqual(
          snapshot,
        );

        expect(
          notificationOutbox
            .getOperationalSnapshot,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      'requires dedicated operations read permission',
      () => {
        const permissions =
          Reflect.getMetadata(
            REQUIRED_PERMISSIONS_KEY,
            AdminOperationsController
              .prototype
              .notificationWorkerStatus,
          );

        expect(
          permissions,
        ).toEqual([
          Permissions
            .OPERATIONS_READ_ADMIN,
        ]);
      },
    );

    it(
      'returns payout worker operational status',
      () => {
        const payoutStatus = {
          enabled:
            true,
          healthy:
            true,
          inFlight:
            false,
          lastStartedAt:
            null,
          lastCompletedAt:
            null,
          consecutiveFailures:
            0,
          lastAction:
            'IDLE',
        };

        const payoutWorker = {
          getOperationalStatus:
            jest
              .fn()
              .mockReturnValue(
                payoutStatus,
              ),
        } as unknown as ProductionPayoutWorkerService;

        const controller =
          new AdminOperationsController(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            payoutWorker,
            {} as never,
          );

        expect(
          controller
            .payoutWorkerStatus(),
        ).toEqual(
          payoutStatus,
        );
      },
    );

    it(
      'protects payout worker status with operations read permission',
      () => {
        const permissions =
          Reflect.getMetadata(
            REQUIRED_PERMISSIONS_KEY,
            AdminOperationsController
              .prototype
              .payoutWorkerStatus,
          );

        expect(
          permissions,
        ).toEqual([
          Permissions
            .OPERATIONS_READ_ADMIN,
        ]);
      },
    );

    it(
      'returns payout reconciliation worker operational status',
      () => {
        const reconciliationStatus = {
          enabled:
            true,
          healthy:
            true,
          inFlight:
            false,
          lastStartedAt:
            new Date(
              '2026-08-14T14:00:00.000Z',
            ),
          lastCompletedAt:
            new Date(
              '2026-08-14T14:00:01.000Z',
            ),
          consecutiveFailures:
            0,
          lastAction:
            'RECONCILIATION_AMBIGUOUS',
        };

        const payoutReconciliationWorker = {
          getOperationalStatus:
            jest
              .fn()
              .mockReturnValue(
                reconciliationStatus,
              ),
        } as unknown as ProductionPayoutReconciliationWorkerService;

        const controller =
          new AdminOperationsController(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            payoutReconciliationWorker,
          );

        expect(
          controller
            .payoutReconciliationWorkerStatus(),
        ).toEqual(
          reconciliationStatus,
        );

        expect(
          payoutReconciliationWorker
            .getOperationalStatus,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      'protects payout reconciliation worker status with operations read permission',
      () => {
        const permissions =
          Reflect.getMetadata(
            REQUIRED_PERMISSIONS_KEY,
            AdminOperationsController
              .prototype
              .payoutReconciliationWorkerStatus,
          );

        expect(
          permissions,
        ).toEqual([
          Permissions
            .OPERATIONS_READ_ADMIN,
        ]);
      },
    );
  },
);
