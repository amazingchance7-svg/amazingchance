import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestContextRequest } from '../common/types/request-context.type';
import { StripePaymentIntentService } from '../payments/stripe-payment-intent.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { PurchasesService } from './purchases.service';

type AuthenticatedRequest =
  RequestContextRequest & {
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
    private readonly purchasesService:
      PurchasesService,
    private readonly stripePaymentIntentService:
      StripePaymentIntentService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a purchase',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'Unique key for safely retrying this purchase request',
    example:
      'purchase-550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiCreatedResponse({
    description:
      'Purchase created or existing idempotent result returned.',
  })
  @ApiBadRequestResponse({
    description:
      'Invalid purchase data or missing Idempotency-Key.',
  })
  @ApiConflictResponse({
    description:
      'The Idempotency-Key was already used with a different request.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication required.',
  })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreatePurchaseDto,
    @Headers('idempotency-key')
    idempotencyKey: string | undefined,
  ) {
    return this.purchasesService.create(
      request.user.id,
      dto,
      idempotencyKey,
    );
  }

  @Post(':id/payment-intent')
  @ApiOperation({
    summary:
      'Create or resume the Stripe PaymentIntent for a purchase',
  })
  @ApiParam({
    name: 'id',
    description:
      'Purchase UUID',
  })
  @ApiOkResponse({
    description:
      'Stripe PaymentIntent created or resumed successfully.',
  })
  @ApiConflictResponse({
    description:
      'Purchase cannot currently start or resume a Stripe payment.',
  })
  @ApiNotFoundResponse({
    description:
      'Purchase not found.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication required.',
  })
  initiateStripePayment(
    @Req() request:
      AuthenticatedRequest,
    @Param(
      'id',
      ParseUUIDPipe,
    )
    id: string,
  ) {
    return this
      .stripePaymentIntentService
      .initiate(
        request.user.id,
        id,
      );
  }

  @Get('my')
  @ApiOperation({
    summary:
      'Get current user purchases',
  })
  @ApiOkResponse({
    description:
      'Purchases returned successfully.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication required.',
  })
  findMine(
    @Req() request: AuthenticatedRequest,
  ) {
    return this.purchasesService.findMine(
      request.user.id,
    );
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
    description:
      'Purchase returned successfully.',
  })
  @ApiNotFoundResponse({
    description:
      'Purchase not found.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication required.',
  })
  findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.purchasesService.findOne(
      request.user.id,
      id,
    );
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
    description:
      'Purchase cancelled successfully.',
  })
  @ApiConflictResponse({
    description:
      'Purchase is no longer eligible for cancellation.',
  })
  @ApiNotFoundResponse({
    description:
      'Purchase not found.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Authentication required.',
  })
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe)
    id: string,
  ) {
    return this.purchasesService.cancel(
      request.user.id,
      id,
    );
  }
}
