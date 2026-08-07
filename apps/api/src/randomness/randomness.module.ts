import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { PublicRandomnessVerificationService } from './public-randomness-verification.service';
import { RandomnessEvidenceService } from './randomness-evidence.service';
import { RandomOrgSignedClient } from './random-org-signed.client';

@Module({
  imports: [
    PrismaModule,
  ],
  providers: [
    RandomOrgSignedClient,
    RandomnessEvidenceService,
    PublicRandomnessVerificationService,
  ],
  exports: [
    RandomnessEvidenceService,
    PublicRandomnessVerificationService,
  ],
})
export class RandomnessModule {}
