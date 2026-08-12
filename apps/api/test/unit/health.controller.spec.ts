import {
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  HealthController,
} from '../../src/health/health.controller';
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

      return {
        controller:
          new HealthController(
            prisma,
          ),
        queryRaw,
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
