import {
    ConflictException,
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  import { SnapshotStatus } from '@prisma/client';

  import { PrismaService } from '../prisma/prisma.service';
  import { SnapshotCryptographyService } from './snapshot-cryptography.service';

  export type PublicSnapshotResponse = {
    drawId: string;
    drawPublicId: string;
    status: SnapshotStatus;
    ticketCount: string;
    canonicalFormat: string;
    hashAlgorithm: string;
    snapshotHash: string;
    merkleRoot: string;
    builtAt: Date | null;
    finalizedAt: Date;
  };

  export type PublicSnapshotDownload = {
    filename: string;
    contentType: string;
    canonicalSnapshot: string;
    snapshotHash: string;
  };

  type FinalizedSnapshotRecord = {
    drawId: string;
    status: SnapshotStatus;
    ticketCount: bigint;
    canonicalFormat: string;
    hashAlgorithm: string;
    snapshotHash: string;
    merkleRoot: string;
    builtAt: Date | null;
    finalizedAt: Date;
    draw: {
      publicId: string;
    };
    entries: Array<{
      id: string;
      position: bigint;
      ticketPublicId: string;
      ownerPublicRef: string;
    }>;
  };

  @Injectable()
  export class PublicSnapshotService {
    constructor(
      private readonly prisma: PrismaService,
      private readonly cryptography: SnapshotCryptographyService,
    ) {}

    async findFinalizedByDrawId(
      drawId: string,
    ): Promise<PublicSnapshotResponse> {
      const snapshot = await this.findFinalizedSnapshot(drawId);

      return {
        drawId: snapshot.drawId,
        drawPublicId: snapshot.draw.publicId,
        status: snapshot.status,
        ticketCount: snapshot.ticketCount.toString(10),
        canonicalFormat: snapshot.canonicalFormat,
        hashAlgorithm: snapshot.hashAlgorithm,
        snapshotHash: snapshot.snapshotHash,
        merkleRoot: snapshot.merkleRoot,
        builtAt: snapshot.builtAt,
        finalizedAt: snapshot.finalizedAt,
      };
    }

    async downloadFinalizedByDrawId(
      drawId: string,
    ): Promise<PublicSnapshotDownload> {
      const snapshot = await this.findFinalizedSnapshot(drawId);

      const commitment = this.cryptography.createCommitment(
        snapshot.canonicalFormat,
        snapshot.drawId,
        snapshot.entries.map((entry) => ({
          position: entry.position,
          ticketPublicId: entry.ticketPublicId,
          ownerPublicRef: entry.ownerPublicRef,
        })),
      );

      if (commitment.snapshotHash !== snapshot.snapshotHash) {
        throw new ConflictException(
          'Stored snapshot hash does not match canonical snapshot',
        );
      }

      if (commitment.merkleRoot !== snapshot.merkleRoot) {
        throw new ConflictException(
          'Stored Merkle root does not match snapshot entries',
        );
      }

      return {
        filename: `${snapshot.draw.publicId}-snapshot.txt`,
        contentType: 'text/plain; charset=utf-8',
        canonicalSnapshot: commitment.canonicalSnapshot,
        snapshotHash: snapshot.snapshotHash,
      };
    }

    private async findFinalizedSnapshot(
      drawId: string,
    ): Promise<FinalizedSnapshotRecord> {
      const snapshot =
        await this.prisma.ticketSnapshot.findFirst({
          where: {
            drawId,
            status: SnapshotStatus.FINALIZED,
            snapshotHash: {
              not: null,
            },
            merkleRoot: {
              not: null,
            },
            finalizedAt: {
              not: null,
            },
          },
          select: {
            drawId: true,
            status: true,
            ticketCount: true,
            canonicalFormat: true,
            hashAlgorithm: true,
            snapshotHash: true,
            merkleRoot: true,
            builtAt: true,
            finalizedAt: true,
            draw: {
              select: {
                publicId: true,
              },
            },
            entries: {
              select: {
                id: true,
                position: true,
                ticketPublicId: true,
                ownerPublicRef: true,
              },
              orderBy: [
                {
                  position: 'asc',
                },
                {
                  id: 'asc',
                },
              ],
            },
          },
        });

      if (
        !snapshot ||
        !snapshot.snapshotHash ||
        !snapshot.merkleRoot ||
        !snapshot.finalizedAt
      ) {
        throw new NotFoundException(
          'Finalized ticket snapshot not found',
        );
      }

      if (
        BigInt(snapshot.entries.length) !==
        snapshot.ticketCount
      ) {
        throw new ConflictException(
          'Snapshot entry count does not match ticket count',
        );
      }

      return {
        drawId: snapshot.drawId,
        status: snapshot.status,
        ticketCount: snapshot.ticketCount,
        canonicalFormat: snapshot.canonicalFormat,
        hashAlgorithm: snapshot.hashAlgorithm,
        snapshotHash: snapshot.snapshotHash,
        merkleRoot: snapshot.merkleRoot,
        builtAt: snapshot.builtAt,
        finalizedAt: snapshot.finalizedAt,
        draw: snapshot.draw,
        entries: snapshot.entries,
      };
    }
  }
