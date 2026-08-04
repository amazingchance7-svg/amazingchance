import {
    ConflictException,
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  import { SnapshotStatus } from '@prisma/client';

  import { PrismaService } from '../prisma/prisma.service';
  import {
    MerkleProofNode,
    SnapshotCryptographyService,
  } from './snapshot-cryptography.service';

  export type PublicTicketProofResponse = {
    drawId: string;
    drawPublicId: string;
    ticketPublicId: string;
    position: string;
    leafHash: string;
    leafIndex: number;
    proof: MerkleProofNode[];
    merkleRoot: string;
    snapshotHash: string;
    hashAlgorithm: string;
    canonicalFormat: string;
    verificationVersion: string;
  };

  @Injectable()
  export class PublicProofService {
    constructor(
      private readonly prisma: PrismaService,
      private readonly cryptography: SnapshotCryptographyService,
    ) {}

    async findProofByTicketPublicId(
      drawId: string,
      ticketPublicId: string,
    ): Promise<PublicTicketProofResponse> {
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
            ticketCount: true,
            canonicalFormat: true,
            hashAlgorithm: true,
            snapshotHash: true,
            merkleRoot: true,
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
        !snapshot.merkleRoot
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

      const leafIndex = snapshot.entries.findIndex(
        (entry) =>
          entry.ticketPublicId === ticketPublicId,
      );

      if (leafIndex < 0) {
        throw new NotFoundException(
          'Ticket was not found in the finalized snapshot',
        );
      }

      const entries = snapshot.entries.map((entry) => ({
        position: entry.position,
        ticketPublicId: entry.ticketPublicId,
        ownerPublicRef: entry.ownerPublicRef,
      }));

      const proofResult =
        this.cryptography.createMerkleProof(
          entries,
          leafIndex,
        );

      if (
        proofResult.merkleRoot !== snapshot.merkleRoot
      ) {
        throw new ConflictException(
          'Stored Merkle root does not match snapshot entries',
        );
      }

      const targetEntry = snapshot.entries[leafIndex];

      return {
        drawId: snapshot.drawId,
        drawPublicId: snapshot.draw.publicId,
        ticketPublicId: targetEntry.ticketPublicId,
        position: targetEntry.position.toString(10),
        leafHash: proofResult.leafHash,
        leafIndex: proofResult.leafIndex,
        proof: proofResult.proof,
        merkleRoot: snapshot.merkleRoot,
        snapshotHash: snapshot.snapshotHash,
        hashAlgorithm: snapshot.hashAlgorithm,
        canonicalFormat: snapshot.canonicalFormat,
        verificationVersion:
          'AMAZING_CHANCE_MERKLE_PROOF_V1',
      };
    }
  }
