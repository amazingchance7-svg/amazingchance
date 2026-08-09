import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../authorization/authorization.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminOperationsController } from './admin-operations.controller';
import { AdminOperationsService } from './admin-operations.service';
import { AdminPurchaseControlsService } from './admin-purchase-controls.service';

@Module({
  imports: [PrismaModule, AuthorizationModule],
  controllers: [AdminOperationsController],
  providers: [AdminOperationsService, AdminPurchaseControlsService],
  exports: [AdminOperationsService],
})
export class AdminOperationsModule {}
