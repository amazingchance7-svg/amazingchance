import {
  Body,
  Controller,
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
  Prisma,
  PrizeStatus,
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
import {
  Permissions,
} from '../authorization/permissions.constants';
import {
  PermissionsGuard,
} from '../authorization/permissions.guard';
import {
  RequirePermissions,
} from '../authorization/require-permissions.decorator';
import {
  JwtAuthGuard,
} from '../auth/guards/jwt-auth.guard';
import type {
  RequestContextRequest,
} from '../common/types/request-context.type';
import {
  ReviewPrizeClaimDto,
} from './dto/review-prize-claim.dto';
import {
  PrizeClaimsService,
} from './prize-claims.service';

@ApiTags('Admin Prize Claims')
@ApiBearerAuth()
@UseGuards(
  JwtAuthGuard,
  PermissionsGuard,
)
@Controller(
  'admin/prize-claims',
)
export class AdminPrizeClaimsController {
  constructor(
    private readonly claims:
      PrizeClaimsService,
    private readonly audit:
      AuditService,
  ) {}

  @Post(':claimId/review')
  @RequirePermissions(
    Permissions
      .PRIZE_CLAIM_REVIEW_ADMIN,
  )
  @ApiOperation({
    summary:
      'Review prize eligibility and approve or withhold the claim',
  })
  @ApiOkResponse()
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async review(
    @Param(
      'claimId',
      ParseUUIDPipe,
    )
    claimId:
      string,
    @Body()
    dto:
      ReviewPrizeClaimDto,
    @Req()
    request:
      RequestContextRequest,
  ) {
    const reviewerUserId =
      request.user?.id;

    if (!reviewerUserId) {
      throw new UnauthorizedException(
        'Authentication is required',
      );
    }

    const result =
      await this.claims.review({
        claimId,
        reviewerUserId,
        checks:
          dto.checks.map(
            (check) => ({
              type:
                check.type,
              status:
                check.status,
              evidence:
                check.evidence as
                  Prisma.InputJsonValue,
            }),
          ),
        decisionReason:
          dto.decisionReason,
      });

    const approved =
      result.prize.status ===
      PrizeStatus.APPROVED;

    await this.audit.recordSafe({
      actorType:
        AuditActorType.ADMIN,
      actorId:
        reviewerUserId,
      action:
        approved
          ? AuditActions
              .PRIZE_CLAIM_APPROVED
          : AuditActions
              .PRIZE_CLAIM_WITHHELD,
      entityType:
        AuditEntityTypes
          .PRIZE_CLAIM,
      entityId:
        result.id,
      ...getAuditRequestContext(
        request,
      ),
      newState: {
        prizeStatus:
          result.prize.status,
        reviewedAt:
          result.reviewedAt,
      },
      metadata: {
        prizeId:
          result.prizeId,
        checkCount:
          result.checks.length,
        decisionReason:
          result.decisionReason,
      },
    });

    return result;
  }
}
