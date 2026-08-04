import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

export type CanonicalSnapshotEntry = {
  position: bigint;
  ticketPublicId: string;
  ownerPublicRef: string;
};

export type SnapshotCommitment = {
  canonicalSnapshot: string;
  snapshotHash: string;
  merkleRoot: string;
  leafHashes: string[];
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
      this.sha256(`LEAF\n${entry}`),
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

  private createMerkleRoot(leafHashes: string[]): string {
    if (leafHashes.length === 0) {
      return this.sha256('MERKLE_EMPTY');
    }

    let level = [...leafHashes];

    while (level.length > 1) {
      const nextLevel: string[] = [];

      for (let index = 0; index < level.length; index += 2) {
        const left = level[index];
        const right = level[index + 1] ?? left;

        nextLevel.push(
          this.sha256(`NODE\n${left}\n${right}`),
        );
      }

      level = nextLevel;
    }

    return level[0];
  }

  private sha256(value: string): string {
    return createHash('sha256')
      .update(value, 'utf8')
      .digest('hex');
  }
}