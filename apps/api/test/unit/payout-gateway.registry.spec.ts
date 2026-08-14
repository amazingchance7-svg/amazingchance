import type {
  PayoutGateway,
} from '../../src/payouts/payout-gateway';
import {
  PayoutGatewayOutcome,
} from '../../src/payouts/payout-gateway';
import {
  PayoutGatewayRegistry,
} from '../../src/payouts/payout-gateway.registry';

function gateway(
  provider: string,
): PayoutGateway {
  return {
    provider,
    execute: jest.fn().mockResolvedValue({
      outcome:
        PayoutGatewayOutcome.SUCCEEDED,
      providerTransactionId:
        'provider-transaction-1',
    }),
  };
}

describe(
  'PayoutGatewayRegistry',
  () => {
    it(
      'resolves providers case-insensitively',
      () => {
        const nuvei =
          gateway('NUVEI');

        const registry =
          new PayoutGatewayRegistry([
            nuvei,
          ]);

        expect(
          registry.require('nuvei'),
        ).toBe(nuvei);

        expect(
          registry.require(' NuVeI '),
        ).toBe(nuvei);
      },
    );

    it(
      'returns null for an unknown provider',
      () => {
        const registry =
          new PayoutGatewayRegistry([
            gateway('NUVEI'),
          ]);

        expect(
          registry.get('UNKNOWN'),
        ).toBeNull();
      },
    );

    it(
      'fails closed when a required provider is missing',
      () => {
        const registry =
          new PayoutGatewayRegistry([]);

        expect(() =>
          registry.require('NUVEI'),
        ).toThrow(
          'Payout gateway is not configured for provider: NUVEI',
        );
      },
    );

    it(
      'rejects duplicate providers',
      () => {
        expect(
          () =>
            new PayoutGatewayRegistry([
              gateway('NUVEI'),
              gateway('nuvei'),
            ]),
        ).toThrow(
          'Duplicate payout gateway provider: NUVEI',
        );
      },
    );

    it(
      'rejects an empty provider name',
      () => {
        expect(
          () =>
            new PayoutGatewayRegistry([
              gateway('   '),
            ]),
        ).toThrow(
          'Payout gateway provider is required',
        );
      },
    );

    it(
      'reports registered providers',
      () => {
        const registry =
          new PayoutGatewayRegistry([
            gateway('NUVEI'),
            gateway('TEST'),
          ]);

        expect(
          registry.providers(),
        ).toEqual([
          'NUVEI',
          'TEST',
        ]);

        expect(
          registry.has('nuvei'),
        ).toBe(true);

        expect(
          registry.has('missing'),
        ).toBe(false);
      },
    );
  },
);
