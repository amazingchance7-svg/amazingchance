import {
  decodeMfaEncryptionKey,
  decryptTotpSecret,
  encodeBase32,
  encryptTotpSecret,
  generateTotpCode,
  verifyTotpCode,
} from '../../src/auth/mfa-totp.util';

describe('MFA TOTP cryptography', () => {
  it('matches RFC 6238 SHA-1 vectors', () => {
    const secret =
      Buffer.from(
        '12345678901234567890',
        'ascii',
      );

    expect(
      generateTotpCode(
        secret,
        59_000,
        8,
      ),
    ).toBe('94287082');

    expect(
      generateTotpCode(
        secret,
        1_111_111_109_000,
        8,
      ),
    ).toBe('07081804');
  });

  it('verifies six-digit TOTP with a one-step window', () => {
    const secret =
      Buffer.from(
        '12345678901234567890',
        'ascii',
      );

    const now =
      1_700_000_000_000;

    const code =
      generateTotpCode(
        secret,
        now,
      );

    expect(
      verifyTotpCode(
        secret,
        code,
        now,
      ),
    ).toBe(true);

    expect(
      verifyTotpCode(
        secret,
        code,
        now + 31_000,
      ),
    ).toBe(true);

    expect(
      verifyTotpCode(
        secret,
        'not-a-code',
        now,
      ),
    ).toBe(false);
  });

  it('round-trips a secret through AES-256-GCM without plaintext storage', () => {
    const key =
      decodeMfaEncryptionKey(
        Buffer
          .alloc(32, 7)
          .toString('base64'),
      );

    const secret =
      Buffer.from(
        'privileged-mfa-secret',
      );

    const encrypted =
      encryptTotpSecret(
        secret,
        key,
      );

    expect(
      encrypted.encryptedSecret,
    ).not.toContain(
      secret.toString('utf8'),
    );

    expect(
      decryptTotpSecret(
        encrypted,
        key,
      ),
    ).toEqual(secret);
  });

  it('encodes RFC-compatible Base32', () => {
    expect(
      encodeBase32(
        Buffer.from('foo'),
      ),
    ).toBe('MZXW6');
  });
});
