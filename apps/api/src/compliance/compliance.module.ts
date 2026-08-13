import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminComplianceController } from './admin-compliance.controller';
import { ComplianceOnboardingService } from './compliance-onboarding.service';
import { ComplianceController } from './compliance.controller';
import { PlayerProtectionService } from './player-protection.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuthorizationModule,
    AuditModule,
  ],
  controllers: [
    ComplianceController,
    AdminComplianceController,
  ],
  providers: [
    PlayerProtectionService,
    ComplianceOnboardingService,
  ],
  exports: [
    PlayerProtectionService,
    ComplianceOnboardingService,
  ],
})
export class ComplianceModule {}