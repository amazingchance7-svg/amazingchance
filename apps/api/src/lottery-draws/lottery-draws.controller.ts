import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { PublicSnapshotService } from '../snapshots/public-snapshot.service';
import { ListLotteryDrawsDto } from './dto/list-lottery-draws.dto';
import { LotteryDrawsService } from './lottery-draws.service';

@ApiTags('Lottery Draws')
@Controller('lottery-draws')
export class LotteryDrawsController {
  constructor(
    private readonly lotteryDrawsService: LotteryDrawsService,
    private readonly publicSnapshotService: PublicSnapshotService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get lottery draws' })
  @ApiOkResponse({
    description: 'Lottery draws returned successfully.',
  })
  findAll(@Query() query: ListLotteryDrawsDto) {
    return this.lotteryDrawsService.findAll(query);
  }

  @Get(':id/snapshot/download')
  @ApiOperation({
    summary: 'Download the canonical finalized ticket snapshot',
  })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiProduces('text/plain')
  @ApiOkResponse({
    description:
      'Canonical finalized ticket snapshot returned successfully.',
  })
  @ApiConflictResponse({
    description:
      'Stored snapshot commitment does not match its entries.',
  })
  @ApiNotFoundResponse({
    description: 'Finalized ticket snapshot not found.',
  })
  async downloadSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() response: Response,
  ): Promise<void> {
    const download =
      await this.publicSnapshotService.downloadFinalizedByDrawId(
        id,
      );

    response.setHeader(
      'Content-Type',
      download.contentType,
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${download.filename}"`,
    );
    response.setHeader(
      'X-Snapshot-SHA256',
      download.snapshotHash,
    );

    response.status(200).send(download.canonicalSnapshot);
  }

  @Get(':id/snapshot')
  @ApiOperation({
    summary: 'Get a finalized public ticket snapshot',
  })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiOkResponse({
    description:
      'Finalized public ticket snapshot returned successfully.',
  })
  @ApiNotFoundResponse({
    description: 'Finalized ticket snapshot not found.',
  })
  findSnapshot(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.publicSnapshotService.findFinalizedByDrawId(
      id,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lottery draw by ID' })
  @ApiParam({
    name: 'id',
    description: 'Lottery draw UUID',
  })
  @ApiOkResponse({
    description: 'Lottery draw returned successfully.',
  })
  @ApiNotFoundResponse({
    description: 'Lottery draw not found.',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.lotteryDrawsService.findOne(id);
  }
}