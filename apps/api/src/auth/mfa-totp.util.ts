import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const BASE32_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;

export interface EncryptedTotpSecret {
  encryptedSecret: string;
  encryptionIv: string;
  authTag: string;
}

export function generateTotpSecret(): Buffer {
  return randomBytes(20);
}

export function encodeBase32(
  input: Buffer,
): string {
  let bits = '';

  for (const byte of input) {
    bits += byte
      .toString(2)
      .padStart(8, '0');
  }

  let output = '';

  for (
    let offset = 0;
    offset < bits.length;
    offset += 5
  ) {
    const chunk =
      bits.slice(offset, offset + 5)
        .padEnd(5, '0');

    output +=
      BASE32_ALPHABET[
        Number.parseInt(chunk, 2)
      ];
  }

  return output;
}

export function generateTotpCode(
  secret: Buffer,
  timestampMs = Date.now(),
  digits = TOTP_DIGITS,
): string {
  const counter =
    Math.floor(
      timestampMs /
        1000 /
        TOTP_STEP_SECONDS,
    );

  const counterBuffer =
    Buffer.alloc(8);

  counterBuffer.writeBigUInt64BE(
    BigInt(counter),
  );

  const digest =
    createHmac('sha1', secret)
      .update(counterBuffer)
      .digest();

  const offset =
    digest[digest.length - 1] &
    0x0f;

  const binary =
    (
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)
    ) >>> 0;

  const modulo =
    10 ** digits;

  return String(
    binary % modulo,
  ).padStart(digits, '0');
}

export function verifyTotpCode(
  secret: Buffer,
  code: string,
  timestampMs = Date.now(),
  window = 1,
): boolean {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  const supplied =
    Buffer.from(code);

  for (
    let offset = -window;
    offset <= window;
    offset += 1
  ) {
    const candidate =
      generateTotpCode(
        secret,
        timestampMs +
          offset *
            TOTP_STEP_SECONDS *
            1000,
      );

    const candidateBuffer =
      Buffer.from(candidate);

    if (
      candidateBuffer.length ===
        supplied.length &&
      timingSafeEqual(
        candidateBuffer,
        supplied,
      )
    ) {
      return true;
    }
  }

  return false;
}

export function decodeMfaEncryptionKey(
  value: string,
): Buffer {
  const key =
    Buffer.from(value, 'base64');

  if (key.length !== 32) {
    throw new Error(
      'MFA_ENCRYPTION_KEY must decode to exactly 32 bytes',
    );
  }

  return key;
}

export function encryptTotpSecret(
  secret: Buffer,
  key: Buffer,
): EncryptedTotpSecret {
  if (key.length !== 32) {
    throw new Error(
      'MFA encryption key must be 32 bytes',
    );
  }

  const iv = randomBytes(12);

  const cipher =
    createCipheriv(
      'aes-256-gcm',
      key,
      iv,
    );

  const encrypted =
    Buffer.concat([
      cipher.update(secret),
      cipher.final(),
    ]);

  return {
    encryptedSecret:
      encrypted.toString('base64'),
    encryptionIv:
      iv.toString('base64'),
    authTag:
      cipher
        .getAuthTag()
        .toString('base64'),
  };
}

export function decryptTotpSecret(
  encrypted: EncryptedTotpSecret,
  key: Buffer,
): Buffer {
  if (key.length !== 32) {
    throw new Error(
      'MFA encryption key must be 32 bytes',
    );
  }

  const decipher =
    createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(
        encrypted.encryptionIv,
        'base64',
      ),
    );

  decipher.setAuthTag(
    Buffer.from(
      encrypted.authTag,
      'base64',
    ),
  );

  return Buffer.concat([
    decipher.update(
      Buffer.from(
        encrypted.encryptedSecret,
        'base64',
      ),
    ),
    decipher.final(),
  ]);
}
