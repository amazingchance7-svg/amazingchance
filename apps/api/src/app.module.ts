import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { validateEnvironment } from './config/environment.validation';
import { HealthModule } from './health/health.module';
import { LotteryDrawsModule } from './lottery-draws/lottery-draws.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

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
    LotteryDrawsModule,
  ],
})
export class AppModule {}