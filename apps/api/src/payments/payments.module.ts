import { Module } from '@nestjs/common';

import { FinanceModule } from '../finance/finance.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TicketsModule } from '../tickets/tickets.module';
import { PaymentOrchestratorService } from './payment-orchestrator.service';

@Module({
  imports: [
    PrismaModule,
    LedgerModule,
    TicketsModule,
    FinanceModule,
  ],
  providers: [
    PaymentOrchestratorService,
  ],
  exports: [
    PaymentOrchestratorService,
  ],
})
export class PaymentsModule {}
