import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestContextRequest } from '../common/types/request-context.type';
import { AdminPurchaseControlsService } from './admin-purchase-controls.service';
import { AdminPurchaseReasonDto } from './dto/admin-purchase-reason.dto';
import { Permissions } from '../authorization/permissions.constants';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { AdminOperationsService } from './admin-operations.service';

@ApiTags('Admin Operations')
@ApiBearerAuth()
@Controller('admin/operations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminOperationsController {
  constructor(
    private readonly adminOperationsService: AdminOperationsService,
    private readonly adminPurchaseControlsService: AdminPurchaseControlsService,
  ) {}

  @Get('overview')
  @RequirePermissions(Permissions.FINANCE_READ_ADMIN)
  @ApiOperation({
    summary: 'Get administrative operational and financial overview',
  })
  @ApiOkResponse({ description: 'Overview returned successfully.' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  @ApiForbiddenResponse({ description: 'Required permission is missing.' })
  overview() {
    return this.adminOperationsService.overview();
  }

  @Get('users')
  @RequirePermissions(Permissions.USER_READ_ADMIN)
  @ApiOperation({ summary: 'List recent users for backoffice operations' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Users returned successfully.' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  @ApiForbiddenResponse({ description: 'Required permission is missing.' })
  users(
    @Query('limit', new ParseIntPipe({ optional: true }))
    limit?: number,
  ) {
    return this.adminOperationsService.users(limit);
  }

  @Get('purchases')
  @RequirePermissions(Permissions.PURCHASE_READ_ADMIN)
  @ApiOperation({ summary: 'List recent purchases for backoffice operations' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Purchases returned successfully.' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  @ApiForbiddenResponse({ description: 'Required permission is missing.' })
  purchases(
    @Query('limit', new ParseIntPipe({ optional: true }))
    limit?: number,
  ) {
    return this.adminOperationsService.purchases(limit);
  }

  @Get('tickets')
  @RequirePermissions(Permissions.TICKET_READ_ADMIN)
  @ApiOperation({ summary: 'List recent tickets for backoffice operations' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Tickets returned successfully.' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required.' })
  @ApiForbiddenResponse({ description: 'Required permission is missing.' })
  tickets(
    @Query('limit', new ParseIntPipe({ optional: true }))
    limit?: number,
  ) {
    return this.adminOperationsService.tickets(limit);
  }

  @Post('purchases/:purchaseId/manual-review')
  @RequirePermissions(Permissions.PURCHASE_REVIEW_ADMIN)
  async markManualReview(
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
    @Body() dto: AdminPurchaseReasonDto,
    @Req() request: RequestContextRequest,
  ) {
    return this.adminPurchaseControlsService.markManualReview(
      purchaseId,
      dto.reason,
      request.user?.id ?? null,
    );
  }

  @Post('purchases/:purchaseId/cancel-manual-review')
  @RequirePermissions(Permissions.PURCHASE_CANCEL_ADMIN)
  async cancelManualReview(
    @Param('purchaseId', ParseUUIDPipe) purchaseId: string,
    @Body() dto: AdminPurchaseReasonDto,
    @Req() request: RequestContextRequest,
  ) {
    return this.adminPurchaseControlsService.cancelManualReview(
      purchaseId,
      dto.reason,
      request.user?.id ?? null,
    );
  }
}
