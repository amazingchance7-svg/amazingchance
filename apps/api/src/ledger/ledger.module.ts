import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { LedgerIntegrityService } from './ledger-integrity.service';
import { LedgerService } from './ledger.service';

@Module({
  imports: [PrismaModule],
  providers: [
    LedgerService,
    LedgerIntegrityService,
  ],
  exports: [
    LedgerService,
    LedgerIntegrityService,
  ],
})
export class LedgerModule {}
