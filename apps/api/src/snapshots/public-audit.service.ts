import {
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  import {
    DrawStatus,
    SnapshotStatus,
  } from '@prisma/client';

  import { PrismaService } from '../prisma/prisma.service';

  const AUDIT_VERSION =
    'AMAZING_CHANCE_PUBLIC_AUDIT_V1';

  export type PublicAuditManifestResponse = {
    auditVersion: string;
    draw: {
      id: string;
      publicId: string;
      status: DrawStatus;
      type: string;
      scheduledDrawAt: Date;
      completedAt: Date | null;
      publishedAt: Date | null;
    };
    snapshot: {
      status: SnapshotStatus;
      ticketCount: string;
      canonicalFormat: string;
      hashAlgorithm: string;
      snapshotHash: string;
      merkleRoot: string;
      builtAt: Date | null;
      finalizedAt: Date;
    };
    endpoints: {
      snapshotMetadata: string;
      snapshotDownload: string;
      ticketProofTemplate: string;
      proofVerification: string;
    };
  };

  @Injectable()
  export class PublicAuditService {
    constructor(
      private readonly prisma: PrismaService,
    ) {}

    async findManifestByDrawId(
      drawId: string,
    ): Promise<PublicAuditManifestResponse> {
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
                id: true,
                publicId: true,
                status: true,
                type: true,
                scheduledDrawAt: true,
                completedAt: true,
                publishedAt: true,
              },
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

      const basePath =
        `/lottery-draws/${snapshot.draw.id}`;

      return {
        auditVersion: AUDIT_VERSION,
        draw: {
          id: snapshot.draw.id,
          publicId: snapshot.draw.publicId,
          status: snapshot.draw.status,
          type: snapshot.draw.type,
          scheduledDrawAt:
            snapshot.draw.scheduledDrawAt,
          completedAt: snapshot.draw.completedAt,
          publishedAt: snapshot.draw.publishedAt,
        },
        snapshot: {
          status: snapshot.status,
          ticketCount:
            snapshot.ticketCount.toString(10),
          canonicalFormat:
            snapshot.canonicalFormat,
          hashAlgorithm: snapshot.hashAlgorithm,
          snapshotHash: snapshot.snapshotHash,
          merkleRoot: snapshot.merkleRoot,
          builtAt: snapshot.builtAt,
          finalizedAt: snapshot.finalizedAt,
        },
        endpoints: {
          snapshotMetadata:
            `${basePath}/snapshot`,
          snapshotDownload:
            `${basePath}/snapshot/download`,
          ticketProofTemplate:
            `${basePath}/tickets/{ticketPublicId}/proof`,
          proofVerification:
            `${basePath}/verify-proof`,
        },
      };
    }
  }
