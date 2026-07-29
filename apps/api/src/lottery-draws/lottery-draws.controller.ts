import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
  } from '@nestjs/common';
  
  import { CreateLotteryDrawDto } from './dto/create-lottery-draw.dto';
  import { ListLotteryDrawsDto } from './dto/list-lottery-draws.dto';
  import { UpdateLotteryDrawDto } from './dto/update-lottery-draw.dto';
  import { LotteryDrawsService } from './lottery-draws.service';
  
  @Controller('lottery-draws')
  export class LotteryDrawsController {
    constructor(
      private readonly lotteryDrawsService: LotteryDrawsService,
    ) {}
  
    @Post()
    create(@Body() dto: CreateLotteryDrawDto) {
      return this.lotteryDrawsService.create(dto);
    }
  
    @Get()
    findAll(@Query() query: ListLotteryDrawsDto) {
      return this.lotteryDrawsService.findAll(query);
    }
  
    @Get(':id')
    findOne(@Param('id', ParseUUIDPipe) id: string) {
      return this.lotteryDrawsService.findOne(id);
    }
  
    @Patch(':id')
    update(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() dto: UpdateLotteryDrawDto,
    ) {
      return this.lotteryDrawsService.update(id, dto);
    }
  
    @Delete(':id')
    remove(@Param('id', ParseUUIDPipe) id: string) {
      return this.lotteryDrawsService.remove(id);
    }
  }