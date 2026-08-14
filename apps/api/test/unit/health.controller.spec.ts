import {
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  HealthController,
} from '../../src/health/health.controller';
import {
  ProductionPayoutReconciliationWorkerService,
} from '../../src/workers/production-payout-reconciliation-worker.service';
import {
  ProductionDrawSchedulerService,
} from '../../src/workers/production-draw-scheduler.service';
import {
  ProductionPayoutWorkerService,
} from '../../src/workers/production-payout-worker.service';
import {
  NotificationOutboxService,
} from '../../src/notifications/notification-outbox.service';
import {
  PrismaService,
} from '../../src/prisma/prisma.service';

describe(
  'HealthController production readiness',
  () => {
    function createHarness(
      queryRaw:
        jest.Mock,
    ) {
      const prisma = {
        $queryRaw:
          queryRaw,
      } as unknown as PrismaService;

      const notificationOutbox = {
        getOperationalStatus:
          jest.fn().mockReturnValue({
            enabled:
              false,
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
          }),
      } as unknown as NotificationOutboxService;

      const drawScheduler = {
        getOperationalStatus:
          jest.fn().mockReturnValue({
            enabled:
              false,
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
              null,
          }),
      } as unknown as ProductionDrawSchedulerService;

      const payoutWorker = {
        getOperationalStatus:
          jest.fn().mockReturnValue({
            enabled:
              false,
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
              null,
          }),
      } as unknown as ProductionPayoutWorkerService;

      const payoutReconciliationWorker = {
        getOperationalStatus:
          jest.fn().mockReturnValue({
            enabled:
              false,
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
              null,
          }),
      } as unknown as ProductionPayoutReconciliationWorkerService;

      return {
        controller:
          new HealthController(
            prisma,
            notificationOutbox,
            drawScheduler,
            payoutWorker,
            payoutReconciliationWorker,
          ),
        queryRaw,
        notificationOutbox,
        payoutWorker,
        payoutReconciliationWorker,
      };
    }

    it(
      'reports liveness without touching the database',
      () => {
        const queryRaw =
          jest.fn();

        const {
          controller,
        } =
          createHarness(
            queryRaw,
          );

        expect(
          controller
            .getLiveness(),
        ).toEqual({
          status: 'ok',
        });

        expect(
          queryRaw,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'reports readiness only after a successful database probe',
      async () => {
        const queryRaw =
          jest
            .fn()
            .mockResolvedValue([
              {
                '?column?': 1,
              },
            ]);

        const {
          controller,
        } =
          createHarness(
            queryRaw,
          );

        await expect(
          controller
            .getReadiness(),
        ).resolves.toEqual({
          status: 'ok',
        });

        expect(
          queryRaw,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      'fails closed with 503 when the database is unavailable',
      async () => {
        const queryRaw =
          jest
            .fn()
            .mockRejectedValue(
              new Error(
                'postgres connection refused with sensitive host details',
              ),
            );

        const {
          controller,
        } =
          createHarness(
            queryRaw,
          );

        await expect(
          controller
            .getReadiness(),
        ).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );

        await expect(
          controller
            .getReadiness(),
        ).rejects.toThrow(
          'Service is not ready',
        );
      },
    );

    it(
      'fails readiness when the production notification worker is unhealthy',
      async () => {
        const queryRaw =
          jest
            .fn()
            .mockResolvedValue([
              {
                '?column?': 1,
              },
            ]);

        const harness =
          createHarness(
            queryRaw,
          );

        jest
          .spyOn(
            harness.notificationOutbox,
            'getOperationalStatus',
          )
          .mockReturnValue({
            enabled:
              true,
            healthy:
              false,
            inFlight:
              false,
            lastStartedAt:
              new Date(),
            lastCompletedAt:
              new Date(),
            consecutiveFailures:
              3,
          });

        await expect(
          harness.controller
            .getReadiness(),
        ).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
      },
    );

    it(
      'fails readiness when the production payout worker is unhealthy',
      async () => {
        const queryRaw =
          jest
            .fn()
            .mockResolvedValue([
              {
                '?column?': 1,
              },
            ]);

        const harness =
          createHarness(
            queryRaw,
          );

        jest
          .spyOn(
            harness.payoutWorker,
            'getOperationalStatus',
          )
          .mockReturnValue({
            enabled:
              true,
            healthy:
              false,
            inFlight:
              false,
            lastStartedAt:
              new Date(),
            lastCompletedAt:
              new Date(),
            consecutiveFailures:
              3,
            lastAction:
              null,
          });

        await expect(
          harness.controller
            .getReadiness(),
        ).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
      },
    );

    it(
      'fails readiness when payout reconciliation is unhealthy',
      async () => {
        const queryRaw =
          jest
            .fn()
            .mockResolvedValue([
              {
                '?column?': 1,
              },
            ]);

        const harness =
          createHarness(
            queryRaw,
          );

        jest
          .spyOn(
            harness.payoutReconciliationWorker,
            'getOperationalStatus',
          )
          .mockReturnValue({
            enabled:
              true,
            healthy:
              false,
            inFlight:
              false,
            lastStartedAt:
              new Date(),
            lastCompletedAt:
              new Date(),
            consecutiveFailures:
              3,
            lastAction:
              null,
          });

        await expect(
          harness.controller
            .getReadiness(),
        ).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
      },
    );

    it(
      'keeps the legacy health route aligned with readiness',
      async () => {
        const queryRaw =
          jest
            .fn()
            .mockResolvedValue([
              {
                '?column?': 1,
              },
            ]);

        const {
          controller,
        } =
          createHarness(
            queryRaw,
          );

        await expect(
          controller
            .getHealth(),
        ).resolves.toEqual({
          status: 'ok',
        });
      },
    );
  },
);
