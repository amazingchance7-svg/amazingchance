import {
    Injectable,
    UnauthorizedException,
  } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import { PassportStrategy } from '@nestjs/passport';
  import { ExtractJwt, Strategy } from 'passport-jwt';
  
  import { UsersService } from '../../users/users.service';
  import { JwtPayload } from '../interfaces/jwt-payload.interface';
  
  @Injectable()
  export class JwtStrategy extends PassportStrategy(
    Strategy,
    'jwt',
  ) {
    constructor(
      configService: ConfigService,
      private readonly usersService: UsersService,
    ) {
      super({
        jwtFromRequest:
          ExtractJwt.fromAuthHeaderAsBearerToken(),
        ignoreExpiration: false,
        secretOrKey:
          configService.getOrThrow<string>(
            'JWT_ACCESS_SECRET',
          ),
      });
    }
  
    async validate(payload: JwtPayload) {
      if (payload.type !== 'access') {
        throw new UnauthorizedException(
          'Invalid access token',
        );
      }
  
      return this.usersService.findOne(payload.sub);
    }
  }