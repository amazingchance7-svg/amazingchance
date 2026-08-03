import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { ListLotteryDrawsDto } from './dto/list-lottery-draws.dto';
import { LotteryDrawsService } from './lottery-draws.service';

@ApiTags('Lottery Draws')
@Controller('lottery-draws')
export class LotteryDrawsController {
  constructor(private readonly lotteryDrawsService: LotteryDrawsService) {}

  @Get()
  @ApiOperation({ summary: 'Get lottery draws' })
  @ApiOkResponse({ description: 'Lottery draws returned successfully.' })
  findAll(@Query() query: ListLotteryDrawsDto) {
    return this.lotteryDrawsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lottery draw by ID' })
  @ApiParam({ name: 'id', description: 'Lottery draw UUID' })
  @ApiOkResponse({ description: 'Lottery draw returned successfully.' })
  @ApiNotFoundResponse({ description: 'Lottery draw not found.' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.lotteryDrawsService.findOne(id);
  }
}
