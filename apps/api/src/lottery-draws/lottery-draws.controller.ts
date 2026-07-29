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
  import {
    ApiBadRequestResponse,
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
  } from '@nestjs/swagger';
  
  import { CreateLotteryDrawDto } from './dto/create-lottery-draw.dto';
  import { ListLotteryDrawsDto } from './dto/list-lottery-draws.dto';
  import { UpdateLotteryDrawDto } from './dto/update-lottery-draw.dto';
  import { LotteryDrawsService } from './lottery-draws.service';
  
  @ApiTags('Lottery Draws')
  @Controller('lottery-draws')
  export class LotteryDrawsController {
    constructor(
      private readonly lotteryDrawsService: LotteryDrawsService,
    ) {}
  
    @Post()
    @ApiOperation({
      summary: 'Create a lottery draw',
    })
    @ApiCreatedResponse({
      description: 'Lottery draw created successfully.',
    })
    @ApiBadRequestResponse({
      description: 'Invalid lottery draw data.',
    })
    create(@Body() dto: CreateLotteryDrawDto) {
      return this.lotteryDrawsService.create(dto);
    }
  
    @Get()
    @ApiOperation({
      summary: 'Get all lottery draws',
    })
    @ApiOkResponse({
      description: 'Lottery draws returned successfully.',
    })
    findAll(@Query() query: ListLotteryDrawsDto) {
      return this.lotteryDrawsService.findAll(query);
    }
  
    @Get(':id')
    @ApiOperation({
      summary: 'Get lottery draw by ID',
    })
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
  
    @Patch(':id')
    @ApiOperation({
      summary: 'Update a lottery draw',
    })
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
    @ApiNotFoundResponse({
      description: 'Lottery draw not found.',
    })
    update(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() dto: UpdateLotteryDrawDto,
    ) {
      return this.lotteryDrawsService.update(id, dto);
    }
  
    @Delete(':id')
    @ApiOperation({
      summary: 'Delete a lottery draw',
    })
    @ApiParam({
      name: 'id',
      description: 'Lottery draw UUID',
    })
    @ApiOkResponse({
      description: 'Lottery draw deleted successfully.',
    })
    @ApiNotFoundResponse({
      description: 'Lottery draw not found.',
    })
    remove(@Param('id', ParseUUIDPipe) id: string) {
      return this.lotteryDrawsService.remove(id);
    }
  }