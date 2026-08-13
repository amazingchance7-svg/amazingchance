import {
  ConflictException,
} from '@nestjs/common';
import {
  PlayerProtectionStatus,
} from '@prisma/client';

import {
  PlayerProtectionService,
} from '../../src/compliance/player-protection.service';

describe(
  'PlayerProtectionService',
  () => {
    const profileFindUnique =
      jest.fn();
    const exclusionFindFirst =
      jest.fn();
    const policyFindMany =
      jest.fn();

    const prisma = {
      playerComplianceProfile: {
        findUnique:
          profileFindUnique,
      },
      selfExclusion: {
        findFirst:
          exclusionFindFirst,
      },
      jurisdictionPolicy: {
        findMany:
          policyFindMany,
      },
    };

    const service =
      new PlayerProtectionService(
        prisma as never,
      );

    beforeEach(() => {
      jest.clearAllMocks();

      profileFindUnique.mockResolvedValue({
        userId: 'user-id',
        dateOfBirth:
          new Date(
            '1990-01-01T00:00:00.000Z',
          ),
        countryCode: 'UA',
        status:
          PlayerProtectionStatus.ACTIVE,
      });

      exclusionFindFirst.mockResolvedValue(
        null,
      );

      policyFindMany.mockResolvedValue([
        {
          version: 1,
          countryCode: 'UA',
          minimumAge: 18,
          purchasesAllowed: true,
        },
      ]);
    });

    it(
      'allows an active adult under exactly one effective policy',
      async () => {
        await expect(
          service.assertCanPurchase(
            'user-id',
            new Date(
              '2026-08-13T00:00:00.000Z',
            ),
          ),
        ).resolves.toEqual({
          userId: 'user-id',
          countryCode: 'UA',
          policyVersion: 1,
          minimumAge: 18,
        });
      },
    );

    it(
      'fails closed when compliance profile is missing',
      async () => {
        profileFindUnique.mockResolvedValue(
          null,
        );

        await expect(
          service.assertCanPurchase(
            'user-id',
          ),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );
      },
    );

    it(
      'blocks active self-exclusion',
      async () => {
        exclusionFindFirst.mockResolvedValue({
          id: 'exclusion-id',
        });

        await expect(
          service.assertCanPurchase(
            'user-id',
          ),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );
      },
    );

    it(
      'blocks a non-active protection status',
      async () => {
        profileFindUnique.mockResolvedValue({
          userId: 'user-id',
          dateOfBirth:
            new Date(
              '1990-01-01T00:00:00.000Z',
            ),
          countryCode: 'UA',
          status:
            PlayerProtectionStatus
              .COMPLIANCE_HOLD,
        });

        await expect(
          service.assertCanPurchase(
            'user-id',
          ),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );
      },
    );

    it(
      'blocks an underage player according to jurisdiction policy',
      async () => {
        profileFindUnique.mockResolvedValue({
          userId: 'user-id',
          dateOfBirth:
            new Date(
              '2010-01-01T00:00:00.000Z',
            ),
          countryCode: 'UA',
          status:
            PlayerProtectionStatus.ACTIVE,
        });

        await expect(
          service.assertCanPurchase(
            'user-id',
            new Date(
              '2026-08-13T00:00:00.000Z',
            ),
          ),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );
      },
    );

    it(
      'fails closed for overlapping effective policies',
      async () => {
        policyFindMany.mockResolvedValue([
          {
            version: 2,
            countryCode: 'UA',
            minimumAge: 18,
            purchasesAllowed: true,
          },
          {
            version: 1,
            countryCode: 'UA',
            minimumAge: 18,
            purchasesAllowed: true,
          },
        ]);

        await expect(
          service.assertCanPurchase(
            'user-id',
          ),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );
      },
    );
  },
);
