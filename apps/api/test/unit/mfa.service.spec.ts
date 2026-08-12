import {
  ConfigService,
} from '@nestjs/config';

import { MfaService } from '../../src/auth/mfa.service';
import {
  decryptTotpSecret,
  generateTotpCode,
} from '../../src/auth/mfa-totp.util';
import { PrismaService } from '../../src/prisma/prisma.service';

type StoredCredential = {
  userId: string;
  encryptedSecret: string;
  encryptionIv: string;
  authTag: string;
  enabledAt: Date | null;
};

type UpsertInput = {
  create: Omit<
    StoredCredential,
    'enabledAt'
  > & {
    enabledAt?: Date | null;
  };
  update: Partial<
    StoredCredential
  >;
};

type UpdateInput = {
  data: {
    enabledAt: Date;
  };
};

describe('MfaService', () => {
  const encryptionKey =
    Buffer
      .alloc(32, 11)
      .toString('base64');

  function createHarness() {
    let stored:
      StoredCredential | null =
      null;

    const prisma = {
      mfaCredential: {
        findUnique:
          jest.fn(
            async () =>
              stored,
          ),
        upsert:
          jest.fn(
            async ({
              create,
              update,
            }: UpsertInput) => {
              stored =
                stored
                  ? {
                      ...stored,
                      ...update,
                    }
                  : {
                      ...create,
                      enabledAt:
                        create
                          .enabledAt ??
                        null,
                    };

              return stored;
            },
          ),
        update:
          jest.fn(
            async ({
              data,
            }: UpdateInput) => {
              if (!stored) {
                throw new Error(
                  'missing credential',
                );
              }

              stored = {
                ...stored,
                ...data,
              };

              return stored;
            },
          ),
        delete:
          jest.fn(
            async () => {
              const previous =
                stored;

              stored = null;

              return previous;
            },
          ),
      },
    };

    const config = {
      getOrThrow:
        jest.fn(
          () =>
            encryptionKey,
        ),
    } as unknown as ConfigService;

    const service =
      new MfaService(
        prisma as unknown as PrismaService,
        config,
      );

    return {
      service,
      readStored: () =>
        stored,
    };
  }

  it('stores only encrypted TOTP material during setup', async () => {
    const harness =
      createHarness();

    const setup =
      await harness.service
        .startSetup(
          'user-1',
          'admin@example.com',
        );

    const stored =
      harness.readStored();

    expect(setup.secret).toMatch(
      /^[A-Z2-7]+$/,
    );

    expect(setup.otpauthUri).toContain(
      'otpauth://totp/',
    );

    expect(stored).not.toBeNull();

    if (!stored) {
      throw new Error(
        'credential not created',
      );
    }

    expect(
      stored.encryptedSecret,
    ).not.toContain(
      setup.secret,
    );

    expect(
      stored.enabledAt,
    ).toBeNull();
  });

  it('requires a valid TOTP before enabling MFA', async () => {
    const harness =
      createHarness();

    await harness.service
      .startSetup(
        'user-2',
        'owner@example.com',
      );

    const stored =
      harness.readStored();

    if (!stored) {
      throw new Error(
        'credential not created',
      );
    }

    const secret =
      decryptTotpSecret(
        stored,
        Buffer.from(
          encryptionKey,
          'base64',
        ),
      );

    const code =
      generateTotpCode(
        secret,
      );

    await expect(
      harness.service.enable(
        'user-2',
        '000000',
      ),
    ).rejects.toThrow(
      'Invalid MFA code',
    );

    const result =
      await harness.service
        .enable(
          'user-2',
          code,
        );

    expect(
      result.enabledAt,
    ).toBeInstanceOf(Date);

    await expect(
      harness.service.verify(
        'user-2',
        code,
      ),
    ).resolves.toBe(true);
  });
});
