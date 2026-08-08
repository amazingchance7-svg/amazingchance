import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export type CreateStripePaymentIntentInput = {
  amountMinor: number;
  currency: string;
  paymentId: string;
  purchaseId: string;
  idempotencyKey: string;
};

@Injectable()
export class StripeClient {
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | null;

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
        ? new Stripe(secretKey)
        : null;

    this.webhookSecret =
      webhookSecret ?? null;
  }

  async createPaymentIntent(
    input: CreateStripePaymentIntentInput,
  ): Promise<Stripe.PaymentIntent> {
    const stripe = this.requireStripe();

    return stripe.paymentIntents.create(
      {
        amount: input.amountMinor,
        currency:
          input.currency.toLowerCase(),
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          paymentId: input.paymentId,
          purchaseId:
            input.purchaseId,
        },
      },
      {
        idempotencyKey:
          input.idempotencyKey,
      },
    );
  }

  async retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent> {
    const stripe = this.requireStripe();

    return stripe.paymentIntents.retrieve(
      paymentIntentId,
    );
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
  ): Stripe.Event {
    const stripe = this.requireStripe();

    if (!this.webhookSecret) {
      throw new ServiceUnavailableException(
        'Stripe webhook integration is not configured',
      );
    }

    try {
      return stripe.webhooks.constructEvent(
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

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Stripe payment integration is not configured',
      );
    }

    return this.stripe;
  }
}
