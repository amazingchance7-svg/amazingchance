import {
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  import { SnapshotStatus } from '@prisma/client';

  import { PrismaService } from '../prisma/prisma.service';
  import { VerifyMerkleProofDto } from './dto/verify-merkle-proof.dto';
  import { SnapshotCryptographyService } from './snapshot-cryptography.service';

  export type PublicProofVerificationResponse = {
    valid: boolean;
    reason:
      | 'VERIFIED'
      | 'MERKLE_ROOT_MISMATCH'
      | 'INVALID_MERKLE_PROOF';
    drawId: string;
    drawPublicId: string;
    verificationVersion: string;
    hashAlgorithm: string;
    snapshotHash: string;
    officialMerkleRoot: string;
    suppliedMerkleRoot: string;
  };

  @Injectable()
  export class PublicVerificationService {
    constructor(
      private readonly prisma: PrismaService,
      private readonly cryptography: SnapshotCryptographyService,
    ) {}

    async verifyProof(
      drawId: string,
      dto: VerifyMerkleProofDto,
    ): Promise<PublicProofVerificationResponse> {
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
            hashAlgorithm: true,
            snapshotHash: true,
            merkleRoot: true,
            draw: {
              select: {
                publicId: true,
              },
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

      if (dto.merkleRoot !== snapshot.merkleRoot) {
        return {
          valid: false,
          reason: 'MERKLE_ROOT_MISMATCH',
          drawId: snapshot.drawId,
          drawPublicId: snapshot.draw.publicId,
          verificationVersion:
            dto.verificationVersion,
          hashAlgorithm: snapshot.hashAlgorithm,
          snapshotHash: snapshot.snapshotHash,
          officialMerkleRoot: snapshot.merkleRoot,
          suppliedMerkleRoot: dto.merkleRoot,
        };
      }

      const valid = this.cryptography.verifyMerkleProof(
        dto.leafHash,
        dto.proof,
        snapshot.merkleRoot,
      );

      return {
        valid,
        reason: valid
          ? 'VERIFIED'
          : 'INVALID_MERKLE_PROOF',
        drawId: snapshot.drawId,
        drawPublicId: snapshot.draw.publicId,
        verificationVersion: dto.verificationVersion,
        hashAlgorithm: snapshot.hashAlgorithm,
        snapshotHash: snapshot.snapshotHash,
        officialMerkleRoot: snapshot.merkleRoot,
        suppliedMerkleRoot: dto.merkleRoot,
      };
    }
  }
