import { createHash } from 'node:crypto';

type JsonPrimitive =
  | string
  | number
  | boolean
  | null;

type CanonicalJsonValue =
  | JsonPrimitive
  | CanonicalJsonValue[]
  | {
      [key: string]:
        CanonicalJsonValue;
    };

function canonicalizeValue(
  value: unknown,
): CanonicalJsonValue {
  if (value === null) {
    return null;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (
    typeof value === 'number'
  ) {
    if (!Number.isFinite(value)) {
      throw new TypeError(
        'Canonical JSON cannot contain non-finite numbers',
      );
    }

    return Object.is(value, -0)
      ? 0
      : value;
  }

  if (Array.isArray(value)) {
    return value.map(
      (item) =>
        canonicalizeValue(item),
    );
  }

  if (
    typeof value === 'object'
  ) {
    const source =
      value as Record<
        string,
        unknown
      >;

    const result: {
      [key: string]:
        CanonicalJsonValue;
    } = {};

    for (
      const key of
      Object.keys(source).sort()
    ) {
      const item =
        source[key];

      if (item === undefined) {
        continue;
      }

      result[key] =
        canonicalizeValue(
          item,
        );
    }

    return result;
  }

  throw new TypeError(
    `Unsupported canonical JSON value type: ${typeof value}`,
  );
}

export function canonicalJsonStringify(
  value: unknown,
): string {
  return JSON.stringify(
    canonicalizeValue(value),
  );
}

export function sha256CanonicalJson(
  value: unknown,
): string {
  return createHash('sha256')
    .update(
      canonicalJsonStringify(value),
      'utf8',
    )
    .digest('hex');
}
