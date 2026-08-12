import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  UseGuards,
  Body,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuditActorType,
} from '@prisma/client';

import {
  getAuditRequestContext,
} from '../audit/audit-context.util';
import {
  AuditActions,
  AuditEntityTypes,
} from '../audit/audit-events.constants';
import {
  AuditService,
} from '../audit/audit.service';
import type {
  RequestContextRequest,
} from '../common/types/request-context.type';
import {
  UsersService,
} from '../users/users.service';
import {
  MfaCodeDto,
} from './dto/mfa-code.dto';
import {
  JwtAuthGuard,
} from './guards/jwt-auth.guard';
import {
  MfaService,
} from './mfa.service';

@ApiTags('Authentication')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfaService:
      MfaService,
    private readonly usersService:
      UsersService,
    private readonly auditService:
      AuditService,
  ) {}

  @Get('status')
  @ApiOperation({
    summary:
      'Get MFA status for the authenticated privileged account',
  })
  async status(
    @Req()
    request:
      RequestContextRequest,
  ) {
    const user =
      this.requireUser(
        request,
      );

    await this.assertPrivileged(
      user.id,
    );

    return {
      enabled:
        await this.mfaService
          .isEnabled(
            user.id,
          ),
    };
  }

  @Post('setup')
  @ApiOperation({
    summary:
      'Start encrypted TOTP enrollment',
  })
  @ApiOkResponse({
    description:
      'Returns the one-time TOTP enrollment secret and otpauth URI.',
  })
  async setup(
    @Req()
    request:
      RequestContextRequest,
  ) {
    const user =
      this.requireUser(
        request,
      );

    await this.assertPrivileged(
      user.id,
    );

    const result =
      await this.mfaService
        .startSetup(
          user.id,
          user.email,
        );

    await this.auditService
      .recordSafe({
        actorType:
          AuditActorType.USER,
        actorId:
          user.id,
        action:
          AuditActions
            .AUTH_MFA_SETUP_STARTED,
        entityType:
          AuditEntityTypes.USER,
        entityId:
          user.id,
        ...getAuditRequestContext(
          request,
        ),
        metadata: {
          method: 'totp',
        },
      });

    return result;
  }

  @Post('enable')
  @ApiOperation({
    summary:
      'Confirm TOTP enrollment and enable MFA',
  })
  async enable(
    @Body()
    dto: MfaCodeDto,
    @Req()
    request:
      RequestContextRequest,
  ) {
    const user =
      this.requireUser(
        request,
      );

    await this.assertPrivileged(
      user.id,
    );

    const result =
      await this.mfaService
        .enable(
          user.id,
          dto.code,
        );

    await this.auditService
      .recordSafe({
        actorType:
          AuditActorType.USER,
        actorId:
          user.id,
        action:
          AuditActions
            .AUTH_MFA_ENABLED,
        entityType:
          AuditEntityTypes.USER,
        entityId:
          user.id,
        ...getAuditRequestContext(
          request,
        ),
        newState: {
          mfaEnabled: true,
        },
        metadata: {
          method: 'totp',
        },
      });

    return result;
  }

  @Post('disable')
  @ApiOperation({
    summary:
      'Disable MFA after a valid TOTP confirmation',
  })
  async disable(
    @Body()
    dto: MfaCodeDto,
    @Req()
    request:
      RequestContextRequest,
  ) {
    const user =
      this.requireUser(
        request,
      );

    await this.assertPrivileged(
      user.id,
    );

    await this.mfaService
      .disable(
        user.id,
        dto.code,
      );

    await this.auditService
      .recordSafe({
        actorType:
          AuditActorType.USER,
        actorId:
          user.id,
        action:
          AuditActions
            .AUTH_MFA_DISABLED,
        entityType:
          AuditEntityTypes.USER,
        entityId:
          user.id,
        ...getAuditRequestContext(
          request,
        ),
        newState: {
          mfaEnabled: false,
        },
        metadata: {
          method: 'totp',
        },
      });

    return {
      enabled: false,
    };
  }

  private requireUser(
    request:
      RequestContextRequest,
  ): {
    id: string;
    email: string;
  } {
    if (
      !request.user?.id ||
      !request.user.email
    ) {
      throw new ForbiddenException(
        'Authenticated user context is required',
      );
    }

    return {
      id:
        request.user.id,
      email:
        request.user.email,
    };
  }

  private async assertPrivileged(
    userId: string,
  ): Promise<void> {
    if (
      !(await this.usersService
        .isPrivilegedAccount(
          userId,
        ))
    ) {
      throw new ForbiddenException(
        'MFA enrollment is reserved for privileged accounts',
      );
    }
  }
}
