import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../authorization/authorization.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkersModule } from '../workers/workers.module';
import { AdminOperationsController } from './admin-operations.controller';
import { AdminOperationsService } from './admin-operations.service';
import { AdminPurchaseControlsService } from './admin-purchase-controls.service';

@Module({
  imports: [
    PrismaModule,
    AuthorizationModule,
    PaymentsModule,
    NotificationsModule,
    WorkersModule,
  ],
  controllers: [AdminOperationsController],
  providers: [AdminOperationsService, AdminPurchaseControlsService],
  exports: [AdminOperationsService],
})
export class AdminOperationsModule {}
