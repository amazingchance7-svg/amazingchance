import { ConfigService } from '@nestjs/config';
import {
  DrawStatus,
  DrawType,
  PurchaseStatus,
  SnapshotStatus,
  TicketStatus,
  UserStatus,
} from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';

import { PrismaService } from '../../src/prisma/prisma.service';
import { SnapshotBuilderService } from '../../src/snapshots/snapshot-builder.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';
import {
  ensureTestTicketAllocation,
} from './ticket-fixture.helper';


const OWNER_SECRET =
  'integration-snapshot-owner-secret-at-least-32-bytes';

describe('Snapshot builder integration', () => {
  let prisma: PrismaService;
  let service: SnapshotBuilderService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    service = new SnapshotBuilderService(
      prisma,
      new ConfigService({
        SNAPSHOT_OWNER_SECRET: OWNER_SECRET,
      }),
    );
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createScenario() {
    const firstUser = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const secondUser = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const draw = await prisma.lotteryDraw.create({
      data: {
        publicId: `W-2026-${randomUUID()}`,
        type: DrawType.WEEKLY,
        status: DrawStatus.SALES_OPEN,
        sequenceNumber: Math.floor(Math.random() * 1_000_000),
        scheduledDrawAt: new Date(Date.now() + 86_400_000),
        currency: 'USD',
        ticketPriceMinor: 100n,
      },
    });

    const firstPurchase = await prisma.purchase.create({
      data: {
        publicId: `PUR-${randomUUID()}`,
        userId: firstUser.id,
        drawId: draw.id,
        status: PurchaseStatus.COMPLETED,
        requestedTicketCount: 2,
        ticketPriceMinor: 100n,
        totalAmountMinor: 200n,
        currency: 'USD',
        idempotencyKey: randomUUID(),
        paymentConfirmedAt: new Date(),
        completedAt: new Date(),
      },
    });

    const secondPurchase = await prisma.purchase.create({
      data: {
        publicId: `PUR-${randomUUID()}`,
        userId: secondUser.id,
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

    await ensureTestTicketAllocation(
      prisma,
      {
        purchaseId: secondPurchase.id,
        drawId: draw.id,
        numberInDraw: 3n,
      },
    );

    const ticketThree = await prisma.ticket.create({
      data: {
        publicId: `TKT-${randomUUID()}`,
        userId: secondUser.id,
        purchaseId: secondPurchase.id,
        drawId: draw.id,
        numberInDraw: 3n,
      },
    });

    await ensureTestTicketAllocation(
      prisma,
      {
        purchaseId: firstPurchase.id,
        drawId: draw.id,
        numberInDraw: 1n,
      },
    );

    const ticketOne = await prisma.ticket.create({
      data: {
        publicId: `TKT-${randomUUID()}`,
        userId: firstUser.id,
        purchaseId: firstPurchase.id,
        drawId: draw.id,
        numberInDraw: 1n,
      },
    });

    await ensureTestTicketAllocation(
      prisma,
      {
        purchaseId: firstPurchase.id,
        drawId: draw.id,
        numberInDraw: 2n,
      },
    );

    const ticketTwo = await prisma.ticket.create({
      data: {
        publicId: `TKT-${randomUUID()}`,
        userId: firstUser.id,
        purchaseId: firstPurchase.id,
        drawId: draw.id,
        numberInDraw: 2n,
      },
    });

    await prisma.lotteryDraw.update({
      where: { id: draw.id },
      data: { status: DrawStatus.SALES_CLOSED },
    });

    return {
      firstUser,
      secondUser,
      draw,
      ticketOne,
      ticketTwo,
      ticketThree,
    };
  }

  function ownerRef(drawId: string, userId: string): string {
    return createHmac('sha256', OWNER_SECRET)
      .update(`${drawId}:${userId}`, 'utf8')
      .digest('hex');
  }

  it('builds a deterministic snapshot of active tickets', async () => {
    const scenario = await createScenario();

    const result = await service.build(scenario.draw.id);

    expect(result).toMatchObject({
      drawId: scenario.draw.id,
      ticketCount: 3n,
      status: SnapshotStatus.BUILDING,
      alreadyBuilt: false,
    });

    const snapshot = await prisma.ticketSnapshot.findUniqueOrThrow({
      where: { drawId: scenario.draw.id },
      include: {
        entries: {
          orderBy: { position: 'asc' },
        },
      },
    });

    expect(snapshot.canonicalFormat).toBe(
      'AMAZING_CHANCE_TICKET_SNAPSHOT_V1',
    );
    expect(snapshot.ticketCount).toBe(3n);
    expect(snapshot.builtAt).not.toBeNull();
    expect(snapshot.finalizedAt).toBeNull();
    expect(snapshot.snapshotHash).toBeNull();

    expect(
      snapshot.entries.map((entry) => ({
        position: entry.position,
        ticketId: entry.ticketId,
        ticketPublicId: entry.ticketPublicId,
        ownerPublicRef: entry.ownerPublicRef,
      })),
    ).toEqual([
      {
        position: 1n,
        ticketId: scenario.ticketOne.id,
        ticketPublicId: scenario.ticketOne.publicId,
        ownerPublicRef: ownerRef(
          scenario.draw.id,
          scenario.firstUser.id,
        ),
      },
      {
        position: 2n,
        ticketId: scenario.ticketTwo.id,
        ticketPublicId: scenario.ticketTwo.publicId,
        ownerPublicRef: ownerRef(
          scenario.draw.id,
          scenario.firstUser.id,
        ),
      },
      {
        position: 3n,
        ticketId: scenario.ticketThree.id,
        ticketPublicId: scenario.ticketThree.publicId,
        ownerPublicRef: ownerRef(
          scenario.draw.id,
          scenario.secondUser.id,
        ),
      },
    ]);

    expect(
      (
        await prisma.lotteryDraw.findUniqueOrThrow({
          where: { id: scenario.draw.id },
        })
      ).status,
    ).toBe(DrawStatus.SNAPSHOT_BUILDING);
  });

  it('excludes tickets voided by refund', async () => {
    const scenario = await createScenario();

    await prisma.ticket.update({
      where: { id: scenario.ticketTwo.id },
      data: {
        status: TicketStatus.VOIDED_BY_REFUND,
        voidedAt: new Date(),
        voidReason: 'PAYMENT_REFUNDED',
      },
    });

    const result = await service.build(scenario.draw.id);

    expect(result.ticketCount).toBe(2n);

    const entries = await prisma.ticketSnapshotEntry.findMany({
      where: {
        snapshot: {
          drawId: scenario.draw.id,
        },
      },
      orderBy: { position: 'asc' },
    });

    expect(entries.map((entry) => entry.ticketId)).toEqual([
      scenario.ticketOne.id,
      scenario.ticketThree.id,
    ]);
    expect(entries.map((entry) => entry.position)).toEqual([1n, 2n]);
  });

  it('is idempotent for a repeated build request', async () => {
    const scenario = await createScenario();

    const first = await service.build(scenario.draw.id);
    const second = await service.build(scenario.draw.id);

    expect(second).toEqual({
      snapshotId: first.snapshotId,
      drawId: scenario.draw.id,
      ticketCount: 3n,
      status: SnapshotStatus.BUILDING,
      alreadyBuilt: true,
    });

    expect(await prisma.ticketSnapshot.count()).toBe(1);
    expect(await prisma.ticketSnapshotEntry.count()).toBe(3);
  });

  it('creates different owner references for the same user in different draws', async () => {
    const scenario = await createScenario();

    const secondDraw = await prisma.lotteryDraw.create({
      data: {
        publicId: `W-2026-${randomUUID()}`,
        type: DrawType.WEEKLY,
        status: DrawStatus.SALES_OPEN,
        sequenceNumber: Math.floor(Math.random() * 1_000_000),
        scheduledDrawAt: new Date(Date.now() + 172_800_000),
        currency: 'USD',
        ticketPriceMinor: 100n,
      },
    });

    const secondDrawPurchase = await prisma.purchase.create({
      data: {
        publicId: `PUR-${randomUUID()}`,
        userId: scenario.firstUser.id,
        drawId: secondDraw.id,
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

    await ensureTestTicketAllocation(
      prisma,
      {
        purchaseId: secondDrawPurchase.id,
        drawId: secondDraw.id,
        numberInDraw: 1n,
      },
    );

    await prisma.ticket.create({
      data: {
        publicId: `TKT-${randomUUID()}`,
        userId: scenario.firstUser.id,
        purchaseId: secondDrawPurchase.id,
        drawId: secondDraw.id,
        numberInDraw: 1n,
      },
    });

    await prisma.lotteryDraw.update({
      where: { id: secondDraw.id },
      data: { status: DrawStatus.SALES_CLOSED },
    });

    await service.build(scenario.draw.id);
    await service.build(secondDraw.id);

    const firstEntry =
      await prisma.ticketSnapshotEntry.findFirstOrThrow({
        where: {
          snapshot: {
            drawId: scenario.draw.id,
          },
          ticket: {
            userId: scenario.firstUser.id,
          },
        },
      });

    const secondEntry =
      await prisma.ticketSnapshotEntry.findFirstOrThrow({
        where: {
          snapshot: {
            drawId: secondDraw.id,
          },
          ticket: {
            userId: scenario.firstUser.id,
          },
        },
      });

    expect(firstEntry.ownerPublicRef).not.toBe(
      secondEntry.ownerPublicRef,
    );
  });

  it('rejects a draw whose sales are not closed', async () => {
    const scenario = await createScenario();

    await prisma.lotteryDraw.update({
      where: { id: scenario.draw.id },
      data: { status: DrawStatus.SALES_OPEN },
    });

    await expect(
      service.build(scenario.draw.id),
    ).rejects.toThrow(
      `Snapshot cannot be built for a draw in ${DrawStatus.SALES_OPEN}`,
    );

    expect(await prisma.ticketSnapshot.count()).toBe(0);
    expect(await prisma.ticketSnapshotEntry.count()).toBe(0);
  });

  it('rejects an unknown draw', async () => {
    await expect(
      service.build(randomUUID()),
    ).rejects.toThrow('Lottery draw not found');
  });
});
