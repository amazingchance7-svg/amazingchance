import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  PrizeEligibilityCheckStatus,
  PrizeEligibilityCheckType,
  PrizeStatus,
} from '@prisma/client';

import { PrizeClaimsService } from '../../src/prize-claims/prize-claims.service';

describe('PrizeClaimsService', () => {
  const tx = {
    prize: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    prizeClaim: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    prizeEligibilityCheck: {
      createMany: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };

  const service = new PrizeClaimsService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('submits an owned CREATED prize claim atomically', async () => {
    tx.prize.findUnique.mockResolvedValue({
      id: 'prize-id',
      userId: 'user-id',
      status: PrizeStatus.CREATED,
      claim: null,
    });
    tx.prizeClaim.create.mockResolvedValue({ id: 'claim-id' });
    tx.prize.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.submit({
      prizeId: 'prize-id',
      userId: 'user-id',
      declaredDateOfBirth: new Date('1990-01-01'),
      declaredCountryCode: 'UA',
    })).resolves.toEqual({ id: 'claim-id' });
  });

  it('rejects claiming another users prize', async () => {
    tx.prize.findUnique.mockResolvedValue({
      id: 'prize-id',
      userId: 'owner-id',
      status: PrizeStatus.CREATED,
      claim: null,
    });

    await expect(service.submit({
      prizeId: 'prize-id',
      userId: 'attacker-id',
      declaredDateOfBirth: new Date('1990-01-01'),
      declaredCountryCode: 'UA',
    })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('approves only when all required checks pass', async () => {
    tx.prizeClaim.findUnique.mockResolvedValue({
      id: 'claim-id',
      prizeId: 'prize-id',
      reviewedAt: null,
      checks: [],
      prize: { status: PrizeStatus.CLAIM_PENDING },
    });
    tx.prizeEligibilityCheck.createMany.mockResolvedValue({ count: 3 });
    tx.prize.updateMany.mockResolvedValue({ count: 1 });
    tx.prizeClaim.update.mockResolvedValue({
      id: 'claim-id',
      prize: { status: PrizeStatus.APPROVED },
      checks: [],
    });

    await expect(service.review({
      claimId: 'claim-id',
      reviewerUserId: 'admin-id',
      checks: [
        PrizeEligibilityCheckType.IDENTITY,
        PrizeEligibilityCheckType.AGE,
        PrizeEligibilityCheckType.JURISDICTION,
      ].map((type) => ({
        type,
        status: PrizeEligibilityCheckStatus.PASSED,
        evidence: { source: 'unit-test' },
      })),
    })).resolves.toMatchObject({
      prize: { status: PrizeStatus.APPROVED },
    });
  });

  it('requires all three eligibility checks', async () => {
    tx.prizeClaim.findUnique.mockResolvedValue({
      id: 'claim-id',
      prizeId: 'prize-id',
      reviewedAt: null,
      checks: [],
      prize: { status: PrizeStatus.CLAIM_PENDING },
    });

    await expect(service.review({
      claimId: 'claim-id',
      reviewerUserId: 'admin-id',
      checks: [{
        type: PrizeEligibilityCheckType.IDENTITY,
        status: PrizeEligibilityCheckStatus.PASSED,
        evidence: {},
      }],
    })).rejects.toBeInstanceOf(ConflictException);
  });
});
