import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ComplianceOnboardingStatus,
  PlayerProtectionStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type SubmitInput = {
  userId: string;
  dateOfBirth: Date;
  countryCode: string;
  identityProvider: string;
  identityEvidenceRef: string;
  idempotencyKey: string;
};

type ReviewInput = {
  onboardingId: string;
  reviewerUserId: string;
  decision: 'APPROVE' | 'REJECT';
  reason?: string;
};

@Injectable()
export class ComplianceOnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnStatus(userId: string) {
    const [profile, latestOnboarding, latestSelfExclusion] = await Promise.all([
      this.prisma.playerComplianceProfile.findUnique({
        where: { userId },
        select: {
          status: true,
          countryCode: true,
          verifiedAt: true,
          statusReason: true,
        },
      }),
      this.prisma.complianceOnboarding.findFirst({
        where: { userId },
        orderBy: { attemptNumber: 'desc' },
        select: {
          id: true,
          attemptNumber: true,
          countryCode: true,
          identityProvider: true,
          status: true,
          submittedAt: true,
          reviewedAt: true,
          decisionReason: true,
        },
      }),
      this.prisma.selfExclusion.findFirst({
        where: { userId },
        orderBy: { startsAt: 'desc' },
      }),
    ]);

    return { profile, latestOnboarding, latestSelfExclusion };
  }

  async getForAdmin(onboardingId: string) {
    const onboarding = await this.prisma.complianceOnboarding.findUnique({
      where: { id: onboardingId },
      include: { evidence: true },
    });
    if (!onboarding) {
      throw new NotFoundException('Compliance onboarding not found');
    }
    return onboarding;
  }

  submit(input: SubmitInput) {
    const countryCode = input.countryCode.trim().toUpperCase();
    const identityProvider = input.identityProvider.trim();
    const identityEvidenceRef = input.identityEvidenceRef.trim();
    const rawKey = input.idempotencyKey?.trim();

    if (!rawKey) {
      throw new ConflictException('Idempotency-Key is required');
    }
    if (rawKey.length > 160) {
      throw new ConflictException('Idempotency-Key is too long');
    }

    const idempotencyKey = `compliance:${input.userId}:${rawKey}`;

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "id" FROM "users"
          WHERE "id" = ${input.userId}::uuid
          FOR UPDATE
        `;

        const user = await tx.user.findUnique({
          where: { id: input.userId },
          select: { id: true, status: true, emailVerifiedAt: true },
        });
        if (!user) {
          throw new NotFoundException('User not found');
        }
        if (user.status !== UserStatus.ACTIVE || user.emailVerifiedAt === null) {
          throw new ConflictException(
            'Active verified account is required for compliance onboarding',
          );
        }

        const existingByKey = await tx.complianceOnboarding.findUnique({
          where: { idempotencyKey },
        });
        if (existingByKey) {
          const sameDate =
            existingByKey.dateOfBirth.toISOString().slice(0, 10) ===
            input.dateOfBirth.toISOString().slice(0, 10);
          const same =
            existingByKey.userId === input.userId &&
            sameDate &&
            existingByKey.countryCode === countryCode &&
            existingByKey.identityProvider === identityProvider &&
            existingByKey.identityEvidenceRef === identityEvidenceRef;

          if (!same) {
            throw new ConflictException(
              'Idempotency-Key was already used with different compliance data',
            );
          }
          return existingByKey;
        }

        const profile = await tx.playerComplianceProfile.findUnique({
          where: { userId: input.userId },
          select: { id: true },
        });
        if (profile) {
          throw new ConflictException('Verified compliance profile already exists');
        }

        const pending = await tx.complianceOnboarding.findFirst({
          where: {
            userId: input.userId,
            status: ComplianceOnboardingStatus.PENDING_REVIEW,
          },
          select: { id: true },
        });
        if (pending) {
          throw new ConflictException('Compliance onboarding is already pending review');
        }

        const latest = await tx.complianceOnboarding.findFirst({
          where: { userId: input.userId },
          orderBy: { attemptNumber: 'desc' },
          select: { attemptNumber: true },
        });

        return tx.complianceOnboarding.create({
          data: {
            userId: input.userId,
            attemptNumber: (latest?.attemptNumber ?? 0) + 1,
            idempotencyKey,
            dateOfBirth: input.dateOfBirth,
            countryCode,
            identityProvider,
            identityEvidenceRef,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  review(input: ReviewInput) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "id" FROM "compliance_onboardings"
          WHERE "id" = ${input.onboardingId}::uuid
          FOR UPDATE
        `;

        const onboarding = await tx.complianceOnboarding.findUnique({
          where: { id: input.onboardingId },
        });
        if (!onboarding) {
          throw new NotFoundException('Compliance onboarding not found');
        }
        if (onboarding.status !== ComplianceOnboardingStatus.PENDING_REVIEW) {
          return onboarding;
        }

        const reviewer = await tx.user.findUnique({
          where: { id: input.reviewerUserId },
          select: { id: true },
        });
        if (!reviewer) {
          throw new NotFoundException('Reviewer not found');
        }

        const now = new Date();

        if (input.decision === 'REJECT') {
          return tx.complianceOnboarding.update({
            where: { id: onboarding.id },
            data: {
              status: ComplianceOnboardingStatus.REJECTED,
              reviewedAt: now,
              reviewedByUserId: input.reviewerUserId,
              decisionReason: input.reason?.trim() || 'REJECTED_BY_REVIEWER',
            },
          });
        }

        const policies = await tx.jurisdictionPolicy.findMany({
          where: {
            countryCode: onboarding.countryCode,
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          orderBy: { version: 'desc' },
          take: 2,
        });
        if (policies.length !== 1) {
          throw new ConflictException(
            policies.length === 0
              ? 'No effective jurisdiction policy is configured'
              : 'Multiple effective jurisdiction policies are configured',
          );
        }

        const policy = policies[0];
        if (!policy.purchasesAllowed) {
          throw new ConflictException(
            'Purchases are not allowed in the player jurisdiction',
          );
        }
        if (this.ageAt(onboarding.dateOfBirth, now) < policy.minimumAge) {
          throw new ConflictException(
            'Player does not meet the jurisdiction minimum age',
          );
        }

        const existingProfile = await tx.playerComplianceProfile.findUnique({
          where: { userId: onboarding.userId },
          select: { id: true },
        });
        if (existingProfile) {
          throw new ConflictException('Verified compliance profile already exists');
        }

        const latestExclusion = await tx.selfExclusion.findFirst({
          where: { userId: onboarding.userId },
          orderBy: { startsAt: 'desc' },
        });

        await tx.complianceVerificationEvidence.create({
          data: {
            onboardingId: onboarding.id,
            evidenceRef: onboarding.identityEvidenceRef,
            provider: onboarding.identityProvider,
            verifiedByUserId: input.reviewerUserId,
            verifiedAt: now,
          },
        });

        await tx.playerComplianceProfile.create({
          data: {
            userId: onboarding.userId,
            dateOfBirth: onboarding.dateOfBirth,
            countryCode: onboarding.countryCode,
            verifiedAt: now,
            status: latestExclusion
              ? PlayerProtectionStatus.SELF_EXCLUDED
              : PlayerProtectionStatus.ACTIVE,
            statusReason: latestExclusion
              ? 'SELF_EXCLUSION_REVIEW_REQUIRED'
              : 'COMPLIANCE_VERIFIED',
          },
        });

        return tx.complianceOnboarding.update({
          where: { id: onboarding.id },
          data: {
            status: ComplianceOnboardingStatus.APPROVED,
            reviewedAt: now,
            reviewedByUserId: input.reviewerUserId,
            decisionReason: input.reason?.trim() || 'APPROVED_BY_REVIEWER',
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async placeComplianceHold(userId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const profile = await tx.playerComplianceProfile.findUnique({
        where: { userId },
      });
      if (!profile) {
        throw new NotFoundException('Compliance profile not found');
      }
      if (profile.status === PlayerProtectionStatus.COMPLIANCE_HOLD) {
        return profile;
      }
      if (profile.status !== PlayerProtectionStatus.ACTIVE) {
        throw new ConflictException(
          `Cannot place compliance hold while profile status is ${profile.status}`,
        );
      }
      return tx.playerComplianceProfile.update({
        where: { userId },
        data: {
          status: PlayerProtectionStatus.COMPLIANCE_HOLD,
          statusReason: reason.trim(),
        },
      });
    });
  }

  async removeComplianceHold(userId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const profile = await tx.playerComplianceProfile.findUnique({
        where: { userId },
      });
      if (!profile) {
        throw new NotFoundException('Compliance profile not found');
      }
      if (profile.status !== PlayerProtectionStatus.COMPLIANCE_HOLD) {
        throw new ConflictException('Compliance profile is not on hold');
      }
      if (await this.findActiveExclusion(tx, userId, new Date())) {
        throw new ConflictException(
          'Active self-exclusion prevents compliance hold removal',
        );
      }
      return tx.playerComplianceProfile.update({
        where: { userId },
        data: {
          status: PlayerProtectionStatus.ACTIVE,
          statusReason: `COMPLIANCE_HOLD_REMOVED: ${reason.trim()}`,
        },
      });
    });
  }

  async reactivateAfterSelfExclusion(userId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);
      const profile = await tx.playerComplianceProfile.findUnique({
        where: { userId },
      });
      if (!profile) {
        throw new NotFoundException('Compliance profile not found');
      }
      if (profile.status !== PlayerProtectionStatus.SELF_EXCLUDED) {
        throw new ConflictException(
          'Compliance profile is not awaiting self-exclusion reactivation',
        );
      }
      if (await this.findActiveExclusion(tx, userId, new Date())) {
        throw new ConflictException(
          'Active or permanent self-exclusion cannot be reactivated',
        );
      }
      const historical = await tx.selfExclusion.findFirst({
        where: { userId },
        orderBy: { startsAt: 'desc' },
      });
      if (!historical) {
        throw new ConflictException('No self-exclusion history exists');
      }
      return tx.playerComplianceProfile.update({
        where: { userId },
        data: {
          status: PlayerProtectionStatus.ACTIVE,
          statusReason: `SELF_EXCLUSION_REACTIVATED: ${reason.trim()}`,
        },
      });
    });
  }

  private async lockUser(tx: Prisma.TransactionClient, userId: string) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "users"
      WHERE "id" = ${userId}::uuid
      FOR UPDATE
    `;
    if (rows.length !== 1) {
      throw new NotFoundException('User not found');
    }
  }

  private findActiveExclusion(
    tx: Prisma.TransactionClient,
    userId: string,
    at: Date,
  ) {
    return tx.selfExclusion.findFirst({
      where: {
        userId,
        startsAt: { lte: at },
        OR: [{ endsAt: null }, { endsAt: { gt: at } }],
      },
      orderBy: { startsAt: 'desc' },
    });
  }

  private ageAt(dateOfBirth: Date, at: Date): number {
    let age = at.getUTCFullYear() - dateOfBirth.getUTCFullYear();
    const monthDelta = at.getUTCMonth() - dateOfBirth.getUTCMonth();
    if (
      monthDelta < 0 ||
      (monthDelta === 0 && at.getUTCDate() < dateOfBirth.getUTCDate())
    ) {
      age -= 1;
    }
    return age;
  }
}