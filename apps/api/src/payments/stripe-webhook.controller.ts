import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type {
  Request,
} from 'express';

import { StripeWebhookService } from './stripe-webhook.service';

@ApiTags('payments')
@Controller(
  'payments/webhooks/stripe',
)
@SkipThrottle()
export class StripeWebhookController {
  constructor(
    private readonly service:
      StripeWebhookService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Receive a signed Stripe webhook event',
  })
  @ApiOkResponse({
    description:
      'Stripe webhook processed or safely deduplicated.',
  })
  @ApiBadRequestResponse({
    description:
      'Webhook body or Stripe-Signature header is missing or invalid.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Stripe webhook signature verification failed.',
  })
  handle(
    @Req()
    request:
      RawBodyRequest<Request>,
    @Headers(
      'stripe-signature',
    )
    signature:
      string | undefined,
  ) {
    if (
      !request.rawBody
    ) {
      throw new BadRequestException(
        'Raw webhook body is required',
      );
    }

    return this.service.handle(
      request.rawBody,
      signature,
    );
  }
}
