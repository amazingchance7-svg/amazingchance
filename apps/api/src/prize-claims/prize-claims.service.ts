import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PrizeEligibilityCheckStatus,
  PrizeEligibilityCheckType,
  PrizeStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

const REQUIRED_CHECKS = [
  PrizeEligibilityCheckType.IDENTITY,
  PrizeEligibilityCheckType.AGE,
  PrizeEligibilityCheckType.JURISDICTION,
] as const;

@Injectable()
export class PrizeClaimsService {
  constructor(private readonly prisma: PrismaService) {}

  submit(input: {
    prizeId: string;
    userId: string;
    declaredDateOfBirth: Date;
    declaredCountryCode: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const prize = await tx.prize.findUnique({
        where: { id: input.prizeId },
        include: { claim: true },
      });

      if (!prize) throw new NotFoundException('Prize not found');
      if (prize.userId !== input.userId) {
        throw new ForbiddenException('Prize does not belong to the authenticated user');
      }
      if (prize.claim) return prize.claim;
      if (prize.status !== PrizeStatus.CREATED) {
        throw new ConflictException(`Prize in ${prize.status} cannot be claimed`);
      }

      const countryCode = input.declaredCountryCode.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(countryCode)) {
        throw new ConflictException('Declared country code must be a two-letter uppercase code');
      }
      if (
        Number.isNaN(input.declaredDateOfBirth.getTime()) ||
        input.declaredDateOfBirth >= new Date()
      ) {
        throw new ConflictException('Declared date of birth is invalid');
      }

      const claim = await tx.prizeClaim.create({
        data: {
          prizeId: prize.id,
          userId: input.userId,
          declaredDateOfBirth: input.declaredDateOfBirth,
          declaredCountryCode: countryCode,
        },
      });

      const updated = await tx.prize.updateMany({
        where: { id: prize.id, status: PrizeStatus.CREATED },
        data: { status: PrizeStatus.CLAIM_PENDING },
      });

      if (updated.count !== 1) {
        throw new ConflictException('Prize state changed while claim was being submitted');
      }

      return claim;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }

  review(input: {
    claimId: string;
    reviewerUserId: string;
    checks: Array<{
      type: PrizeEligibilityCheckType;
      status: PrizeEligibilityCheckStatus;
      evidence: Prisma.InputJsonValue;
    }>;
    decisionReason?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.prizeClaim.findUnique({
        where: { id: input.claimId },
        include: { prize: true, checks: true },
      });

      if (!claim) throw new NotFoundException('Prize claim not found');
      if (claim.reviewedAt) return claim;
      if (claim.prize.status !== PrizeStatus.CLAIM_PENDING) {
        throw new ConflictException(`Prize in ${claim.prize.status} cannot be reviewed`);
      }
      if (claim.checks.length > 0) {
        throw new ConflictException('Prize claim already contains eligibility checks');
      }

      const types = input.checks.map((check) => check.type);
      if (
        input.checks.length !== REQUIRED_CHECKS.length ||
        new Set(types).size !== REQUIRED_CHECKS.length ||
        !REQUIRED_CHECKS.every((required) => types.includes(required))
      ) {
        throw new ConflictException(
          'Identity, age, and jurisdiction eligibility checks are all required',
        );
      }

      await tx.prizeEligibilityCheck.createMany({
        data: input.checks.map((check) => ({
          claimId: claim.id,
          type: check.type,
          status: check.status,
          evidence: check.evidence,
          checkedByUserId: input.reviewerUserId,
        })),
      });

      const approved = input.checks.every(
        (check) => check.status === PrizeEligibilityCheckStatus.PASSED,
      );
      const reviewedAt = new Date();
      const nextStatus = approved ? PrizeStatus.APPROVED : PrizeStatus.WITHHELD;

      const updated = await tx.prize.updateMany({
        where: { id: claim.prizeId, status: PrizeStatus.CLAIM_PENDING },
        data: {
          status: nextStatus,
          approvedAt: approved ? reviewedAt : null,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException('Prize state changed while claim was being reviewed');
      }

      return tx.prizeClaim.update({
        where: { id: claim.id },
        data: {
          reviewedAt,
          reviewedByUserId: input.reviewerUserId,
          decisionReason: input.decisionReason ?? null,
        },
        include: { prize: true, checks: true },
      });
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
}
