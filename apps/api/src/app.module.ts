import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import {
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';

import { AdminOperationsModule } from './admin-operations/admin-operations.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { validateEnvironment } from './config/environment.validation';
import { HealthModule } from './health/health.module';
import { LedgerModule } from './ledger/ledger.module';
import { LotteryDrawsModule } from './lottery-draws/lottery-draws.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { PurchasesModule } from './purchases/purchases.module';
import { SnapshotsModule } from './snapshots/snapshots.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        'apps/api/.env',
        '.env',
      ],
      validate: validateEnvironment,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
        blockDuration: 60_000,
      },
    ]),
    PrismaModule,
    AdminOperationsModule,
    AuditModule,
    HealthModule,
    UsersModule,
    AuthModule,
    AuthorizationModule,
    LotteryDrawsModule,
    LedgerModule,
    PurchasesModule,
    PaymentsModule,
    SnapshotsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule
  implements NestModule
{
  configure(
    consumer: MiddlewareConsumer,
  ): void {
    consumer
      .apply(
        RequestContextMiddleware,
      )
      .forRoutes('*');
  }
}
