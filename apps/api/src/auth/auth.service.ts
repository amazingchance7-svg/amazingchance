import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import * as argon2 from 'argon2';

import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { EmailDto } from './dto/email.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TokenDto } from './dto/token.dto';
import { MfaService } from './mfa.service';
import { TokenService } from './token.service';
import { UserTokenService } from './user-token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService:
      UsersService,
    private readonly tokenService:
      TokenService,
    private readonly userTokenService:
      UserTokenService,
    private readonly emailService:
      EmailService,
    private readonly mfaService:
      MfaService,
  ) {}

  ping() {
    return {
      message:
        'Auth service is working',
      usersService:
        !!this.usersService,
      tokenService:
        !!this.tokenService,
      userTokenService:
        !!this.userTokenService,
      emailService:
        !!this.emailService,
      mfaService:
        !!this.mfaService,
    };
  }

  async register(
    dto: RegisterDto,
  ) {
    const passwordHash =
      await argon2.hash(
        dto.password,
      );

    const user =
      await this.usersService
        .createFromRegistration({
          email: dto.email,
          passwordHash,
        });

    const token =
      await this.userTokenService
        .createEmailVerificationToken(
          user.id,
        );

    await this.emailService
      .sendEmailVerification(
        user.email,
        token,
      );

    return {
      message:
        'Registration successful. Check your email to verify the account.',
      user,
    };
  }

  async login(
    dto: LoginDto,
  ) {
    const user =
      await this.usersService
        .findByEmailForAuth(
          dto.email,
        );

    if (!user) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    const passwordMatches =
      await argon2.verify(
        user.passwordHash,
        dto.password,
      );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'Invalid email or password',
      );
    }

    if (
      user.status ===
        UserStatus
          .PENDING_VERIFICATION ||
      !user.emailVerifiedAt
    ) {
      throw new ForbiddenException(
        'Email address is not verified',
      );
    }

    if (
      user.status !==
      UserStatus.ACTIVE
    ) {
      throw new ForbiddenException(
        'This account is not active',
      );
    }

    const privileged =
      await this.usersService
        .isPrivilegedAccount(
          user.id,
        );

    let mfaVerified =
      !privileged;

    if (privileged) {
      const mfaEnabled =
        await this.mfaService
          .isEnabled(
            user.id,
          );

      if (mfaEnabled) {
        if (
          !dto.mfaCode ||
          !(await this.mfaService
            .verify(
              user.id,
              dto.mfaCode,
            ))
        ) {
          throw new UnauthorizedException(
            'MFA verification is required',
          );
        }

        mfaVerified = true;
      }
    }

    const tokens =
      await this.tokenService
        .createTokenPair({
          id: user.id,
          email: user.email,
          mfaVerified,
        });

    return {
      ...tokens,
      user:
        this.toPublicUser(
          user,
        ),
      mfaRequired:
        privileged &&
        !mfaVerified,
    };
  }

  refresh(
    dto: RefreshTokenDto,
  ) {
    return this.tokenService
      .rotate(dto);
  }

  async logout(
    dto: RefreshTokenDto,
  ) {
    await this.tokenService
      .revoke(dto);

    return {
      message:
        'Logged out successfully',
    };
  }

  async verifyEmail(
    dto: TokenDto,
  ) {
    const user =
      await this.userTokenService
        .verifyEmail(
          dto.token,
        );

    return {
      message:
        'Email verified successfully',
      user,
    };
  }

  async resendVerification(
    dto: EmailDto,
  ) {
    const user =
      await this.usersService
        .findByEmailForAuth(
          dto.email,
        );

    if (
      user &&
      user.status ===
        UserStatus
          .PENDING_VERIFICATION &&
      !user.emailVerifiedAt
    ) {
      const token =
        await this.userTokenService
          .createEmailVerificationToken(
            user.id,
          );

      await this.emailService
        .sendEmailVerification(
          user.email,
          token,
        );
    }

    return {
      message:
        'If the account exists and is not verified, a new verification email has been sent.',
    };
  }

  async forgotPassword(
    dto: EmailDto,
  ) {
    const user =
      await this.usersService
        .findByEmailForAuth(
          dto.email,
        );

    if (
      user &&
      user.status !==
        UserStatus.CLOSED
    ) {
      const token =
        await this.userTokenService
          .createPasswordResetToken(
            user.id,
          );

      await this.emailService
        .sendPasswordReset(
          user.email,
          token,
        );
    }

    return {
      message:
        'If the account exists, password reset instructions have been sent.',
    };
  }

  async resetPassword(
    dto: ResetPasswordDto,
  ) {
    const passwordHash =
      await argon2.hash(
        dto.password,
      );

    await this.userTokenService
      .resetPassword(
        dto.token,
        passwordHash,
      );

    return {
      message:
        'Password changed successfully. Sign in again on all devices.',
    };
  }

  private toPublicUser(
    user: {
      id: string;
      email: string;
      status: UserStatus;
      emailVerifiedAt:
        Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ) {
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      emailVerifiedAt:
        user.emailVerifiedAt,
      createdAt:
        user.createdAt,
      updatedAt:
        user.updatedAt,
    };
  }
}
