import {
  ConflictException,
} from '@nestjs/common';
import {
  DrawType,
  LedgerAccountCode,
} from '@prisma/client';

import {
  PrizePoolService,
} from '../../src/prizes/prize-pool.service';

describe(
  'PrizePoolService',
  () => {
    const queryRaw =
      jest.fn();

    const prisma = {
      $queryRaw:
        queryRaw,
    };

    const service =
      new PrizePoolService(
        prisma as never,
      );

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it(
      'resolves a positive weekly ledger-backed pool',
      async () => {
        queryRaw.mockResolvedValue([
          {
            amountMinor:
              7000n,
          },
        ]);

        await expect(
          service.resolve({
            drawId:
              'draw-id',
            drawType:
              DrawType.WEEKLY,
            participationYear:
              null,
            currency:
              'USD',
          }),
        ).resolves.toEqual({
          amountMinor:
            7000n,
          sourceAccountCode:
            LedgerAccountCode
              .WEEKLY_JACKPOT,
        });
      },
    );

    it(
      'requires participation year for annual pool attribution',
      async () => {
        await expect(
          service.resolve({
            drawId:
              'draw-id',
            drawType:
              DrawType.ANNUAL,
            participationYear:
              null,
            currency:
              'USD',
          }),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );
      },
    );

    it(
      'rejects an empty prize pool',
      async () => {
        queryRaw.mockResolvedValue([
          {
            amountMinor:
              0n,
          },
        ]);

        await expect(
          service.resolve({
            drawId:
              'draw-id',
            drawType:
              DrawType.WEEKLY,
            participationYear:
              null,
            currency:
              'USD',
          }),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );
      },
    );
  },
);
