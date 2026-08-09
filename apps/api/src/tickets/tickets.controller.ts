import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestContextRequest } from '../common/types/request-context.type';
import { TicketsQueryService } from './tickets-query.service';

type AuthenticatedRequest =
  RequestContextRequest & {
    user: {
      id: string;
    };
  };

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
@UseGuards(JwtAuthGuard)
export class TicketsController {
  constructor(
    private readonly ticketsQueryService:
      TicketsQueryService,
  ) {}

  @Get('my')
  @ApiOperation({
    summary:
      'Get recently issued tickets for the authenticated user',
  })
  @ApiOkResponse({
    description:
      'The authenticated user tickets were returned successfully.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication required.',
  })
  findMine(
    @Req() request:
      AuthenticatedRequest,
  ) {
    return this
      .ticketsQueryService
      .findMine(
        request.user.id,
      );
  }
}
