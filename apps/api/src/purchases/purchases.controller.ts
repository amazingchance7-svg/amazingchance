import {
    Body,
    Controller,
    Get,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Req,
    UseGuards,
  } from '@nestjs/common';
  import {
    ApiBearerAuth,
    ApiBadRequestResponse,
    ApiCreatedResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
    ApiUnauthorizedResponse,
  } from '@nestjs/swagger';
  import { Request } from 'express';
  
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { CreatePurchaseDto } from './dto/create-purchase.dto';
  import { PurchasesService } from './purchases.service';
  
  type AuthenticatedRequest = Request & {
    user: {
      id: string;
    };
  };
  
  @ApiTags('Purchases')
  @ApiBearerAuth()
  @Controller('purchases')
  @UseGuards(JwtAuthGuard)
  export class PurchasesController {
    constructor(
      private readonly purchasesService: PurchasesService,
    ) {}
  
    @Post()
    @ApiOperation({
      summary: 'Create a purchase',
    })
    @ApiCreatedResponse({
      description: 'Purchase created successfully.',
    })
    @ApiBadRequestResponse({
      description: 'Invalid purchase data.',
    })
    @ApiUnauthorizedResponse({
      description: 'Authentication required.',
    })
    create(
      @Req() request: AuthenticatedRequest,
      @Body() dto: CreatePurchaseDto,
    ) {
      return this.purchasesService.create(request.user.id, dto);
    }
  
    @Get('my')
    @ApiOperation({
      summary: 'Get current user purchases',
    })
    @ApiOkResponse({
      description: 'Purchases returned successfully.',
    })
    @ApiUnauthorizedResponse({
      description: 'Authentication required.',
    })
    findMine(@Req() request: AuthenticatedRequest) {
      return this.purchasesService.findMine(request.user.id);
    }
  
    @Get(':id')
    @ApiOperation({
      summary: 'Get purchase by ID',
    })
    @ApiParam({
      name: 'id',
      description: 'Purchase UUID',
    })
    @ApiOkResponse({
      description: 'Purchase returned successfully.',
    })
    @ApiNotFoundResponse({
      description: 'Purchase not found.',
    })
    @ApiUnauthorizedResponse({
      description: 'Authentication required.',
    })
    findOne(
      @Req() request: AuthenticatedRequest,
      @Param('id', ParseUUIDPipe) id: string,
    ) {
      return this.purchasesService.findOne(request.user.id, id);
    }
  
    @Patch(':id/cancel')
    @ApiOperation({
      summary: 'Cancel a purchase',
    })
    @ApiParam({
      name: 'id',
      description: 'Purchase UUID',
    })
    @ApiOkResponse({
      description: 'Purchase cancelled successfully.',
    })
    @ApiNotFoundResponse({
      description: 'Purchase not found.',
    })
    @ApiUnauthorizedResponse({
      description: 'Authentication required.',
    })
    cancel(
      @Req() request: AuthenticatedRequest,
      @Param('id', ParseUUIDPipe) id: string,
    ) {
      return this.purchasesService.cancel(request.user.id, id);
    }
  }