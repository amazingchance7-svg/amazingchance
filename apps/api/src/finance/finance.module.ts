import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { FinancialAllocationService } from './financial-allocation.service';
import { JackpotAccountingService } from './jackpot-accounting.service';

@Module({
  imports: [
    PrismaModule,
  ],
  providers: [
    FinancialAllocationService,
    JackpotAccountingService,
  ],
  exports: [
    FinancialAllocationService,
    JackpotAccountingService,
  ],
})
export class FinanceModule {}
