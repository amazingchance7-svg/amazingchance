import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DrawStatus,
  Prisma,
  SnapshotStatus,
  TicketStatus,
} from '@prisma/client';
import { createHmac } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';

const CANONICAL_FORMAT = 'AMAZING_CHANCE_TICKET_SNAPSHOT_V1';

type LockedDrawRow = {
  id: string;
  status: DrawStatus;
};

export type BuildSnapshotResult = {
  snapshotId: string;
  drawId: string;
  ticketCount: bigint;
  status: SnapshotStatus;
  alreadyBuilt: boolean;
};

@Injectable()
export class SnapshotBuilderService {
  private readonly ownerSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.ownerSecret = config.getOrThrow<string>(
      'SNAPSHOT_OWNER_SECRET',
    );
  }

  build(drawId: string): Promise<BuildSnapshotResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const drawRows = await tx.$queryRaw<LockedDrawRow[]>`
          SELECT "id", "status"
          FROM "lottery_draws"
          WHERE "id" = ${drawId}::uuid
          FOR UPDATE
        `;
        const draw = drawRows[0];

        if (!draw) {
          throw new NotFoundException('Lottery draw not found');
        }

        const existing = await tx.ticketSnapshot.findUnique({
          where: { drawId },
        });

        if (existing) {
          const entryCount = await tx.ticketSnapshotEntry.count({
            where: { snapshotId: existing.id },
          });

          if (BigInt(entryCount) !== existing.ticketCount) {
            throw new ConflictException(
              'Existing snapshot has an inconsistent entry count',
            );
          }

          return {
            snapshotId: existing.id,
            drawId: existing.drawId,
            ticketCount: existing.ticketCount,
            status: existing.status,
            alreadyBuilt: true,
          };
        }

        if (draw.status !== DrawStatus.SALES_CLOSED) {
          throw new ConflictException(
            `Snapshot cannot be built for a draw in ${draw.status}`,
          );
        }

        const unresolvedRefundPurchaseCount =
          await tx.purchase.count({
            where: {
              drawId,
              status: {
                in: [
                  'REFUND_PENDING',
                  'MANUAL_REVIEW',
                ],
              },
              tickets: {
                some: {
                  status: TicketStatus.ACTIVE,
                },
              },
            },
          });

        if (unresolvedRefundPurchaseCount > 0) {
          throw new ConflictException(
            'Snapshot cannot be built while active tickets belong to unresolved refund or manual-review purchases',
          );
        }
        const tickets = await tx.ticket.findMany({
          where: {
            drawId,
            status: TicketStatus.ACTIVE,
          },
          select: {
            id: true,
            publicId: true,
            userId: true,
            numberInDraw: true,
          },
          orderBy: [
            { numberInDraw: 'asc' },
            { id: 'asc' },
          ],
        });

        const builtAt = new Date();
        const snapshot = await tx.ticketSnapshot.create({
          data: {
            drawId,
            status: SnapshotStatus.BUILDING,
            ticketCount: BigInt(tickets.length),
            canonicalFormat: CANONICAL_FORMAT,
            builtAt,
          },
        });

        if (tickets.length > 0) {
          await tx.ticketSnapshotEntry.createMany({
            data: tickets.map((ticket, index) => ({
              snapshotId: snapshot.id,
              ticketId: ticket.id,
              position: BigInt(index + 1),
              ticketPublicId: ticket.publicId,
              ownerPublicRef: this.createOwnerPublicRef(
                drawId,
                ticket.userId,
              ),
            })),
          });
        }

        const updated = await tx.lotteryDraw.updateMany({
          where: {
            id: drawId,
            status: DrawStatus.SALES_CLOSED,
          },
          data: {
            status: DrawStatus.SNAPSHOT_BUILDING,
          },
        });

        if (updated.count !== 1) {
          throw new ConflictException(
            'Draw state changed while snapshot was being built',
          );
        }

        return {
          snapshotId: snapshot.id,
          drawId,
          ticketCount: snapshot.ticketCount,
          status: snapshot.status,
          alreadyBuilt: false,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  private createOwnerPublicRef(
    drawId: string,
    userId: string,
  ): string {
    return createHmac('sha256', this.ownerSecret)
      .update(`${drawId}:${userId}`, 'utf8')
      .digest('hex');
  }
}
