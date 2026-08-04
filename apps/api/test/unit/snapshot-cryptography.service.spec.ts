import { createHash } from 'node:crypto';

import { SnapshotCryptographyService } from '../../src/snapshots/snapshot-cryptography.service';

describe('SnapshotCryptographyService', () => {
  let service: SnapshotCryptographyService;

  beforeEach(() => {
    service = new SnapshotCryptographyService();
  });

  function sha256(value: string): string {
    return createHash('sha256')
      .update(value, 'utf8')
      .digest('hex');
  }

  it('creates a deterministic snapshot commitment', () => {
    const entries = [
      {
        position: 1n,
        ticketPublicId: 'TKT-001',
        ownerPublicRef: 'owner-a',
      },
      {
        position: 2n,
        ticketPublicId: 'TKT-002',
        ownerPublicRef: 'owner-b',
      },
    ];

    const first = service.createCommitment(
      'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
      'draw-1',
      entries,
    );

    const second = service.createCommitment(
      'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
      'draw-1',
      entries,
    );

    expect(second).toEqual(first);
    expect(first.snapshotHash).toHaveLength(64);
    expect(first.merkleRoot).toHaveLength(64);
    expect(first.leafHashes).toHaveLength(2);
  });

  it('changes the commitment when an entry changes', () => {
    const original = service.createCommitment(
      'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
      'draw-1',
      [
        {
          position: 1n,
          ticketPublicId: 'TKT-001',
          ownerPublicRef: 'owner-a',
        },
      ],
    );

    const changed = service.createCommitment(
      'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
      'draw-1',
      [
        {
          position: 1n,
          ticketPublicId: 'TKT-001',
          ownerPublicRef: 'owner-b',
        },
      ],
    );

    expect(changed.snapshotHash).not.toBe(
      original.snapshotHash,
    );
    expect(changed.merkleRoot).not.toBe(
      original.merkleRoot,
    );
  });

  it('changes the commitment when entry order changes', () => {
    const first = service.createCommitment(
      'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
      'draw-1',
      [
        {
          position: 1n,
          ticketPublicId: 'TKT-001',
          ownerPublicRef: 'owner-a',
        },
        {
          position: 2n,
          ticketPublicId: 'TKT-002',
          ownerPublicRef: 'owner-b',
        },
      ],
    );

    const reordered = service.createCommitment(
      'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
      'draw-1',
      [
        {
          position: 2n,
          ticketPublicId: 'TKT-002',
          ownerPublicRef: 'owner-b',
        },
        {
          position: 1n,
          ticketPublicId: 'TKT-001',
          ownerPublicRef: 'owner-a',
        },
      ],
    );

    expect(reordered.snapshotHash).not.toBe(
      first.snapshotHash,
    );
    expect(reordered.merkleRoot).not.toBe(
      first.merkleRoot,
    );
  });

  it('duplicates the final node for an odd number of leaves', () => {
    const result = service.createCommitment(
      'FORMAT',
      'draw-1',
      [
        {
          position: 1n,
          ticketPublicId: 'A',
          ownerPublicRef: 'owner-a',
        },
        {
          position: 2n,
          ticketPublicId: 'B',
          ownerPublicRef: 'owner-b',
        },
        {
          position: 3n,
          ticketPublicId: 'C',
          ownerPublicRef: 'owner-c',
        },
      ],
    );

    const [first, second, third] = result.leafHashes;

    const left = sha256(
      `NODE\n${first}\n${second}`,
    );
    const right = sha256(
      `NODE\n${third}\n${third}`,
    );
    const expectedRoot = sha256(
      `NODE\n${left}\n${right}`,
    );

    expect(result.merkleRoot).toBe(expectedRoot);
  });

  it('creates a stable root for an empty snapshot', () => {
    const result = service.createCommitment(
      'FORMAT',
      'draw-1',
      [],
    );

    expect(result.merkleRoot).toBe(
      sha256('MERKLE_EMPTY'),
    );
    expect(result.leafHashes).toEqual([]);
  });

  it('serializes separator characters without ambiguity', () => {
    const first = service.createCommitment(
      'FORMAT',
      'draw-1',
      [
        {
          position: 1n,
          ticketPublicId: 'A|B',
          ownerPublicRef: 'C',
        },
      ],
    );

    const second = service.createCommitment(
      'FORMAT',
      'draw-1',
      [
        {
          position: 1n,
          ticketPublicId: 'A',
          ownerPublicRef: 'B|C',
        },
      ],
    );

    expect(first.snapshotHash).not.toBe(
      second.snapshotHash,
    );
  });
});