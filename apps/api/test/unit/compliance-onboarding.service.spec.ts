import { ConflictException } from '@nestjs/common';

import { ComplianceOnboardingService } from '../../src/compliance/compliance-onboarding.service';

describe('ComplianceOnboardingService', () => {
  it('fails closed when onboarding idempotency key is missing', () => {
    const service = new ComplianceOnboardingService({} as never);

    expect(() =>
      service.submit({
        userId: '00000000-0000-4000-8000-000000000001',
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        countryCode: 'UA',
        identityProvider: 'TEST',
        identityEvidenceRef: 'evidence-1',
        idempotencyKey: '',
      }),
    ).toThrow(ConflictException);
  });
});