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
  JwtAuthGuard,
} from '../auth/guards/jwt-auth.guard';
import type {
  RequestContextRequest,
} from '../common/types/request-context.type';
import {
  SubmitPrizeClaimDto,
} from './dto/submit-prize-claim.dto';
import {
  PrizeClaimsService,
} from './prize-claims.service';

@ApiTags('Prize Claims')
@ApiBearerAuth()
@UseGuards(
  JwtAuthGuard,
)
@Controller(
  'prize-claims',
)
export class PrizeClaimsController {
  constructor(
    private readonly claims:
      PrizeClaimsService,
    private readonly audit:
      AuditService,
  ) {}

  @Post('prizes/:prizeId')
  @ApiOperation({
    summary:
      'Submit a claim for an owned recognized prize',
  })
  @ApiOkResponse({
    description:
      'Prize claim submitted.',
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  async submit(
    @Param(
      'prizeId',
      ParseUUIDPipe,
    )
    prizeId:
      string,
    @Body()
    dto:
      SubmitPrizeClaimDto,
    @Req()
    request:
      RequestContextRequest,
  ) {
    const userId =
      request.user?.id;

    if (!userId) {
      throw new UnauthorizedException(
        'Authentication is required',
      );
    }

    const claim =
      await this.claims.submit({
        prizeId,
        userId,
        declaredDateOfBirth:
          new Date(
            dto.declaredDateOfBirth,
          ),
        declaredCountryCode:
          dto.declaredCountryCode,
      });

    await this.audit.recordSafe({
      actorType:
        AuditActorType.USER,
      actorId:
        userId,
      action:
        AuditActions
          .PRIZE_CLAIM_SUBMITTED,
      entityType:
        AuditEntityTypes
          .PRIZE_CLAIM,
      entityId:
        claim.id,
      ...getAuditRequestContext(
        request,
      ),
      newState: {
        status:
          'CLAIM_PENDING',
      },
      metadata: {
        prizeId:
          claim.prizeId,
      },
    });

    return claim;
  }
}
