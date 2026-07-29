import { randomUUID } from 'node:crypto';

export function createIdempotencyKey(): string {
  return randomUUID();
}

export function createCorrelationId(): string {
  return randomUUID();
}

export function createPublicId(prefix: string): string {
  const normalizedPrefix = prefix.trim().toUpperCase();

  if (!/^[A-Z0-9]+$/.test(normalizedPrefix)) {
    throw new Error('Public ID prefix must contain only letters and numbers');
  }

  const randomPart = randomUUID()
    .replaceAll('-', '')
    .slice(0, 16)
    .toUpperCase();

  return `${normalizedPrefix}-${randomPart}`;
}