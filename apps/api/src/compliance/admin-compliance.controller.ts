import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AuditActorType,
  ComplianceOnboardingStatus,
} from '@prisma/client';

import { getAuditRequestContext } from '../audit/audit-context.util';
import { AuditActions, AuditEntityTypes } from '../audit/audit-events.constants';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Permissions } from '../authorization/permissions.constants';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import type { RequestContextRequest } from '../common/types/request-context.type';
import { ComplianceOnboardingService } from './compliance-onboarding.service';
import { ComplianceControlDto } from './dto/compliance-control.dto';
import { ReviewComplianceOnboardingDto } from './dto/review-compliance-onboarding.dto';

@ApiTags('Admin Compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/compliance')
export class AdminComplianceController {
  constructor(
    private readonly onboarding: ComplianceOnboardingService,
    private readonly audit: AuditService,
  ) {}

  @Get('onboardings/:onboardingId')
  @RequirePermissions(Permissions.COMPLIANCE_READ_ADMIN)
  @ApiOperation({ summary: 'Read compliance onboarding review state' })
  @ApiOkResponse()
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  getOnboarding(
    @Param('onboardingId', ParseUUIDPipe) onboardingId: string,
  ) {
    return this.onboarding.getForAdmin(onboardingId);
  }

  @Post('onboardings/:onboardingId/review')
  @RequirePermissions(Permissions.COMPLIANCE_REVIEW_ADMIN)
  @ApiOperation({ summary: 'Approve or reject compliance onboarding' })
  @ApiOkResponse()
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async review(
    @Param('onboardingId', ParseUUIDPipe) onboardingId: string,
    @Body() dto: ReviewComplianceOnboardingDto,
    @Req() request: RequestContextRequest,
  ) {
    const reviewerUserId = this.userId(request);
    const result = await this.onboarding.review({
      onboardingId,
      reviewerUserId,
      decision: dto.decision,
      reason: dto.reason,
    });

    const approved = result.status === ComplianceOnboardingStatus.APPROVED;
    await this.audit.recordSafe({
      actorType: AuditActorType.ADMIN,
      actorId: reviewerUserId,
      action: approved
        ? AuditActions.COMPLIANCE_ONBOARDING_APPROVED
        : AuditActions.COMPLIANCE_ONBOARDING_REJECTED,
      entityType: AuditEntityTypes.COMPLIANCE_ONBOARDING,
      entityId: result.id,
      ...getAuditRequestContext(request),
      newState: { status: result.status, reviewedAt: result.reviewedAt },
      metadata: { decisionReason: result.decisionReason },
    });
    return result;
  }

  @Post('users/:userId/hold')
  @RequirePermissions(Permissions.COMPLIANCE_REVIEW_ADMIN)
  async placeHold(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ComplianceControlDto,
    @Req() request: RequestContextRequest,
  ) {
    const actorId = this.userId(request);
    const profile = await this.onboarding.placeComplianceHold(userId, dto.reason);
    await this.audit.recordSafe({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: AuditActions.COMPLIANCE_HOLD_PLACED,
      entityType: AuditEntityTypes.PLAYER_COMPLIANCE_PROFILE,
      entityId: profile.id,
      ...getAuditRequestContext(request),
      newState: { status: profile.status },
      metadata: { reason: dto.reason },
    });
    return profile;
  }

  @Post('users/:userId/remove-hold')
  @RequirePermissions(Permissions.COMPLIANCE_REVIEW_ADMIN)
  async removeHold(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ComplianceControlDto,
    @Req() request: RequestContextRequest,
  ) {
    const actorId = this.userId(request);
    const profile = await this.onboarding.removeComplianceHold(userId, dto.reason);
    await this.audit.recordSafe({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: AuditActions.COMPLIANCE_HOLD_REMOVED,
      entityType: AuditEntityTypes.PLAYER_COMPLIANCE_PROFILE,
      entityId: profile.id,
      ...getAuditRequestContext(request),
      newState: { status: profile.status },
      metadata: { reason: dto.reason },
    });
    return profile;
  }

  @Post('users/:userId/reactivate')
  @RequirePermissions(Permissions.COMPLIANCE_REVIEW_ADMIN)
  async reactivate(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ComplianceControlDto,
    @Req() request: RequestContextRequest,
  ) {
    const actorId = this.userId(request);
    const profile = await this.onboarding.reactivateAfterSelfExclusion(
      userId,
      dto.reason,
    );
    await this.audit.recordSafe({
      actorType: AuditActorType.ADMIN,
      actorId,
      action: AuditActions.COMPLIANCE_PROFILE_REACTIVATED,
      entityType: AuditEntityTypes.PLAYER_COMPLIANCE_PROFILE,
      entityId: profile.id,
      ...getAuditRequestContext(request),
      newState: { status: profile.status },
      metadata: { reason: dto.reason },
    });
    return profile;
  }

  private userId(request: RequestContextRequest): string {
    const id = request.user?.id;
    if (!id) {
      throw new UnauthorizedException('Authentication is required');
    }
    return id;
  }
}