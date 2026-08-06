import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

import {
  selectWinnerPositions,
} from '../../src/winners/winner-selection.util';

describe('winner selection utilities', () => {
  it('selects the requested number of positions in provider order', () => {
    const result =
      selectWinnerPositions({
        randomPositions: [
          7,
          '2',
          9n,
          4,
        ],
        winnerCount: 3,
        snapshotEntryCount: 10n,
      });

    expect(result).toEqual({
      positions: [7n, 2n, 9n],
      suppliedPositionCount: 4,
      duplicatePositionCount: 0,
    });
  });

  it('skips duplicate positions while preserving deterministic order', () => {
    const result =
      selectWinnerPositions({
        randomPositions: [
          3,
          '3',
          5,
          3n,
          8,
        ],
        winnerCount: 3,
        snapshotEntryCount: 10n,
      });

    expect(result.positions).toEqual([
      3n,
      5n,
      8n,
    ]);

    expect(
      result.duplicatePositionCount,
    ).toBe(2);
  });

  it('rejects malformed randomness data', () => {
    expect(() =>
      selectWinnerPositions({
        randomPositions: {
          position: 1,
        },
        winnerCount: 1,
        snapshotEntryCount: 10n,
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      selectWinnerPositions({
        randomPositions: [
          1,
          'invalid',
        ],
        winnerCount: 1,
        snapshotEntryCount: 10n,
      }),
    ).toThrow(
      'Random position at index 1 must be a positive integer',
    );
  });

  it('rejects unsafe or non-positive numeric positions', () => {
    expect(() =>
      selectWinnerPositions({
        randomPositions: [0],
        winnerCount: 1,
        snapshotEntryCount: 10n,
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      selectWinnerPositions({
        randomPositions: [
          Number.MAX_SAFE_INTEGER + 1,
        ],
        winnerCount: 1,
        snapshotEntryCount: 10n,
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects positions outside the finalized snapshot range', () => {
    expect(() =>
      selectWinnerPositions({
        randomPositions: [
          1,
          11,
        ],
        winnerCount: 2,
        snapshotEntryCount: 10n,
      }),
    ).toThrow(
      'Random position 11 is outside the finalized snapshot range',
    );
  });

  it('rejects insufficient unique positions', () => {
    expect(() =>
      selectWinnerPositions({
        randomPositions: [
          2,
          2,
          2,
        ],
        winnerCount: 2,
        snapshotEntryCount: 10n,
      }),
    ).toThrow(
      'Verified randomness contains only 1 unique valid positions, but 2 winners are required',
    );
  });

  it('rejects an empty finalized snapshot', () => {
    expect(() =>
      selectWinnerPositions({
        randomPositions: [1],
        winnerCount: 1,
        snapshotEntryCount: 0n,
      }),
    ).toThrow(
      ConflictException,
    );
  });

  it('rejects winnerCount larger than the eligible ticket count', () => {
    expect(() =>
      selectWinnerPositions({
        randomPositions: [
          1,
          2,
          3,
        ],
        winnerCount: 3,
        snapshotEntryCount: 2n,
      }),
    ).toThrow(
      'winnerCount exceeds the number of eligible snapshot entries',
    );
  });

  it('rejects invalid winnerCount values', () => {
    expect(() =>
      selectWinnerPositions({
        randomPositions: [1],
        winnerCount: 0,
        snapshotEntryCount: 10n,
      }),
    ).toThrow(
      'winnerCount must be a positive integer',
    );

    expect(() =>
      selectWinnerPositions({
        randomPositions: [1],
        winnerCount: 1.5,
        snapshotEntryCount: 10n,
      }),
    ).toThrow(
      'winnerCount must be a positive integer',
    );
  });
});
