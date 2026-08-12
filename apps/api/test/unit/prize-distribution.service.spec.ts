import {
  ConflictException,
} from '@nestjs/common';
import {
  DrawType,
} from '@prisma/client';

import {
  PrizeDistributionService,
} from '../../src/prizes/prize-distribution.service';

describe(
  'PrizeDistributionService',
  () => {
    const findMany =
      jest.fn();

    const prisma = {
      prizeDistributionRule: {
        findMany,
      },
    };

    const service =
      new PrizeDistributionService(
        prisma as never,
      );

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it(
      'resolves a complete effective rule',
      async () => {
        findMany.mockResolvedValue([
          {
            id:
              'rule-id',
            version:
              1,
            drawType:
              DrawType.WEEKLY,
            entries: [
              {
                rank:
                  1,
                shareBps:
                  5000,
              },
              {
                rank:
                  2,
                shareBps:
                  3000,
              },
              {
                rank:
                  3,
                shareBps:
                  2000,
              },
            ],
          },
        ]);

        await expect(
          service.resolve(
            DrawType.WEEKLY,
            new Date(
              '2026-08-12T00:00:00.000Z',
            ),
            3,
          ),
        ).resolves.toMatchObject({
          id:
            'rule-id',
          version:
            1,
          entries: [
            {
              rank:
                1,
              shareBps:
                5000,
            },
            {
              rank:
                2,
              shareBps:
                3000,
            },
            {
              rank:
                3,
              shareBps:
                2000,
            },
          ],
        });
      },
    );

    it(
      'rejects a rule that does not total 10000 basis points',
      async () => {
        findMany.mockResolvedValue([
          {
            id:
              'rule-id',
            version:
              1,
            drawType:
              DrawType.WEEKLY,
            entries: [
              {
                rank:
                  1,
                shareBps:
                  5000,
              },
              {
                rank:
                  2,
                shareBps:
                  3000,
              },
              {
                rank:
                  3,
                shareBps:
                  1000,
              },
            ],
          },
        ]);

        await expect(
          service.resolve(
            DrawType.WEEKLY,
            new Date(),
            3,
          ),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );
      },
    );

    it(
      'calculates exact prize amounts and assigns integer remainder to rank one',
      () => {
        const result =
          service.calculate(
            101n,
            {
              id:
                'rule-id',
              version:
                1,
              drawType:
                DrawType.WEEKLY,
              effectiveAt:
                new Date(),
              entries: [
                {
                  rank:
                    1,
                  shareBps:
                    5000,
                },
                {
                  rank:
                    2,
                  shareBps:
                    3000,
                },
                {
                  rank:
                    3,
                  shareBps:
                    2000,
                },
              ],
            },
          );

        expect(result).toEqual([
          {
            rank:
              1,
            shareBps:
              5000,
            amountMinor:
              51n,
          },
          {
            rank:
              2,
            shareBps:
              3000,
            amountMinor:
              30n,
          },
          {
            rank:
              3,
            shareBps:
              2000,
            amountMinor:
              20n,
          },
        ]);
      },
    );
  },
);
