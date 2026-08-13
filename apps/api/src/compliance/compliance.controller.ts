import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuditActorType } from '@prisma/client';

import { getAuditRequestContext } from '../audit/audit-context.util';
import { AuditActions, AuditEntityTypes } from '../audit/audit-events.constants';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestContextRequest } from '../common/types/request-context.type';
import { ComplianceOnboardingService } from './compliance-onboarding.service';
import { StartSelfExclusionDto } from './dto/start-self-exclusion.dto';
import { SubmitComplianceOnboardingDto } from './dto/submit-compliance-onboarding.dto';
import { PlayerProtectionService } from './player-protection.service';

@ApiTags('Compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('compliance')
export class ComplianceController {
  constructor(
    private readonly onboarding: ComplianceOnboardingService,
    private readonly protection: PlayerProtectionService,
    private readonly audit: AuditService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get own compliance and player-protection status' })
  @ApiOkResponse()
  @ApiUnauthorizedResponse()
  getMine(@Req() request: RequestContextRequest) {
    return this.onboarding.getOwnStatus(this.userId(request));
  }

  @Post('onboarding')
  @ApiOperation({ summary: 'Submit provider-neutral compliance onboarding for review' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiCreatedResponse()
  @ApiConflictResponse()
  @ApiUnauthorizedResponse()
  async submit(
    @Req() request: RequestContextRequest,
    @Body() dto: SubmitComplianceOnboardingDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const userId = this.userId(request);
    const result = await this.onboarding.submit({
      userId,
      dateOfBirth: new Date(`${dto.dateOfBirth.slice(0, 10)}T00:00:00.000Z`),
      countryCode: dto.countryCode,
      identityProvider: dto.identityProvider,
      identityEvidenceRef: dto.identityEvidenceRef,
      idempotencyKey: idempotencyKey ?? '',
    });

    await this.audit.recordSafe({
      actorType: AuditActorType.USER,
      actorId: userId,
      action: AuditActions.COMPLIANCE_ONBOARDING_SUBMITTED,
      entityType: AuditEntityTypes.COMPLIANCE_ONBOARDING,
      entityId: result.id,
      ...getAuditRequestContext(request),
      newState: {
        status: result.status,
        attemptNumber: result.attemptNumber,
        countryCode: result.countryCode,
      },
      metadata: { identityProvider: result.identityProvider },
    });

    return result;
  }

  @Post('self-exclusion')
  @ApiOperation({ summary: 'Start or extend self-exclusion' })
  @ApiCreatedResponse()
  @ApiConflictResponse()
  @ApiUnauthorizedResponse()
  async selfExclude(
    @Req() request: RequestContextRequest,
    @Body() dto: StartSelfExclusionDto,
  ) {
    const userId = this.userId(request);
    const exclusion = await this.protection.startSelfExclusion(
      userId,
      dto.endsAt ? new Date(dto.endsAt) : undefined,
      dto.reason,
    );

    await this.audit.recordSafe({
      actorType: AuditActorType.USER,
      actorId: userId,
      action: AuditActions.COMPLIANCE_SELF_EXCLUSION_STARTED,
      entityType: AuditEntityTypes.SELF_EXCLUSION,
      entityId: exclusion.id,
      ...getAuditRequestContext(request),
      newState: {
        startsAt: exclusion.startsAt,
        endsAt: exclusion.endsAt,
      },
      metadata: { permanent: exclusion.endsAt === null },
    });

    return exclusion;
  }

  private userId(request: RequestContextRequest): string {
    const id = request.user?.id;
    if (!id) {
      throw new UnauthorizedException('Authentication is required');
    }
    return id;
  }
}