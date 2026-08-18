import {
    ConflictException,
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  import {
    DrawStatus,
    Prisma,
    SnapshotStatus,
  } from '@prisma/client';

  import { DrawPrismaService } from '../prisma/prisma.service';
  import { SnapshotCryptographyService } from './snapshot-cryptography.service';

  type LockedSnapshotRow = {
    id: string;
    drawId: string;
    status: SnapshotStatus;
    ticketCount: bigint;
    canonicalFormat: string;
    hashAlgorithm: string;
    snapshotHash: string | null;
    merkleRoot: string | null;
    finalizedAt: Date | null;
  };

  export type FinalizeSnapshotResult = {
    snapshotId: string;
    drawId: string;
    ticketCount: bigint;
    hashAlgorithm: string;
    snapshotHash: string;
    merkleRoot: string;
    finalizedAt: Date;
    alreadyFinalized: boolean;
  };

  @Injectable()
  export class SnapshotFinalizerService {
    constructor(
      private readonly prisma: DrawPrismaService,
      private readonly cryptography: SnapshotCryptographyService,
    ) {}

    finalize(drawId: string): Promise<FinalizeSnapshotResult> {
      return this.prisma.$transaction(
        async (tx) => {
          const snapshotRows =
            await tx.$queryRaw<LockedSnapshotRow[]>`
              SELECT
                "id",
                "drawId",
                "status",
                "ticketCount",
                "canonicalFormat",
                "hashAlgorithm",
                "snapshotHash",
                "merkleRoot",
                "finalizedAt"
              FROM "ticket_snapshots"
              WHERE "drawId" = ${drawId}::uuid
              FOR UPDATE
            `;

          const snapshot = snapshotRows[0];

          if (!snapshot) {
            throw new NotFoundException(
              'Ticket snapshot not found',
            );
          }

          const drawRows = await tx.$queryRaw<
            Array<{
              id: string;
              status: DrawStatus;
            }>
          >`
            SELECT "id", "status"
            FROM "lottery_draws"
            WHERE "id" = ${drawId}::uuid
            FOR UPDATE
          `;

          const draw = drawRows[0];

          if (!draw) {
            throw new NotFoundException(
              'Lottery draw not found',
            );
          }

          const entries =
            await tx.ticketSnapshotEntry.findMany({
              where: {
                snapshotId: snapshot.id,
              },
              select: {
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
            });

          if (
            BigInt(entries.length) !== snapshot.ticketCount
          ) {
            throw new ConflictException(
              'Snapshot entry count does not match ticket count',
            );
          }

          this.assertContinuousPositions(entries);

          const commitment =
            this.cryptography.createCommitment(
              snapshot.canonicalFormat,
              drawId,
              entries,
            );

          if (snapshot.status === SnapshotStatus.FINALIZED) {
            return this.verifyFinalizedSnapshot(
              snapshot,
              commitment.snapshotHash,
              commitment.merkleRoot,
            );
          }

          if (snapshot.status !== SnapshotStatus.BUILDING) {
            throw new ConflictException(
              `Snapshot cannot be finalized from ${snapshot.status}`,
            );
          }

          if (
            draw.status !== DrawStatus.SNAPSHOT_BUILDING
          ) {
            throw new ConflictException(
              `Snapshot cannot be finalized for a draw in ${draw.status}`,
            );
          }

          if (snapshot.hashAlgorithm !== 'SHA-256') {
            throw new ConflictException(
              `Unsupported snapshot hash algorithm: ${snapshot.hashAlgorithm}`,
            );
          }

          const finalizedAt = new Date();

          const updatedSnapshot =
            await tx.ticketSnapshot.updateMany({
              where: {
                id: snapshot.id,
                status: SnapshotStatus.BUILDING,
                snapshotHash: null,
                merkleRoot: null,
                finalizedAt: null,
              },
              data: {
                status: SnapshotStatus.FINALIZED,
                snapshotHash: commitment.snapshotHash,
                merkleRoot: commitment.merkleRoot,
                finalizedAt,
              },
            });

          if (updatedSnapshot.count !== 1) {
            throw new ConflictException(
              'Snapshot state changed while it was being finalized',
            );
          }

          const updatedDraw =
            await tx.lotteryDraw.updateMany({
              where: {
                id: drawId,
                status: DrawStatus.SNAPSHOT_BUILDING,
              },
              data: {
                status: DrawStatus.SNAPSHOT_FINALIZED,
              },
            });

          if (updatedDraw.count !== 1) {
            throw new ConflictException(
              'Draw state changed while snapshot was being finalized',
            );
          }

          return {
            snapshotId: snapshot.id,
            drawId,
            ticketCount: snapshot.ticketCount,
            hashAlgorithm: snapshot.hashAlgorithm,
            snapshotHash: commitment.snapshotHash,
            merkleRoot: commitment.merkleRoot,
            finalizedAt,
            alreadyFinalized: false,
          };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    }

    private assertContinuousPositions(
      entries: Array<{
        position: bigint;
      }>,
    ): void {
      for (
        let index = 0;
        index < entries.length;
        index += 1
      ) {
        const expectedPosition = BigInt(index + 1);

        if (
          entries[index].position !== expectedPosition
        ) {
          throw new ConflictException(
            `Snapshot position sequence is invalid at ${expectedPosition}`,
          );
        }
      }
    }

    private verifyFinalizedSnapshot(
      snapshot: LockedSnapshotRow,
      calculatedSnapshotHash: string,
      calculatedMerkleRoot: string,
    ): FinalizeSnapshotResult {
      if (
        !snapshot.snapshotHash ||
        !snapshot.merkleRoot ||
        !snapshot.finalizedAt
      ) {
        throw new ConflictException(
          'Finalized snapshot is missing commitment data',
        );
      }

      if (
        snapshot.snapshotHash !== calculatedSnapshotHash
      ) {
        throw new ConflictException(
          'Finalized snapshot hash does not match its entries',
        );
      }

      if (
        snapshot.merkleRoot !== calculatedMerkleRoot
      ) {
        throw new ConflictException(
          'Finalized snapshot Merkle root does not match its entries',
        );
      }

      return {
        snapshotId: snapshot.id,
        drawId: snapshot.drawId,
        ticketCount: snapshot.ticketCount,
        hashAlgorithm: snapshot.hashAlgorithm,
        snapshotHash: snapshot.snapshotHash,
        merkleRoot: snapshot.merkleRoot,
        finalizedAt: snapshot.finalizedAt,
        alreadyFinalized: true,
      };
    }
  }
