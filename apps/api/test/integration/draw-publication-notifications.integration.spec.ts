import {
  DrawStatus,
  DrawType,
  NotificationOutboxStatus,
  NotificationOutboxType,
  PurchaseStatus,
  PrismaClient,
  SnapshotStatus,
  TicketStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { LotteryDrawsService } from '../../src/lottery-draws/lottery-draws.service';
import {
  DrawPrismaService,
  PrismaService,
} from '../../src/prisma/prisma.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';
import {
  createTestAdminPrisma,
  createTestDrawPrisma,
} from './database-role.helper';
import {
  ensureTestTicketAllocation,
} from './ticket-fixture.helper';

describe(
  'Draw publication notifications integration',
  () => {
    let prisma: PrismaService;
    let fixturePrisma: PrismaClient;
    let drawPrisma: DrawPrismaService;
    let service: LotteryDrawsService;

    beforeAll(async () => {
      prisma = await createTestPrisma();
      fixturePrisma = await createTestAdminPrisma();
      drawPrisma = await createTestDrawPrisma();
      service = new LotteryDrawsService(drawPrisma);
    });

    beforeEach(async () => {
      await cleanTestDatabase(prisma);
    });

    afterAll(async () => {
      await Promise.all([
        prisma.$disconnect(),
        fixturePrisma.$disconnect(),
        drawPrisma.$disconnect(),
      ]);
    });

    it(
      'publishes the draw and atomically enqueues winner and participant notifications',
      async () => {
        const winnerUser = await fixturePrisma.user.create({
          data: {
            email: `${randomUUID()}@example.com`,
            passwordHash: 'hash',
            status: UserStatus.ACTIVE,
            emailVerifiedAt: new Date(),
          },
        });

        const participantUser = await fixturePrisma.user.create({
          data: {
            email: `${randomUUID()}@example.com`,
            passwordHash: 'hash',
            status: UserStatus.ACTIVE,
            emailVerifiedAt: new Date(),
          },
        });

        const draw = await fixturePrisma.lotteryDraw.create({
          data: {
            publicId: `W-2026-${randomUUID()}`,
            type: DrawType.WEEKLY,
            status: DrawStatus.SALES_OPEN,
            sequenceNumber: Math.floor(Math.random() * 1_000_000),
            salesOpenAt: new Date(Date.now() - 60_000),
            salesCloseAt: new Date(Date.now() + 3_600_000),
            scheduledDrawAt: new Date(Date.now() + 86_400_000),
            currency: 'USD',
            ticketPriceMinor: 100n,
            winnerCount: 1,
          },
        });

        const winnerPurchase = await fixturePrisma.purchase.create({
          data: {
            publicId: `PUR-${randomUUID()}`,
            userId: winnerUser.id,
            drawId: draw.id,
            status: PurchaseStatus.COMPLETED,
            requestedTicketCount: 1,
            ticketPriceMinor: 100n,
            totalAmountMinor: 100n,
            currency: 'USD',
            idempotencyKey: randomUUID(),
            paymentConfirmedAt: new Date(),
            completedAt: new Date(),
          },
        });

        const participantPurchase = await fixturePrisma.purchase.create({
          data: {
            publicId: `PUR-${randomUUID()}`,
            userId: participantUser.id,
            drawId: draw.id,
            status: PurchaseStatus.COMPLETED,
            requestedTicketCount: 1,
            ticketPriceMinor: 100n,
            totalAmountMinor: 100n,
            currency: 'USD',
            idempotencyKey: randomUUID(),
            paymentConfirmedAt: new Date(),
            completedAt: new Date(),
          },
        });

        await ensureTestTicketAllocation(fixturePrisma, {
          purchaseId: winnerPurchase.id,
          drawId: draw.id,
          numberInDraw: 1n,
        });

        const winnerTicket = await fixturePrisma.ticket.create({
          data: {
            publicId: `TKT-${randomUUID()}`,
            userId: winnerUser.id,
            purchaseId: winnerPurchase.id,
            drawId: draw.id,
            numberInDraw: 1n,
            status: TicketStatus.ACTIVE,
          },
        });

        await ensureTestTicketAllocation(fixturePrisma, {
          purchaseId: participantPurchase.id,
          drawId: draw.id,
          numberInDraw: 2n,
        });

        const participantTicket = await fixturePrisma.ticket.create({
          data: {
            publicId: `TKT-${randomUUID()}`,
            userId: participantUser.id,
            purchaseId: participantPurchase.id,
            drawId: draw.id,
            numberInDraw: 2n,
            status: TicketStatus.ACTIVE,
          },
        });

        const snapshot = await fixturePrisma.ticketSnapshot.create({
          data: {
            drawId: draw.id,
            status: SnapshotStatus.BUILDING,
            ticketCount: 2n,
            canonicalFormat: 'integration-test-v1',
            builtAt: new Date(),
          },
        });

        const winnerEntry = await fixturePrisma.ticketSnapshotEntry.create({
          data: {
            snapshotId: snapshot.id,
            ticketId: winnerTicket.id,
            position: 1n,
            ticketPublicId: winnerTicket.publicId,
            ownerPublicRef: 'winner-public-ref',
          },
        });

        await fixturePrisma.ticketSnapshotEntry.create({
          data: {
            snapshotId: snapshot.id,
            ticketId: participantTicket.id,
            position: 2n,
            ticketPublicId: participantTicket.publicId,
            ownerPublicRef: 'participant-public-ref',
          },
        });

        await fixturePrisma.ticketSnapshot.update({
          where: { id: snapshot.id },
          data: {
            status: SnapshotStatus.FINALIZED,
            snapshotHash: 'a'.repeat(64),
            merkleRoot: 'b'.repeat(64),
            finalizedAt: new Date(),
          },
        });

        await fixturePrisma.lotteryDraw.update({
          where: { id: draw.id },
          data: {
            status: DrawStatus.WINNER_SELECTION_PENDING,
          },
        });

        const winner = await fixturePrisma.drawWinner.create({
          data: {
            drawId: draw.id,
            ticketId: winnerTicket.id,
            snapshotEntryId: winnerEntry.id,
            rank: 1,
            randomPosition: 1n,
          },
        });

        await fixturePrisma.lotteryDraw.update({
          where: { id: draw.id },
          data: {
            status: DrawStatus.COMPLETED,
            completedAt: new Date(),
          },
        });

        const published = await service.publish(draw.id);

        expect(published.status).toBe(DrawStatus.PUBLISHED);
        expect(published.publishedAt).toBeInstanceOf(Date);

        const outbox = await prisma.notificationOutbox.findMany({
          orderBy: {
            idempotencyKey: 'asc',
          },
        });

        expect(outbox).toHaveLength(3);

        expect(outbox).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              type: NotificationOutboxType.DRAW_WINNER,
              status: NotificationOutboxStatus.PENDING,
              recipientEmail: winnerUser.email,
              idempotencyKey: `draw-winner:${draw.id}:${winner.id}`,
              payload: {
                drawPublicId: draw.publicId,
                rank: 1,
                ticketPublicId: winnerTicket.publicId,
              },
            }),
            expect.objectContaining({
              type: NotificationOutboxType.DRAW_PUBLISHED,
              status: NotificationOutboxStatus.PENDING,
              recipientEmail: winnerUser.email,
              idempotencyKey: `draw-published:${draw.id}:${winnerUser.id}`,
              payload: {
                drawPublicId: draw.publicId,
              },
            }),
            expect.objectContaining({
              type: NotificationOutboxType.DRAW_PUBLISHED,
              status: NotificationOutboxStatus.PENDING,
              recipientEmail: participantUser.email,
              idempotencyKey: `draw-published:${draw.id}:${participantUser.id}`,
              payload: {
                drawPublicId: draw.publicId,
              },
            }),
          ]),
        );
      },
    );
  },
);
