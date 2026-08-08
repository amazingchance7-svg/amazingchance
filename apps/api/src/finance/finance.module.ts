import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { FinancialAllocationService } from './financial-allocation.service';

@Module({
  imports: [
    PrismaModule,
  ],
  providers: [
    FinancialAllocationService,
  ],
  exports: [
    FinancialAllocationService,
  ],
})
export class FinanceModule {}
