import 'reflect-metadata';

import {
  validateEnvironment,
} from '../../src/config/environment.validation';

const strongAccessSecret =
  'A7v!mQ2#xP9$kL4@cR8%tY5&nW3*zH6+';

const strongRefreshSecret =
  'B8w@nR3$yQ7!mK5#dT9%uZ4&jX2*pL6+';

const strongSnapshotSecret =
  'C9x#pS4!zR8@mN6$eU2%vA7&kY5*qJ3+';

const base = {
  NODE_ENV:
    'production',
  API_PORT:
    3001,
  DATABASE_URL:
    'postgresql://amazing_chance_runtime:runtime-password@db.internal.example:5432/amazing_chance?schema=public&sslmode=require',
  PAYMENT_DATABASE_URL:
    'postgresql://amazing_chance_payment_runtime:payment-password@db.internal.example:5432/amazing_chance?schema=public&sslmode=require',
  DRAW_DATABASE_URL:
    'postgresql://amazing_chance_draw_runtime:draw-password@db.internal.example:5432/amazing_chance?schema=public&sslmode=require',
  CLAIM_DATABASE_URL:
    'postgresql://amazing_chance_claim_runtime:claim-password@db.internal.example:5432/amazing_chance?schema=public&sslmode=require',
  PAYOUT_DATABASE_URL:
    'postgresql://amazing_chance_payout_runtime:payout-password@db.internal.example:5432/amazing_chance?schema=public&sslmode=require',
  REDIS_URL:
    'rediss://default:redis-password@redis.internal.example:6380',
  WEB_URL:
    'https://amazing-chance.com',
  JWT_ACCESS_SECRET:
    strongAccessSecret,
  JWT_REFRESH_SECRET:
    strongRefreshSecret,
  SNAPSHOT_OWNER_SECRET:
    strongSnapshotSecret,
  MFA_ENCRYPTION_KEY:
    Buffer
      .from(
        '0123456789abcdef0123456789abcdef',
      )
      .toString(
        'base64',
      ),
  EMAIL_PROVIDER:
    'resend',
  RESEND_API_KEY:
    ['re', 'SEC013ProductionKey'].join('_'),
  EMAIL_FROM:
    'noreply@amazing-chance.com',  STRIPE_SECRET_KEY:
    ['sk', 'live', 'SEC012ProductionExampleKey'].join('_'),
  STRIPE_WEBHOOK_SECRET:
    'whsec_SEC012ProductionExampleSecret',
};

describe(
  'production environment edge security',
  () => {
    it(
      'accepts a hardened production configuration',
      () => {
        expect(
          validateEnvironment(
            base,
          ),
        ).toMatchObject({
          WEB_URL:
            'https://amazing-chance.com',
        });
      },
    );

    it(
      'rejects migration credentials in the production API runtime',
      () => {
        expect(() =>
          validateEnvironment({
            ...base,
            MIGRATION_DATABASE_URL:
              'postgresql://migration-user:migration-password@db.internal.example:5432/amazing_chance',
          }),
        ).toThrow(
          'Migration/admin database credentials must not be present in the production API runtime',
        );
      },
    );

    it(
      'rejects test admin credentials in the production API runtime',
      () => {
        expect(() =>
          validateEnvironment({
            ...base,
            TEST_ADMIN_DATABASE_URL:
              'postgresql://test-admin:test-password@db.internal.example:5432/amazing_chance',
          }),
        ).toThrow(
          'Migration/admin database credentials must not be present in the production API runtime',
        );
      },
    );
    it(
      'rejects HTTP WEB_URL',
      () => {
        expect(() =>
          validateEnvironment({
            ...base,
            WEB_URL:
              'http://amazing-chance.com',
          }),
        ).toThrow(
          'WEB_URL must use https in production',
        );
      },
    );

    it(
      'rejects a privileged PostgreSQL runtime identity',
      () => {
        expect(() =>
          validateEnvironment({
            ...base,
            DATABASE_URL:
              'postgresql://postgres:password@db.internal.example:5432/amazing_chance',
          }),
        ).toThrow(
          'dedicated least-privilege runtime database user',
        );
      },
    );

    it(
      'rejects localhost PostgreSQL in production',
      () => {
        expect(() =>
          validateEnvironment({
            ...base,
            DATABASE_URL:
              'postgresql://amazing_chance_runtime:password@localhost:5432/amazing_chance',
          }),
        ).toThrow(
          'DATABASE_URL cannot target localhost in production',
        );
      },
    );

    it(
      'requires every isolated database URL in production',
      () => {
        expect(() =>
          validateEnvironment({
            ...base,
            PAYMENT_DATABASE_URL:
              undefined,
          }),
        ).toThrow(
          'PAYMENT_DATABASE_URL is required in production',
        );
      },
    );

    it(
      'rejects reuse of one database identity across security domains',
      () => {
        expect(() =>
          validateEnvironment({
            ...base,
            PAYMENT_DATABASE_URL:
              base.DATABASE_URL,
          }),
        ).toThrow(
          'must use distinct database users',
        );
      },
    );

    it(
      'rejects privileged identity in a specialized database domain',
      () => {
        expect(() =>
          validateEnvironment({
            ...base,
            DRAW_DATABASE_URL:
              'postgresql://postgres:password@db.internal.example:5432/amazing_chance',
          }),
        ).toThrow(
          'DRAW_DATABASE_URL must use a dedicated least-privilege runtime database user',
        );
      },
    );

    it(
      'requires TLS Redis in production',
      () => {
        expect(() =>
          validateEnvironment({
            ...base,
            REDIS_URL:
              'redis://redis.internal.example:6379',
          }),
        ).toThrow(
          'REDIS_URL must use rediss:// in production',
        );
      },
    );

    it(
      'rejects placeholder production secrets',
      () => {
        expect(() =>
          validateEnvironment({
            ...base,
            SNAPSHOT_OWNER_SECRET:
              'replace_with_at_least_32_random_bytes',
          }),
        ).toThrow(
          'SNAPSHOT_OWNER_SECRET contains a placeholder',
        );
      },
    );

    it(
      'rejects low-diversity production JWT secrets',
      () => {
        expect(() =>
          validateEnvironment({
            ...base,
            JWT_ACCESS_SECRET:
              'a'.repeat(32),
          }),
        ).toThrow(
          'JWT_ACCESS_SECRET must contain sufficient character diversity',
        );
      },
    );

    it(
      'requires canonical 32-byte MFA encryption material',
      () => {
        expect(() =>
          validateEnvironment({
            ...base,
            MFA_ENCRYPTION_KEY:
              Buffer
                .alloc(31)
                .toString(
                  'base64',
                ),
          }),
        ).toThrow(
          'MFA_ENCRYPTION_KEY must be canonical base64 encoding of exactly 32 bytes',
        );
      },
    );

    it(
      'requires production email delivery configuration',
      () => {
        expect(() =>
          validateEnvironment({
            ...base,
            EMAIL_PROVIDER:
              undefined,
          }),
        ).toThrow(
          'EMAIL_PROVIDER must be resend in production',
        );

        expect(() =>
          validateEnvironment({
            ...base,
            RESEND_API_KEY:
              undefined,
          }),
        ).toThrow(
          'RESEND_API_KEY is required',
        );

        expect(() =>
          validateEnvironment({
            ...base,
            EMAIL_FROM:
              'invalid-sender',
          }),
        ).toThrow(
          'EMAIL_FROM must be a valid sender email address in production',
        );
      },
    );
    it(
      'requires a live Stripe secret in production',
      () => {
        expect(() =>
          validateEnvironment({
            ...base,
            STRIPE_SECRET_KEY:
              ['sk', 'test', 'not', 'allowed', 'in', 'production'].join('_'),
          }),
        ).toThrow(
          'STRIPE_SECRET_KEY must be a live-mode key in production',
        );
      },
    );
  },
);
