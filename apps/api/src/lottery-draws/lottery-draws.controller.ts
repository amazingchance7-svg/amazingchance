import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

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