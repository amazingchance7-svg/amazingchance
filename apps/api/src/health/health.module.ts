import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkersModule } from '../workers/workers.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    WorkersModule,
  ],
  controllers: [HealthController],
})
export class HealthModule {}