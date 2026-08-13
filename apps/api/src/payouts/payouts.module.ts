import {
  Module,
} from '@nestjs/common';

import {
  LedgerModule,
} from '../ledger/ledger.module';
import {
  PrismaModule,
} from '../prisma/prisma.module';
import {
  PayoutOrchestratorService,
} from './payout-orchestrator.service';

@Module({
  imports: [
    PrismaModule,
    LedgerModule,
  ],
  providers: [
    PayoutOrchestratorService,
  ],
  exports: [
    PayoutOrchestratorService,
  ],
})
export class PayoutsModule {}
