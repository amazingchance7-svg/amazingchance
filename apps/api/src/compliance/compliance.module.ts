import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import {
  PlayerProtectionService,
} from './player-protection.service';

@Module({
  imports: [
    PrismaModule,
  ],
  providers: [
    PlayerProtectionService,
  ],
  exports: [
    PlayerProtectionService,
  ],
})
export class ComplianceModule {}
