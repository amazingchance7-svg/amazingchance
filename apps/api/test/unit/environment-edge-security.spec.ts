import 'reflect-metadata';

import { validateEnvironment } from '../../src/config/environment.validation';

const base = {
  NODE_ENV: 'production',
  API_PORT: 3001,
  DATABASE_URL:
    'postgresql://user:password@localhost:5432/test',
  REDIS_URL:
    'redis://localhost:6379',
  WEB_URL:
    'https://amazing-chance.com',
  JWT_ACCESS_SECRET:
    'a'.repeat(32),
  JWT_REFRESH_SECRET:
    'b'.repeat(32),
  SNAPSHOT_OWNER_SECRET:
    'c'.repeat(32),
  STRIPE_SECRET_KEY:
    'sk_test_example',
  STRIPE_WEBHOOK_SECRET:
    'whsec_example',
};

describe('production environment edge security', () => {
  it('accepts HTTPS WEB_URL', () => {
    expect(
      validateEnvironment(base),
    ).toMatchObject({
      WEB_URL:
        'https://amazing-chance.com',
    });
  });

  it('rejects HTTP WEB_URL', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        WEB_URL:
          'http://amazing-chance.com',
      }),
    ).toThrow(
      'WEB_URL must use https in production',
    );
  });
});
