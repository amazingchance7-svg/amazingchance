import { Module } from '@nestjs/common';
import {
  ConfigModule,
  ConfigService,
} from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { EmailModule } from '../email/email.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';
import { UserTokenService } from './user-token.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    UsersModule,
    EmailModule,
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (
        configService: ConfigService,
      ) => ({
        secret:
          configService.getOrThrow<string>(
            'JWT_ACCESS_SECRET',
          ),
        signOptions: {
          expiresIn: Number(
            configService.getOrThrow<number>(
              'JWT_ACCESS_TTL_SECONDS',
            ),
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    UserTokenService,
    JwtStrategy,
  ],
  exports: [
    AuthService,
    TokenService,
    JwtModule,
    PassportModule,
  ],
})
export class AuthModule {}
