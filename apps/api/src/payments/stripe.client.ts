import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeClient {
  private readonly stripe:
    | Stripe
    | null;

  private readonly webhookSecret:
    | string
    | null;

  constructor(
    configService: ConfigService,
  ) {
    const secretKey =
      configService.get<string>(
        'STRIPE_SECRET_KEY',
      );

    const webhookSecret =
      configService.get<string>(
        'STRIPE_WEBHOOK_SECRET',
      );

    this.stripe =
      secretKey
        ? new Stripe(
            secretKey,
          )
        : null;

    this.webhookSecret =
      webhookSecret ??
      null;
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
  ): Stripe.Event {
    if (
      !this.stripe ||
      !this.webhookSecret
    ) {
      throw new ServiceUnavailableException(
        'Stripe webhook integration is not configured',
      );
    }

    try {
      return this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch {
      throw new UnauthorizedException(
        'Invalid Stripe webhook signature',
      );
    }
  }
}
