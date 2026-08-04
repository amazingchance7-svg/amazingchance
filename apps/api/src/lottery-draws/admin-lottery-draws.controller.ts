import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { Permissions } from '../authorization/permissions.constants';
import { PermissionsGuard } from '../authorization/permissions.guard';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SnapshotBuilderService } from '../snapshots/snapshot-builder.service';
import { SnapshotFinalizerService } from '../snapshots/snapshot-finalizer.service';
import { CreateLotteryDrawDto } from './dto/create-lottery-draw.dto';
import { UpdateLotteryDrawDto } from './dto/update-lottery-draw.dto';
import { LotteryDrawsService } from './lottery-draws.service';

@ApiTags('Admin Lottery Draws')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/lottery-draws')
export class AdminLotteryDrawsController {
  constructor(
    private readonly lotteryDrawsService: LotteryDrawsService,
    private readonly snapshotBuilderService: SnapshotBuilderService,
    private readonly snapshotFinalizerService: SnapshotFinalizerService,
  ) {}

  @Post()
  @RequirePermissions(Permissions.DRAW_CREATE)
  @ApiOperation({ summary: 'Create a scheduled lottery draw' })
  @ApiCreatedResponse({
    description: 'Lottery draw created successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid lottery draw data.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  @ApiForbiddenResponse({
    description: 'Missing draw.create permission.',
  })
  create(@Body() dto: CreateLotteryDrawDto) {
    return this.lotteryDrawsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permissions.DRAW_UPDATE)
  @ApiOperation({ summary: 'Update a scheduled lottery draw' })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiOkResponse({
    description: 'Lottery draw updated successfully.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid update data.',
  })
  @ApiConflictResponse({
    description: 'Only a scheduled draw can be edited.',
  })
  @ApiNotFoundResponse({
    description: 'Lottery draw not found.',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLotteryDrawDto,
  ) {
    return this.lotteryDrawsService.update(id, dto);
  }

  @Post(':id/open-sales')
  @RequirePermissions(Permissions.DRAW_OPEN_SALES)
  @ApiOperation({ summary: 'Open ticket sales' })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiOkResponse({
    description: 'Ticket sales opened successfully.',
  })
  @ApiConflictResponse({
    description: 'Lottery draw cannot transition to sales open.',
  })
  @ApiNotFoundResponse({
    description: 'Lottery draw not found.',
  })
  openSales(@Param('id', ParseUUIDPipe) id: string) {
    return this.lotteryDrawsService.openSales(id);
  }

  @Post(':id/close-sales')
  @RequirePermissions(Permissions.DRAW_CLOSE_SALES)
  @ApiOperation({ summary: 'Close ticket sales' })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiOkResponse({
    description: 'Ticket sales closed successfully.',
  })
  @ApiConflictResponse({
    description: 'Lottery draw cannot transition to sales closed.',
  })
  @ApiNotFoundResponse({
    description: 'Lottery draw not found.',
  })
  closeSales(@Param('id', ParseUUIDPipe) id: string) {
    return this.lotteryDrawsService.closeSales(id);
  }

  @Post(':id/build-snapshot')
  @RequirePermissions(Permissions.DRAW_BUILD_SNAPSHOT)
  @ApiOperation({
    summary: 'Build a deterministic ticket snapshot',
  })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiOkResponse({
    description: 'Ticket snapshot built successfully.',
  })
  @ApiConflictResponse({
    description:
      'Snapshot cannot be built for the current draw state.',
  })
  @ApiNotFoundResponse({
    description: 'Lottery draw not found.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  @ApiForbiddenResponse({
    description: 'Missing draw.build_snapshot permission.',
  })
  buildSnapshot(@Param('id', ParseUUIDPipe) id: string) {
    return this.snapshotBuilderService.build(id);
  }

  @Post(':id/finalize-snapshot')
  @RequirePermissions(Permissions.DRAW_FINALIZE_SNAPSHOT)
  @ApiOperation({
    summary: 'Finalize the ticket snapshot commitment',
  })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiOkResponse({
    description: 'Ticket snapshot finalized successfully.',
  })
  @ApiConflictResponse({
    description:
      'Snapshot cannot be finalized or its integrity check failed.',
  })
  @ApiNotFoundResponse({
    description: 'Ticket snapshot or lottery draw not found.',
  })
  @ApiUnauthorizedResponse({
    description: 'Authentication is required.',
  })
  @ApiForbiddenResponse({
    description: 'Missing draw.finalize_snapshot permission.',
  })
  finalizeSnapshot(@Param('id', ParseUUIDPipe) id: string) {
    return this.snapshotFinalizerService.finalize(id);
  }

  @Post(':id/cancel')
  @RequirePermissions(Permissions.DRAW_CANCEL)
  @ApiOperation({
    summary: 'Cancel a scheduled or open draw',
  })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiOkResponse({
    description: 'Lottery draw cancelled successfully.',
  })
  @ApiConflictResponse({
    description: 'Lottery draw cannot be cancelled.',
  })
  @ApiNotFoundResponse({
    description: 'Lottery draw not found.',
  })
  cancel(@Param('id', ParseUUIDPipe) id: string) {
    return this.lotteryDrawsService.cancel(id);
  }

  @Post(':id/publish')
  @RequirePermissions(Permissions.DRAW_PUBLISH)
  @ApiOperation({ summary: 'Publish a completed draw' })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiOkResponse({
    description: 'Lottery draw published successfully.',
  })
  @ApiConflictResponse({
    description: 'Only a completed draw can be published.',
  })
  @ApiNotFoundResponse({
    description: 'Lottery draw not found.',
  })
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.lotteryDrawsService.publish(id);
  }
}