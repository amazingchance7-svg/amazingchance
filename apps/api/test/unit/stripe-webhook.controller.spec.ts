import 'reflect-metadata';

import { StripeWebhookController } from '../../src/payments/stripe-webhook.controller';

describe(
  'StripeWebhookController security contract',
  () => {
    it(
      'enforces a bounded throttle policy for Stripe webhook ingress',
      () => {
        const skip =
          Reflect.getMetadata(
            'THROTTLER:SKIPdefault',
            StripeWebhookController,
          );

        const limit =
          Reflect.getMetadata(
            'THROTTLER:LIMITdefault',
            StripeWebhookController,
          );

        const ttl =
          Reflect.getMetadata(
            'THROTTLER:TTLdefault',
            StripeWebhookController,
          );

        expect(skip).not.toBe(true);

        expect(limit).toBe(
          120,
        );

        expect(ttl).toBe(
          60_000,
        );
      },
    );
  },
);
