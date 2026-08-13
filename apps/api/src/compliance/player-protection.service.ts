import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PlayerProtectionStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

type ComplianceClient =
  | PrismaService
  | Prisma.TransactionClient;

export type PurchaseEligibilityResult = {
  userId: string;
  countryCode: string;
  policyVersion: number;
  minimumAge: number;
};

@Injectable()
export class PlayerProtectionService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  assertCanPurchase(
    userId: string,
    at: Date = new Date(),
  ): Promise<PurchaseEligibilityResult> {
    return this.assertCanPurchaseWithClient(
      this.prisma,
      userId,
      at,
    );
  }

  assertCanPurchaseInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    at: Date = new Date(),
  ): Promise<PurchaseEligibilityResult> {
    return this.assertCanPurchaseWithClient(
      tx,
      userId,
      at,
    );
  }

  startSelfExclusion(
    userId: string,
    endsAt?: Date,
    reason?: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "users"
          WHERE "id" = ${userId}::uuid
          FOR UPDATE
        `;

        const user =
          await tx.user.findUnique({
            where: { id: userId },
            select: { id: true },
          });

        if (!user) {
          throw new NotFoundException(
            'User not found',
          );
        }

        const now =
          new Date();

        if (
          endsAt &&
          endsAt <= now
        ) {
          throw new ConflictException(
            'Self-exclusion end must be in the future',
          );
        }

        const existing =
          await tx.selfExclusion.findFirst({
            where: {
              userId,
              startsAt: { lte: now },
              OR: [
                { endsAt: null },
                { endsAt: { gt: now } },
              ],
            },
            orderBy: { startsAt: 'desc' },
          });

        if (existing) {
          return existing;
        }

        const exclusion =
          await tx.selfExclusion.create({
            data: {
              userId,
              startsAt: now,
              endsAt: endsAt ?? null,
              reason:
                reason?.trim() || null,
            },
          });

        await tx.playerComplianceProfile.updateMany({
          where: { userId },
          data: {
            status:
              PlayerProtectionStatus.SELF_EXCLUDED,
            statusReason:
              'SELF_EXCLUSION_ACTIVE',
          },
        });

        return exclusion;
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private async assertCanPurchaseWithClient(
    client: ComplianceClient,
    userId: string,
    at: Date,
  ): Promise<PurchaseEligibilityResult> {
    const profile =
      await client.playerComplianceProfile.findUnique({
        where: { userId },
      });

    if (!profile) {
      throw new ConflictException(
        'Verified compliance profile is required before purchase',
      );
    }

    if (
      profile.status !==
      PlayerProtectionStatus.ACTIVE
    ) {
      throw new ConflictException(
        `Player protection status ${profile.status} blocks purchases`,
      );
    }

    const exclusion =
      await client.selfExclusion.findFirst({
        where: {
          userId,
          startsAt: { lte: at },
          OR: [
            { endsAt: null },
            { endsAt: { gt: at } },
          ],
        },
        orderBy: { startsAt: 'desc' },
      });

    if (exclusion) {
      throw new ConflictException(
        'Active self-exclusion blocks purchases',
      );
    }

    const policies =
      await client.jurisdictionPolicy.findMany({
        where: {
          countryCode:
            profile.countryCode,
          effectiveFrom: { lte: at },
          OR: [
            { effectiveTo: null },
            { effectiveTo: { gt: at } },
          ],
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

    const policy =
      policies[0];

    if (!policy.purchasesAllowed) {
      throw new ConflictException(
        'Purchases are not allowed in the player jurisdiction',
      );
    }

    const age =
      this.ageAt(
        profile.dateOfBirth,
        at,
      );

    if (age < policy.minimumAge) {
      throw new ConflictException(
        'Player does not meet the jurisdiction minimum age',
      );
    }

    return {
      userId,
      countryCode:
        profile.countryCode,
      policyVersion:
        policy.version,
      minimumAge:
        policy.minimumAge,
    };
  }

  private ageAt(
    dateOfBirth: Date,
    at: Date,
  ): number {
    let age =
      at.getUTCFullYear() -
      dateOfBirth.getUTCFullYear();

    const monthDelta =
      at.getUTCMonth() -
      dateOfBirth.getUTCMonth();

    if (
      monthDelta < 0 ||
      (
        monthDelta === 0 &&
        at.getUTCDate() <
          dateOfBirth.getUTCDate()
      )
    ) {
      age -= 1;
    }

    return age;
  }
}
