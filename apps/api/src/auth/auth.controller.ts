import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  AuditActorType,
  UserStatus,
} from '@prisma/client';

import {
  createEmailFingerprint,
  getAuditRequestContext,
} from '../audit/audit-context.util';
import {
  AuditActions,
  AuditEntityTypes,
} from '../audit/audit-events.constants';
import { AuditService } from '../audit/audit.service';
import { THROTTLING_POLICIES } from '../common/constants/throttling.constants';
import type { RequestContextRequest } from '../common/types/request-context.type';
import { AuthService } from './auth.service';
import { EmailDto } from './dto/email.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TokenDto } from './dto/token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

interface AuthenticatedUserResult {
  user: {
    id: string;
    email: string;
    status: UserStatus;
  };
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) {}

  @Get('ping')
  @ApiOperation({
    summary:
      'Check authentication service availability',
  })
  @ApiOkResponse({
    description:
      'Authentication service is available.',
  })
  ping() {
    return {
      status: 'ok',
    };
  }

  @Post('register')
  @Throttle({
    default:
      THROTTLING_POLICIES.register,
  })
  @ApiOperation({
    summary: 'Register a new user',
  })
  @ApiCreatedResponse({
    description:
      'User registered successfully.',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid registration data.',
  })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: RequestContextRequest,
  ) {
    const result =
      await this.authService.register(dto);

    const context =
      getAuditRequestContext(request);

    await this.auditService.recordSafe({
      actorType: AuditActorType.USER,
      actorId: result.user.id,
      action:
        AuditActions.AUTH_REGISTRATION_SUCCEEDED,
      entityType:
        AuditEntityTypes.USER,
      entityId: result.user.id,
      ...context,
      newState: {
        status: result.user.status,
      },
      metadata: {
        channel: 'password',
      },
    });

    return result;
  }

  @Post('login')
  @Throttle({
    default: THROTTLING_POLICIES.login,
  })
  @ApiOperation({
    summary:
      'Log in with email and password',
  })
  @ApiOkResponse({
    description:
      'User logged in successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid login data.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Invalid email or password.',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() request: RequestContextRequest,
  ) {
    const context =
      getAuditRequestContext(request);

    const emailFingerprint =
      createEmailFingerprint(dto.email);

    try {
      const result =
        (await this.authService.login(
          dto,
        )) as AuthenticatedUserResult;

      await this.auditService.recordSafe({
        actorType: AuditActorType.USER,
        actorId: result.user.id,
        action:
          AuditActions.AUTH_LOGIN_SUCCEEDED,
        entityType:
          AuditEntityTypes.AUTH_SESSION,
        entityId: result.user.id,
        ...context,
        metadata: {
          emailFingerprint,
          authenticationMethod:
            'password',
        },
      });

      return result;
    } catch (error) {
      await this.auditService.recordSafe({
        actorType:
          AuditActorType.SYSTEM,
        action:
          AuditActions.AUTH_LOGIN_FAILED,
        entityType:
          AuditEntityTypes.AUTH_SESSION,
        entityId: emailFingerprint,
        ...context,
        metadata: {
          emailFingerprint,
          authenticationMethod:
            'password',
          reason:
            'authentication_rejected',
        },
      });

      throw error;
    }
  }

  @Post('refresh')
  @Throttle({
    default:
      THROTTLING_POLICIES.refresh,
  })
  @ApiOperation({
    summary:
      'Refresh access and refresh tokens',
  })
  @ApiOkResponse({
    description:
      'Tokens refreshed successfully.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Refresh token is invalid or expired.',
  })
  refresh(
    @Body() dto: RefreshTokenDto,
  ) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @Throttle({
    default:
      THROTTLING_POLICIES.logout,
  })
  @ApiOperation({
    summary:
      'Log out and revoke refresh token',
  })
  @ApiOkResponse({
    description:
      'User logged out successfully.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Refresh token is invalid or expired.',
  })
  logout(
    @Body() dto: RefreshTokenDto,
  ) {
    return this.authService.logout(dto);
  }

  @Post('verify-email')
  @Throttle({
    default:
      THROTTLING_POLICIES.verifyEmail,
  })
  @ApiOperation({
    summary:
      'Verify user email address',
  })
  @ApiOkResponse({
    description:
      'Email verified successfully.',
  })
  @ApiBadRequestResponse({
    description:
      'Verification token is invalid or expired.',
  })
  async verifyEmail(
    @Body() dto: TokenDto,
    @Req() request: RequestContextRequest,
  ) {
    const result =
      await this.authService.verifyEmail(
        dto,
      );

    const context =
      getAuditRequestContext(request);

    await this.auditService.recordSafe({
      actorType: AuditActorType.USER,
      actorId: result.user.id,
      action:
        AuditActions.AUTH_EMAIL_VERIFIED,
      entityType:
        AuditEntityTypes.USER,
      entityId: result.user.id,
      ...context,
      newState: {
        status: result.user.status,
        emailVerified: true,
      },
    });

    return result;
  }

  @Post('resend-verification')
  @Throttle({
    default:
      THROTTLING_POLICIES.resendVerification,
  })
  @ApiOperation({
    summary:
      'Resend email verification message',
  })
  @ApiOkResponse({
    description:
      'Verification message processed successfully.',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid email address.',
  })
  resendVerification(
    @Body() dto: EmailDto,
  ) {
    return this.authService
      .resendVerification(dto);
  }

  @Post('forgot-password')
  @Throttle({
    default:
      THROTTLING_POLICIES.forgotPassword,
  })
  @ApiOperation({
    summary:
      'Request a password reset message',
  })
  @ApiOkResponse({
    description:
      'Password reset request processed successfully.',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid email address.',
  })
  forgotPassword(
    @Body() dto: EmailDto,
  ) {
    return this.authService
      .forgotPassword(dto);
  }

  @Post('reset-password')
  @Throttle({
    default:
      THROTTLING_POLICIES.resetPassword,
  })
  @ApiOperation({
    summary:
      'Reset password using a reset token',
  })
  @ApiOkResponse({
    description:
      'Password reset successfully.',
  })
  @ApiBadRequestResponse({
    description:
      'Reset token or password is invalid.',
  })
  resetPassword(
    @Body() dto: ResetPasswordDto,
  ) {
    return this.authService
      .resetPassword(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Get the authenticated user',
  })
  @ApiOkResponse({
    description:
      'Authenticated user returned successfully.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Access token is missing, invalid, or expired.',
  })
  me(
    @Req() request: RequestContextRequest,
  ) {
    return request.user;
  }
}
