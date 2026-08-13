import {
  ConflictException,
} from '@nestjs/common';
import {
  DrawStatus,
  DrawType,
  PlayerProtectionStatus,
  UserStatus,
} from '@prisma/client';
import {
  randomUUID,
} from 'node:crypto';

import {
  PlayerProtectionService,
} from '../../src/compliance/player-protection.service';
import {
  PrismaService,
} from '../../src/prisma/prisma.service';
import {
  PurchasesService,
} from '../../src/purchases/purchases.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe(
  'Compliance player protection integration',
  () => {
    let prisma:
      PrismaService;
    let protection:
      PlayerProtectionService;
    let purchases:
      PurchasesService;

    beforeAll(async () => {
      prisma =
        await createTestPrisma();

      protection =
        new PlayerProtectionService(
          prisma,
        );

      purchases =
        new PurchasesService(
          prisma,
          protection,
        );
    });

    beforeEach(async () => {
      await cleanTestDatabase(
        prisma,
      );
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    async function createEligibleScenario(
      input?: {
        dateOfBirth?:
          Date;
        countryCode?:
          string;
        status?:
          PlayerProtectionStatus;
        purchasesAllowed?:
          boolean;
        minimumAge?:
          number;
      },
    ) {
      const countryCode =
        input?.countryCode ??
        'UA';

      const user =
        await prisma.user.create({
          data: {
            email:
              `${randomUUID()}@example.com`,
            passwordHash:
              'hash',
            status:
              UserStatus.ACTIVE,
            emailVerifiedAt:
              new Date(),
          },
        });

      await prisma
        .playerComplianceProfile
        .create({
          data: {
            userId:
              user.id,
            dateOfBirth:
              input?.dateOfBirth ??
              new Date(
                '1990-01-01T00:00:00.000Z',
              ),
            countryCode,
            status:
              input?.status ??
              PlayerProtectionStatus
                .ACTIVE,
            verifiedAt:
              new Date(),
          },
        });

      await prisma
        .jurisdictionPolicy
        .create({
          data: {
            version:
              Math.floor(
                Math.random() *
                  1_000_000,
              ),
            countryCode,
            minimumAge:
              input?.minimumAge ??
              18,
            purchasesAllowed:
              input?.purchasesAllowed ??
              true,
            effectiveFrom:
              new Date(
                Date.now() -
                  60_000,
              ),
          },
        });

      const draw =
        await prisma.lotteryDraw.create({
          data: {
            publicId:
              `W-${randomUUID()}`,
            type:
              DrawType.WEEKLY,
            status:
              DrawStatus.SALES_OPEN,
            sequenceNumber:
              Math.floor(
                Math.random() *
                  1_000_000,
              ),
            salesOpenAt:
              new Date(
                Date.now() -
                  60_000,
              ),
            salesCloseAt:
              new Date(
                Date.now() +
                  3_600_000,
              ),
            scheduledDrawAt:
              new Date(
                Date.now() +
                  86_400_000,
              ),
            currency:
              'USD',
            ticketPriceMinor:
              100n,
          },
        });

      return {
        user,
        draw,
      };
    }

    it(
      'allows purchase creation for an active adult under one effective policy',
      async () => {
        const scenario =
          await createEligibleScenario();

        const purchase =
          await purchases.create(
            scenario.user.id,
            {
              drawId:
                scenario.draw.id,
              requestedTicketCount:
                2,
            },
            randomUUID(),
          );

        expect(
          purchase.userId,
        ).toBe(
          scenario.user.id,
        );

        expect(
          purchase.totalAmountMinor,
        ).toBe('200');
      },
    );

    it(
      'blocks purchase creation when a compliance profile is missing',
      async () => {
        const user =
          await prisma.user.create({
            data: {
              email:
                `${randomUUID()}@example.com`,
              passwordHash:
                'hash',
              status:
                UserStatus.ACTIVE,
              emailVerifiedAt:
                new Date(),
            },
          });

        const draw =
          await prisma.lotteryDraw.create({
            data: {
              publicId:
                `W-${randomUUID()}`,
              type:
                DrawType.WEEKLY,
              status:
                DrawStatus.SALES_OPEN,
              sequenceNumber:
                Math.floor(
                  Math.random() *
                    1_000_000,
                ),
              salesOpenAt:
                new Date(
                  Date.now() -
                    60_000,
                ),
              salesCloseAt:
                new Date(
                  Date.now() +
                    3_600_000,
                ),
              scheduledDrawAt:
                new Date(
                  Date.now() +
                    86_400_000,
                ),
              currency:
                'USD',
              ticketPriceMinor:
                100n,
            },
          });

        await expect(
          purchases.create(
            user.id,
            {
              drawId:
                draw.id,
              requestedTicketCount:
                1,
            },
            randomUUID(),
          ),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );

        expect(
          await prisma.purchase.count(),
        ).toBe(0);
      },
    );

    it(
      'blocks underage and jurisdiction-disallowed players',
      async () => {
        const underage =
          await createEligibleScenario({
            dateOfBirth:
              new Date(
                '2015-01-01T00:00:00.000Z',
              ),
            minimumAge:
              18,
          });

        await expect(
          purchases.create(
            underage.user.id,
            {
              drawId:
                underage.draw.id,
              requestedTicketCount:
                1,
            },
            randomUUID(),
          ),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );

        await cleanTestDatabase(
          prisma,
        );

        const blocked =
          await createEligibleScenario({
            purchasesAllowed:
              false,
          });

        await expect(
          purchases.create(
            blocked.user.id,
            {
              drawId:
                blocked.draw.id,
              requestedTicketCount:
                1,
            },
            randomUUID(),
          ),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );

        expect(
          await prisma.purchase.count(),
        ).toBe(0);
      },
    );

    it(
      'blocks compliance hold and active self-exclusion',
      async () => {
        const held =
          await createEligibleScenario({
            status:
              PlayerProtectionStatus
                .COMPLIANCE_HOLD,
          });

        await expect(
          purchases.create(
            held.user.id,
            {
              drawId:
                held.draw.id,
              requestedTicketCount:
                1,
            },
            randomUUID(),
          ),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );

        await cleanTestDatabase(
          prisma,
        );

        const excluded =
          await createEligibleScenario();

        await protection
          .startSelfExclusion(
            excluded.user.id,
            new Date(
              Date.now() +
                86_400_000,
            ),
            'integration-test',
          );

        await expect(
          purchases.create(
            excluded.user.id,
            {
              drawId:
                excluded.draw.id,
              requestedTicketCount:
                1,
            },
            randomUUID(),
          ),
        ).rejects.toBeInstanceOf(
          ConflictException,
        );

        const profile =
          await prisma
            .playerComplianceProfile
            .findUniqueOrThrow({
              where: {
                userId:
                  excluded.user.id,
              },
            });

        expect(
          profile.status,
        ).toBe(
          PlayerProtectionStatus
            .SELF_EXCLUDED,
        );
      },
    );

    it(
      'keeps jurisdiction policy and self-exclusion records immutable',
      async () => {
        const scenario =
          await createEligibleScenario();

        const policy =
          await prisma
            .jurisdictionPolicy
            .findFirstOrThrow();

        await expect(
          prisma.jurisdictionPolicy
            .update({
              where: {
                id:
                  policy.id,
              },
              data: {
                minimumAge:
                  21,
              },
            }),
        ).rejects.toThrow();

        const exclusion =
          await protection
            .startSelfExclusion(
              scenario.user.id,
              new Date(
                Date.now() +
                  86_400_000,
              ),
            );

        await expect(
          prisma.selfExclusion
            .update({
              where: {
                id:
                  exclusion.id,
              },
              data: {
                reason:
                  'mutated',
              },
            }),
        ).rejects.toThrow();

        await expect(
          prisma.selfExclusion
            .delete({
              where: {
                id:
                  exclusion.id,
              },
            }),
        ).rejects.toThrow();
      },
    );

    it(
      'keeps verified compliance identity immutable',
      async () => {
        const scenario =
          await createEligibleScenario();

        const profile =
          await prisma
            .playerComplianceProfile
            .findUniqueOrThrow({
              where: {
                userId:
                  scenario.user.id,
              },
            });

        await expect(
          prisma.playerComplianceProfile
            .update({
              where: {
                id:
                  profile.id,
              },
              data: {
                countryCode:
                  'GB',
              },
            }),
        ).rejects.toThrow();

        await expect(
          prisma.playerComplianceProfile
            .delete({
              where: {
                id:
                  profile.id,
              },
            }),
        ).rejects.toThrow();
      },
    );
  },
);
