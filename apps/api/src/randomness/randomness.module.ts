import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { RandomnessEvidenceService } from './randomness-evidence.service';
import { RandomOrgSignedClient } from './random-org-signed.client';

@Module({
  imports: [
    PrismaModule,
  ],
  providers: [
    RandomOrgSignedClient,
    RandomnessEvidenceService,
  ],
  exports: [
    RandomnessEvidenceService,
  ],
})
export class RandomnessModule {}
