import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

import type {
  WinnerPositionSelectionInput,
  WinnerPositionSelectionResult,
} from './winner-selection.types';

const POSITIVE_INTEGER_PATTERN =
  /^[1-9]\d*$/;

export function selectWinnerPositions(
  input: WinnerPositionSelectionInput,
): WinnerPositionSelectionResult {
  validateSelectionConfiguration(input);

  if (!Array.isArray(input.randomPositions)) {
    throw new BadRequestException(
      'Verified randomness positions must be an array',
    );
  }

  const normalizedPositions =
    input.randomPositions.map(
      (position, index) =>
        normalizeRandomPosition(
          position,
          index,
        ),
    );

  const uniquePositions: bigint[] = [];
  const seenPositions = new Set<string>();

  for (const position of normalizedPositions) {
    if (
      position < 1n ||
      position > input.snapshotEntryCount
    ) {
      throw new ConflictException(
        `Random position ${position.toString()} is outside the finalized snapshot range`,
      );
    }

    const key = position.toString();

    if (seenPositions.has(key)) {
      continue;
    }

    seenPositions.add(key);
    uniquePositions.push(position);

    if (
      uniquePositions.length ===
      input.winnerCount
    ) {
      break;
    }
  }

  if (
    uniquePositions.length <
    input.winnerCount
  ) {
    throw new ConflictException(
      `Verified randomness contains only ${uniquePositions.length} unique valid positions, but ${input.winnerCount} winners are required`,
    );
  }

  return {
    positions: uniquePositions,
    suppliedPositionCount:
      normalizedPositions.length,
    duplicatePositionCount:
      normalizedPositions.length -
      new Set(
        normalizedPositions.map(
          (position) =>
            position.toString(),
        ),
      ).size,
  };
}

function validateSelectionConfiguration(
  input: WinnerPositionSelectionInput,
): void {
  if (
    !Number.isInteger(input.winnerCount) ||
    input.winnerCount < 1
  ) {
    throw new BadRequestException(
      'winnerCount must be a positive integer',
    );
  }

  if (input.snapshotEntryCount < 1n) {
    throw new ConflictException(
      'Finalized snapshot contains no eligible tickets',
    );
  }

  if (
    BigInt(input.winnerCount) >
    input.snapshotEntryCount
  ) {
    throw new ConflictException(
      'winnerCount exceeds the number of eligible snapshot entries',
    );
  }
}

function normalizeRandomPosition(
  value: unknown,
  index: number,
): bigint {
  if (typeof value === 'bigint') {
    return value;
  }

  if (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0
  ) {
    return BigInt(value);
  }

  if (
    typeof value === 'string' &&
    POSITIVE_INTEGER_PATTERN.test(value)
  ) {
    return BigInt(value);
  }

  throw new BadRequestException(
    `Random position at index ${index} must be a positive integer`,
  );
}
