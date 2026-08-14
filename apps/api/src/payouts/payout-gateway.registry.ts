import {
  Inject,
  Injectable,
} from '@nestjs/common';

import {
  PAYOUT_GATEWAYS,
  type PayoutGateway,
} from './payout-gateway';

@Injectable()
export class PayoutGatewayRegistry {
  private readonly gateways:
    ReadonlyMap<string, PayoutGateway>;

  constructor(
    @Inject(PAYOUT_GATEWAYS)
    gateways: readonly PayoutGateway[],
  ) {
    const registered =
      new Map<string, PayoutGateway>();

    for (const gateway of gateways) {
      const provider =
        this.normalizeProvider(
          gateway.provider,
        );

      if (!provider) {
        throw new Error(
          'Payout gateway provider is required',
        );
      }

      if (registered.has(provider)) {
        throw new Error(
          `Duplicate payout gateway provider: ${provider}`,
        );
      }

      registered.set(
        provider,
        gateway,
      );
    }

    this.gateways = registered;
  }

  get(
    provider: string,
  ): PayoutGateway | null {
    const normalized =
      this.normalizeProvider(provider);

    if (!normalized) {
      return null;
    }

    return (
      this.gateways.get(normalized) ??
      null
    );
  }

  require(
    provider: string,
  ): PayoutGateway {
    const gateway =
      this.get(provider);

    if (!gateway) {
      throw new Error(
        `Payout gateway is not configured for provider: ${provider}`,
      );
    }

    return gateway;
  }

  has(
    provider: string,
  ): boolean {
    return this.get(provider) !== null;
  }

  providers(): string[] {
    return [
      ...this.gateways.keys(),
    ];
  }

  private normalizeProvider(
    provider: string,
  ): string {
    return provider
      .trim()
      .toUpperCase();
  }
}
