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
  import { Request } from 'express';
  
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import { CreatePurchaseDto } from './dto/create-purchase.dto';
  import { PurchasesService } from './purchases.service';
  
  type AuthenticatedRequest = Request & {
    user: {
      id: string;
    };
  };
  
  @Controller('purchases')
  @UseGuards(JwtAuthGuard)
  export class PurchasesController {
    constructor(
      private readonly purchasesService: PurchasesService,
    ) {}
  
    @Post()
    create(
      @Req() request: AuthenticatedRequest,
      @Body() dto: CreatePurchaseDto,
    ) {
      return this.purchasesService.create(request.user.id, dto);
    }
  
    @Get('my')
    findMine(@Req() request: AuthenticatedRequest) {
      return this.purchasesService.findMine(request.user.id);
    }
  
    @Get(':id')
    findOne(
      @Req() request: AuthenticatedRequest,
      @Param('id', ParseUUIDPipe) id: string,
    ) {
      return this.purchasesService.findOne(request.user.id, id);
    }
  
    @Patch(':id/cancel')
    cancel(
      @Req() request: AuthenticatedRequest,
      @Param('id', ParseUUIDPipe) id: string,
    ) {
      return this.purchasesService.cancel(request.user.id, id);
    }
  }