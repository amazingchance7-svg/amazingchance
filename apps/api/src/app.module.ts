import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { validateEnvironment } from './config/environment.validation';
import { HealthModule } from './health/health.module';
import { LotteryDrawsModule } from './lottery-draws/lottery-draws.module';
import { LedgerModule } from './ledger/ledger.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { PurchasesModule } from './purchases/purchases.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: ['apps/api/.env', '.env'],
      validate: validateEnvironment,
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    AuthorizationModule,
    LotteryDrawsModule,
    LedgerModule,
    PurchasesModule,
  ],
})
export class AppModule {}