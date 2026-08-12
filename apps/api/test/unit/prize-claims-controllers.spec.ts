import {
  UnauthorizedException,
} from '@nestjs/common';
import {
  PrizeStatus,
} from '@prisma/client';

import {
  AdminPrizeClaimsController,
} from '../../src/prize-claims/admin-prize-claims.controller';
import {
  PrizeClaimsController,
} from '../../src/prize-claims/prize-claims.controller';

describe(
  'Prize claim controllers',
  () => {
    const claims = {
      submit:
        jest.fn(),
      review:
        jest.fn(),
    };

    const audit = {
      recordSafe:
        jest.fn(),
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it(
      'requires an authenticated user for claim submission',
      async () => {
        const controller =
          new PrizeClaimsController(
            claims as never,
            audit as never,
          );

        await expect(
          controller.submit(
            '11111111-1111-4111-8111-111111111111',
            {
              declaredDateOfBirth:
                '1990-01-01',
              declaredCountryCode:
                'UA',
            },
            {
              user:
                undefined,
            } as never,
          ),
        ).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      },
    );

    it(
      'records immutable audit evidence after admin approval',
      async () => {
        claims.review
          .mockResolvedValue({
            id:
              'claim-id',
            prizeId:
              'prize-id',
            reviewedAt:
              new Date(),
            decisionReason:
              'eligible',
            checks: [
              {},
              {},
              {},
            ],
            prize: {
              status:
                PrizeStatus.APPROVED,
            },
          });

        const controller =
          new AdminPrizeClaimsController(
            claims as never,
            audit as never,
          );

        await controller.review(
          '11111111-1111-4111-8111-111111111111',
          {
            checks: [],
          },
          {
            user: {
              id:
                'admin-id',
            },
          } as never,
        );

        expect(
          audit.recordSafe,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            actorId:
              'admin-id',
            entityId:
              'claim-id',
          }),
        );
      },
    );
  },
);
