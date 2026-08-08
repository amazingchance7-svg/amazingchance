import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    PaymentsModule,
  ],
  controllers: [
    PurchasesController,
  ],
  providers: [
    PurchasesService,
  ],
  exports: [
    PurchasesService,
  ],
})
export class PurchasesModule {}
