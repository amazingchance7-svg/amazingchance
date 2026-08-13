import { ConflictException } from '@nestjs/common';
import {
  ComplianceOnboardingStatus,
  PlayerProtectionStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { ComplianceOnboardingService } from '../../src/compliance/compliance-onboarding.service';
import { PlayerProtectionService } from '../../src/compliance/player-protection.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('Compliance onboarding lifecycle integration', () => {
  let prisma: PrismaService;
  let onboarding: ComplianceOnboardingService;
  let protection: PlayerProtectionService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    onboarding = new ComplianceOnboardingService(prisma);
    protection = new PlayerProtectionService(prisma);
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUser(prefix: string) {
    return prisma.user.create({
      data: {
        email: `${prefix}-${randomUUID()}@example.com`,
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });
  }

  async function createPolicy(
    minimumAge = 18,
    purchasesAllowed = true,
  ) {
    return prisma.jurisdictionPolicy.create({
      data: {
        version: Math.floor(Math.random() * 1_000_000),
        countryCode: 'UA',
        minimumAge,
        purchasesAllowed,
        effectiveFrom: new Date(Date.now() - 60_000),
      },
    });
  }

  async function submit(
    userId: string,
    dateOfBirth = new Date('1990-01-01T00:00:00.000Z'),
    key = randomUUID(),
  ) {
    return onboarding.submit({
      userId,
      dateOfBirth,
      countryCode: 'UA',
      identityProvider: 'TEST_PROVIDER',
      identityEvidenceRef: `ref-${randomUUID()}`,
      idempotencyKey: key,
    });
  }

  it('approves eligible onboarding and creates ACTIVE profile plus immutable evidence', async () => {
    await createPolicy();
    const user = await createUser('approve');
    const reviewer = await createUser('reviewer');
    const pending = await submit(user.id);

    const approved = await onboarding.review({
      onboardingId: pending.id,
      reviewerUserId: reviewer.id,
      decision: 'APPROVE',
    });

    expect(approved.status).toBe(ComplianceOnboardingStatus.APPROVED);

    const profile = await prisma.playerComplianceProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(profile.status).toBe(PlayerProtectionStatus.ACTIVE);

    const evidence =
      await prisma.complianceVerificationEvidence.findUniqueOrThrow({
        where: { onboardingId: pending.id },
      });

    await expect(
      prisma.complianceVerificationEvidence.update({
        where: { id: evidence.id },
        data: { evidenceRef: 'changed' },
      }),
    ).rejects.toThrow();
  });

  it('rejects underage approval atomically', async () => {
    await createPolicy(18);
    const user = await createUser('underage');
    const reviewer = await createUser('reviewer');
    const pending = await submit(
      user.id,
      new Date('2015-01-01T00:00:00.000Z'),
    );

    await expect(
      onboarding.review({
        onboardingId: pending.id,
        reviewerUserId: reviewer.id,
        decision: 'APPROVE',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(await prisma.playerComplianceProfile.count()).toBe(0);
    expect(await prisma.complianceVerificationEvidence.count()).toBe(0);
  });

  it('keeps expired exclusion blocked until explicit privileged reactivation', async () => {
    await createPolicy();
    const user = await createUser('expired');
    const reviewer = await createUser('reviewer');
    const pending = await submit(user.id);

    await onboarding.review({
      onboardingId: pending.id,
      reviewerUserId: reviewer.id,
      decision: 'APPROVE',
    });

    await prisma.$executeRaw`
      INSERT INTO "self_exclusions"
        ("userId","startsAt","endsAt","reason")
      VALUES (
        ${user.id}::uuid,
        NOW() - INTERVAL '2 days',
        NOW() - INTERVAL '1 day',
        'expired-test'
      )
    `;

    await prisma.playerComplianceProfile.update({
      where: { userId: user.id },
      data: {
        status: PlayerProtectionStatus.SELF_EXCLUDED,
        statusReason: 'SELF_EXCLUSION_REVIEW_REQUIRED',
      },
    });

    await expect(
      protection.assertCanPurchase(user.id),
    ).rejects.toBeInstanceOf(ConflictException);

    await onboarding.reactivateAfterSelfExclusion(
      user.id,
      'manual review complete',
    );

    await expect(
      protection.assertCanPurchase(user.id),
    ).resolves.toMatchObject({ userId: user.id });
  });

  it('never shortens active self-exclusion and permanent exclusion cannot reactivate', async () => {
    await createPolicy();
    const user = await createUser('exclude');
    const reviewer = await createUser('reviewer');
    const pending = await submit(user.id);

    await onboarding.review({
      onboardingId: pending.id,
      reviewerUserId: reviewer.id,
      decision: 'APPROVE',
    });

    const longEnd = new Date(Date.now() + 7 * 86_400_000);
    const first = await protection.startSelfExclusion(
      user.id,
      longEnd,
      'seven days',
    );
    const shorter = await protection.startSelfExclusion(
      user.id,
      new Date(Date.now() + 86_400_000),
      'one day',
    );
    expect(shorter.id).toBe(first.id);

    const permanent = await protection.startSelfExclusion(
      user.id,
      undefined,
      'permanent',
    );
    expect(permanent.endsAt).toBeNull();

    await expect(
      onboarding.reactivateAfterSelfExclusion(user.id, 'should fail'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('compliance hold blocks eligibility until explicit removal', async () => {
    await createPolicy();
    const user = await createUser('hold');
    const reviewer = await createUser('reviewer');
    const pending = await submit(user.id);

    await onboarding.review({
      onboardingId: pending.id,
      reviewerUserId: reviewer.id,
      decision: 'APPROVE',
    });

    await onboarding.placeComplianceHold(user.id, 'manual review');
    await expect(
      protection.assertCanPurchase(user.id),
    ).rejects.toBeInstanceOf(ConflictException);

    await onboarding.removeComplianceHold(user.id, 'review cleared');
    await expect(
      protection.assertCanPurchase(user.id),
    ).resolves.toMatchObject({ userId: user.id });
  });
});