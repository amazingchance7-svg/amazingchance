import { BadRequestException } from '@nestjs/common';

import {
  createScopedIdempotencyKey,
  normalizeIdempotencyKey,
} from '../../src/purchases/purchase-idempotency.util';

describe('purchase idempotency utilities', () => {
  it('normalizes a valid key', () => {
    expect(
      normalizeIdempotencyKey(
        '  purchase-key-001  ',
      ),
    ).toBe('purchase-key-001');
  });

  it('rejects a missing key', () => {
    expect(() =>
      normalizeIdempotencyKey(undefined),
    ).toThrow(BadRequestException);
  });

  it('rejects keys that are too short', () => {
    expect(() =>
      normalizeIdempotencyKey('short'),
    ).toThrow(
      'Idempotency-Key must be between 8 and 128 characters',
    );
  });

  it('rejects unsupported characters', () => {
    expect(() =>
      normalizeIdempotencyKey(
        'purchase key with spaces',
      ),
    ).toThrow(
      'Idempotency-Key contains unsupported characters',
    );
  });

  it('creates stable user-scoped hashes', () => {
    const first =
      createScopedIdempotencyKey(
        'user-1',
        'purchase-key-001',
      );

    const retry =
      createScopedIdempotencyKey(
        'user-1',
        'purchase-key-001',
      );

    const otherUser =
      createScopedIdempotencyKey(
        'user-2',
        'purchase-key-001',
      );

    expect(first).toBe(retry);
    expect(first).not.toBe(otherUser);
    expect(first).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });
});
