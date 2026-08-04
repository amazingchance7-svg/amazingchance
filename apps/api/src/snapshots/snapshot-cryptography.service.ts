import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

export type CanonicalSnapshotEntry = {
  position: bigint;
  ticketPublicId: string;
  ownerPublicRef: string;
};

export type MerkleProofSide = 'LEFT' | 'RIGHT';

export type MerkleProofNode = {
  hash: string;
  side: MerkleProofSide;
};

export type SnapshotCommitment = {
  canonicalSnapshot: string;
  snapshotHash: string;
  merkleRoot: string;
  leafHashes: string[];
};

export type MerkleProofResult = {
  leafHash: string;
  leafIndex: number;
  merkleRoot: string;
  proof: MerkleProofNode[];
};

@Injectable()
export class SnapshotCryptographyService {
  createCommitment(
    canonicalFormat: string,
    drawId: string,
    entries: CanonicalSnapshotEntry[],
  ): SnapshotCommitment {
    const canonicalEntries = entries.map((entry) =>
      this.serializeEntry(entry),
    );

    const canonicalSnapshot = [
      canonicalFormat,
      drawId,
      entries.length.toString(10),
      ...canonicalEntries,
    ].join('\n');

    const leafHashes = canonicalEntries.map((entry) =>
      this.createLeafHashFromSerializedEntry(entry),
    );

    return {
      canonicalSnapshot,
      snapshotHash: this.sha256(
        `SNAPSHOT\n${canonicalSnapshot}`,
      ),
      merkleRoot: this.createMerkleRoot(leafHashes),
      leafHashes,
    };
  }

  createMerkleProof(
    entries: CanonicalSnapshotEntry[],
    leafIndex: number,
  ): MerkleProofResult {
    if (
      !Number.isInteger(leafIndex) ||
      leafIndex < 0 ||
      leafIndex >= entries.length
    ) {
      throw new RangeError(
        'Merkle proof leaf index is out of range',
      );
    }

    const leafHashes = entries.map((entry) =>
      this.createLeafHash(entry),
    );

    const proof: MerkleProofNode[] = [];
    let currentIndex = leafIndex;
    let level = [...leafHashes];

    while (level.length > 1) {
      const isRightNode = currentIndex % 2 === 1;
      const siblingIndex = isRightNode
        ? currentIndex - 1
        : currentIndex + 1;

      const siblingHash =
        siblingIndex < level.length
          ? level[siblingIndex]
          : level[currentIndex];

      proof.push({
        hash: siblingHash,
        side: isRightNode ? 'LEFT' : 'RIGHT',
      });

      level = this.createNextMerkleLevel(level);
      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      leafHash: leafHashes[leafIndex],
      leafIndex,
      merkleRoot: level[0],
      proof,
    };
  }

  verifyMerkleProof(
    leafHash: string,
    proof: MerkleProofNode[],
    expectedMerkleRoot: string,
  ): boolean {
    if (
      !this.isSha256Hex(leafHash) ||
      !this.isSha256Hex(expectedMerkleRoot)
    ) {
      return false;
    }

    let calculatedHash = leafHash;

    for (const node of proof) {
      if (
        !this.isSha256Hex(node.hash) ||
        (node.side !== 'LEFT' &&
          node.side !== 'RIGHT')
      ) {
        return false;
      }

      calculatedHash =
        node.side === 'LEFT'
          ? this.createParentHash(
              node.hash,
              calculatedHash,
            )
          : this.createParentHash(
              calculatedHash,
              node.hash,
            );
    }

    return calculatedHash === expectedMerkleRoot;
  }

  createLeafHash(
    entry: CanonicalSnapshotEntry,
  ): string {
    return this.createLeafHashFromSerializedEntry(
      this.serializeEntry(entry),
    );
  }

  private serializeEntry(
    entry: CanonicalSnapshotEntry,
  ): string {
    return [
      entry.position.toString(10),
      this.encodeField(entry.ticketPublicId),
      this.encodeField(entry.ownerPublicRef),
    ].join('|');
  }

  private encodeField(value: string): string {
    return `${Buffer.byteLength(value, 'utf8')}:${value}`;
  }

  private createLeafHashFromSerializedEntry(
    serializedEntry: string,
  ): string {
    return this.sha256(`LEAF\n${serializedEntry}`);
  }

  private createMerkleRoot(
    leafHashes: string[],
  ): string {
    if (leafHashes.length === 0) {
      return this.sha256('MERKLE_EMPTY');
    }

    let level = [...leafHashes];

    while (level.length > 1) {
      level = this.createNextMerkleLevel(level);
    }

    return level[0];
  }

  private createNextMerkleLevel(
    level: string[],
  ): string[] {
    const nextLevel: string[] = [];

    for (
      let index = 0;
      index < level.length;
      index += 2
    ) {
      const left = level[index];
      const right = level[index + 1] ?? left;

      nextLevel.push(
        this.createParentHash(left, right),
      );
    }

    return nextLevel;
  }

  private createParentHash(
    left: string,
    right: string,
  ): string {
    return this.sha256(`NODE\n${left}\n${right}`);
  }

  private isSha256Hex(value: string): boolean {
    return /^[0-9a-f]{64}$/.test(value);
  }

  private sha256(value: string): string {
    return createHash('sha256')
      .update(value, 'utf8')
      .digest('hex');
  }
}