import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ConfigService,
} from '@nestjs/config';
import {
  UserStatus,
} from '@prisma/client';
import {
  PassportStrategy,
} from '@nestjs/passport';
import {
  ExtractJwt,
  Strategy,
} from 'passport-jwt';

import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy
  extends PassportStrategy(
    Strategy,
    'jwt',
  )
{
  constructor(
    configService:
      ConfigService,
    private readonly usersService:
      UsersService,
  ) {
    super({
      jwtFromRequest:
        ExtractJwt
          .fromAuthHeaderAsBearerToken(),
      ignoreExpiration:
        false,
      secretOrKey:
        configService
          .getOrThrow<string>(
            'JWT_ACCESS_SECRET',
          ),
    });
  }

  async validate(
    payload: JwtPayload,
  ) {
    if (
      payload.type !==
        'access' ||
      !payload.sub ||
      !payload.email ||
      typeof payload.mfa !==
        'boolean' ||
      !Number.isSafeInteger(
        payload.authVersion,
      ) ||
      (payload.authVersion ?? 0) < 1
    ) {
      throw new UnauthorizedException(
        'Invalid access token',
      );
    }

    let user:
      Awaited<
        ReturnType<
          UsersService['findOneForAuthSession']
        >
      >;

    try {
      user =
        await this.usersService
          .findOneForAuthSession(
            payload.sub,
          );
    } catch (error) {
      if (
        error instanceof
          NotFoundException
      ) {
        throw new UnauthorizedException(
          'Access token is no longer valid',
        );
      }

      throw error;
    }

    if (
      user.status !==
        UserStatus.ACTIVE ||
      !user.emailVerifiedAt
    ) {
      throw new UnauthorizedException(
        'Access token is no longer valid',
      );
    }

    if (
      user.email !==
        payload.email ||
      user.authVersion !==
        payload.authVersion
    ) {
      throw new UnauthorizedException(
        'Access token is no longer valid',
      );
    }

    return {
      ...user,
      mfaVerified:
        payload.mfa,
    };
  }
}
