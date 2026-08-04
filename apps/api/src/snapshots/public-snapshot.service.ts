import {
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  import {
    SnapshotStatus,
  } from '@prisma/client';

  import { PrismaService } from '../prisma/prisma.service';

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

  @Injectable()
  export class PublicSnapshotService {
    constructor(
      private readonly prisma: PrismaService,
    ) {}

    async findFinalizedByDrawId(
      drawId: string,
    ): Promise<PublicSnapshotResponse> {
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
  }
