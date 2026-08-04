import { createHash } from 'node:crypto';

import {
  CanonicalSnapshotEntry,
  SnapshotCryptographyService,
} from '../../src/snapshots/snapshot-cryptography.service';

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

  function createEntries(
    count: number,
  ): CanonicalSnapshotEntry[] {
    return Array.from(
      { length: count },
      (_, index) => ({
        position: BigInt(index + 1),
        ticketPublicId: `TKT-${index + 1}`,
        ownerPublicRef: `owner-${index + 1}`,
      }),
    );
  }

  it('creates a deterministic snapshot commitment', () => {
    const entries = createEntries(2);

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
      [{
        position: 1n,
        ticketPublicId: 'TKT-001',
        ownerPublicRef: 'owner-a',
      }],
    );

    const changed = service.createCommitment(
      'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
      'draw-1',
      [{
        position: 1n,
        ticketPublicId: 'TKT-001',
        ownerPublicRef: 'owner-b',
      }],
    );

    expect(changed.snapshotHash).not.toBe(original.snapshotHash);
    expect(changed.merkleRoot).not.toBe(original.merkleRoot);
  });

  it('changes the commitment when entry order changes', () => {
    const first = service.createCommitment(
      'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
      'draw-1',
      [
        { position: 1n, ticketPublicId: 'TKT-001', ownerPublicRef: 'owner-a' },
        { position: 2n, ticketPublicId: 'TKT-002', ownerPublicRef: 'owner-b' },
      ],
    );

    const reordered = service.createCommitment(
      'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
      'draw-1',
      [
        { position: 2n, ticketPublicId: 'TKT-002', ownerPublicRef: 'owner-b' },
        { position: 1n, ticketPublicId: 'TKT-001', ownerPublicRef: 'owner-a' },
      ],
    );

    expect(reordered.snapshotHash).not.toBe(first.snapshotHash);
    expect(reordered.merkleRoot).not.toBe(first.merkleRoot);
  });

  it('duplicates the final node for an odd number of leaves', () => {
    const result = service.createCommitment(
      'FORMAT',
      'draw-1',
      createEntries(3),
    );

    const [first, second, third] = result.leafHashes;
    const left = sha256(`NODE\n${first}\n${second}`);
    const right = sha256(`NODE\n${third}\n${third}`);
    const expectedRoot = sha256(`NODE\n${left}\n${right}`);

    expect(result.merkleRoot).toBe(expectedRoot);
  });

  it('creates a stable root for an empty snapshot', () => {
    const result = service.createCommitment('FORMAT', 'draw-1', []);

    expect(result.merkleRoot).toBe(sha256('MERKLE_EMPTY'));
    expect(result.leafHashes).toEqual([]);
  });

  it('serializes separator characters without ambiguity', () => {
    const first = service.createCommitment(
      'FORMAT',
      'draw-1',
      [{ position: 1n, ticketPublicId: 'A|B', ownerPublicRef: 'C' }],
    );

    const second = service.createCommitment(
      'FORMAT',
      'draw-1',
      [{ position: 1n, ticketPublicId: 'A', ownerPublicRef: 'B|C' }],
    );

    expect(first.snapshotHash).not.toBe(second.snapshotHash);
  });

  it('creates a leaf hash identical to the commitment leaf hash', () => {
    const entry = createEntries(1)[0];
    const commitment = service.createCommitment('FORMAT', 'draw-1', [entry]);

    expect(service.createLeafHash(entry)).toBe(commitment.leafHashes[0]);
  });

  it('creates and verifies a proof for the first leaf', () => {
    const result = service.createMerkleProof(createEntries(4), 0);

    expect(result.leafIndex).toBe(0);
    expect(result.proof).toHaveLength(2);
    expect(
      service.verifyMerkleProof(
        result.leafHash,
        result.proof,
        result.merkleRoot,
      ),
    ).toBe(true);
  });

  it('creates and verifies a proof for a middle leaf', () => {
    const result = service.createMerkleProof(createEntries(5), 2);

    expect(result.leafIndex).toBe(2);
    expect(
      service.verifyMerkleProof(
        result.leafHash,
        result.proof,
        result.merkleRoot,
      ),
    ).toBe(true);
  });

  it('creates and verifies a proof for the last leaf', () => {
    const result = service.createMerkleProof(createEntries(6), 5);

    expect(result.leafIndex).toBe(5);
    expect(
      service.verifyMerkleProof(
        result.leafHash,
        result.proof,
        result.merkleRoot,
      ),
    ).toBe(true);
  });

  it('creates an empty valid proof for a single leaf', () => {
    const result = service.createMerkleProof(createEntries(1), 0);

    expect(result.proof).toEqual([]);
    expect(result.leafHash).toBe(result.merkleRoot);
    expect(
      service.verifyMerkleProof(
        result.leafHash,
        result.proof,
        result.merkleRoot,
      ),
    ).toBe(true);
  });

  it('creates a valid proof for the duplicated final leaf in an odd tree', () => {
    const result = service.createMerkleProof(createEntries(3), 2);

    expect(result.proof[0]).toEqual({
      hash: result.leafHash,
      side: 'RIGHT',
    });

    expect(
      service.verifyMerkleProof(
        result.leafHash,
        result.proof,
        result.merkleRoot,
      ),
    ).toBe(true);
  });

  it('produces the same root for commitment and proof generation', () => {
    const entries = createEntries(7);
    const commitment = service.createCommitment('FORMAT', 'draw-1', entries);

    for (let index = 0; index < entries.length; index += 1) {
      const proof = service.createMerkleProof(entries, index);
      expect(proof.merkleRoot).toBe(commitment.merkleRoot);
    }
  });

  it('rejects a proof when the leaf hash changes', () => {
    const result = service.createMerkleProof(createEntries(4), 1);

    expect(
      service.verifyMerkleProof(
        'a'.repeat(64),
        result.proof,
        result.merkleRoot,
      ),
    ).toBe(false);
  });

  it('rejects a proof when a sibling hash changes', () => {
    const result = service.createMerkleProof(createEntries(4), 1);
    const corruptedProof = result.proof.map((node, index) =>
      index === 0 ? { ...node, hash: 'b'.repeat(64) } : node,
    );

    expect(
      service.verifyMerkleProof(
        result.leafHash,
        corruptedProof,
        result.merkleRoot,
      ),
    ).toBe(false);
  });

  it('rejects a proof when the expected root changes', () => {
    const result = service.createMerkleProof(createEntries(4), 1);

    expect(
      service.verifyMerkleProof(
        result.leafHash,
        result.proof,
        'c'.repeat(64),
      ),
    ).toBe(false);
  });

  it('rejects a proof when a node side changes', () => {
    const result = service.createMerkleProof(createEntries(4), 1);
    const corruptedProof = result.proof.map((node, index) =>
      index === 0
        ? {
            ...node,
            side: node.side === 'LEFT' ? ('RIGHT' as const) : ('LEFT' as const),
          }
        : node,
    );

    expect(
      service.verifyMerkleProof(
        result.leafHash,
        corruptedProof,
        result.merkleRoot,
      ),
    ).toBe(false);
  });

  it('rejects a proof when proof nodes are reordered', () => {
    const result = service.createMerkleProof(createEntries(8), 3);
    const reorderedProof = [...result.proof].reverse();

    expect(
      service.verifyMerkleProof(
        result.leafHash,
        reorderedProof,
        result.merkleRoot,
      ),
    ).toBe(false);
  });

  it('returns false for malformed hashes', () => {
    const result = service.createMerkleProof(createEntries(2), 0);

    expect(
      service.verifyMerkleProof('invalid', result.proof, result.merkleRoot),
    ).toBe(false);

    expect(
      service.verifyMerkleProof(result.leafHash, result.proof, 'invalid'),
    ).toBe(false);

    expect(
      service.verifyMerkleProof(
        result.leafHash,
        [{ hash: 'invalid', side: 'RIGHT' }],
        result.merkleRoot,
      ),
    ).toBe(false);
  });

  it('throws for a negative leaf index', () => {
    expect(() => service.createMerkleProof(createEntries(2), -1)).toThrow(
      'Merkle proof leaf index is out of range',
    );
  });

  it('throws for a leaf index equal to the entry count', () => {
    expect(() => service.createMerkleProof(createEntries(2), 2)).toThrow(
      'Merkle proof leaf index is out of range',
    );
  });

  it('throws for a non-integer leaf index', () => {
    expect(() => service.createMerkleProof(createEntries(2), 0.5)).toThrow(
      'Merkle proof leaf index is out of range',
    );
  });

  it('throws when proof creation is requested for an empty tree', () => {
    expect(() => service.createMerkleProof([], 0)).toThrow(
      'Merkle proof leaf index is out of range',
    );
  });
});
