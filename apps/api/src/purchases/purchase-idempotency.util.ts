import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';

const MIN_KEY_LENGTH = 8;
const MAX_KEY_LENGTH = 128;
const ALLOWED_KEY_PATTERN =
  /^[A-Za-z0-9._:-]+$/;

export function normalizeIdempotencyKey(
  value: string | undefined,
): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new BadRequestException(
      'Idempotency-Key header is required',
    );
  }

  if (
    normalized.length < MIN_KEY_LENGTH ||
    normalized.length > MAX_KEY_LENGTH
  ) {
    throw new BadRequestException(
      `Idempotency-Key must be between ${MIN_KEY_LENGTH} and ${MAX_KEY_LENGTH} characters`,
    );
  }

  if (!ALLOWED_KEY_PATTERN.test(normalized)) {
    throw new BadRequestException(
      'Idempotency-Key contains unsupported characters',
    );
  }

  return normalized;
}

export function createScopedIdempotencyKey(
  userId: string,
  suppliedKey: string,
): string {
  return createHash('sha256')
    .update(
      `${userId}:${suppliedKey}`,
      'utf8',
    )
    .digest('hex');
}
