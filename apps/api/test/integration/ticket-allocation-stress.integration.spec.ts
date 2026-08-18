import {
  DrawStatus,
  DrawType,
  PurchaseStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PaymentPrismaService, PrismaService } from '../../src/prisma/prisma.service';
import { TicketAllocationService } from '../../src/tickets/ticket-allocation.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';
import {
  createTestAdminPrisma,
  createTestPaymentPrisma,
} from './database-role.helper';

describe('Ticket allocation stress integration', () => {
  let prisma: PrismaService;
  let fixturePrisma: Awaited<ReturnType<typeof createTestAdminPrisma>>;
  let paymentPrisma: PaymentPrismaService;
  let service: TicketAllocationService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    fixturePrisma = await createTestAdminPrisma();
    paymentPrisma = await createTestPaymentPrisma();
    service = new TicketAllocationService();
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await Promise.all([
      prisma.$disconnect(),
      fixturePrisma.$disconnect(),
      paymentPrisma.$disconnect(),
    ]);
  });

  it('allocates 50 parallel non-overlapping ranges without gaps', async () => {
    const user = await fixturePrisma.user.create({
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
        sequenceNumber: Math.floor(
          Math.random() * 1_000_000,
        ),
        scheduledDrawAt: new Date(
          Date.now() + 86_400_000,
        ),
        currency: 'USD',
        ticketPriceMinor: 100n,
      },
    });

    const purchaseCount = 50;

    const ticketCounts = Array.from(
      { length: purchaseCount },
      (_, index) => (index % 7) + 1,
    );

    const purchases = await Promise.all(
      ticketCounts.map((ticketCount, index) =>
        fixturePrisma.purchase.create({
          data: {
            publicId:
              `PUR-${index}-${randomUUID()}`,
            userId: user.id,
            drawId: draw.id,
            status:
              PurchaseStatus.PAYMENT_CONFIRMED,
            requestedTicketCount: ticketCount,
            ticketPriceMinor: 100n,
            totalAmountMinor:
              BigInt(ticketCount) * 100n,
            currency: 'USD',
            idempotencyKey: randomUUID(),
            paymentConfirmedAt: new Date(),
          },
        }),
      ),
    );

    const allocations = await Promise.all(
      purchases.map((purchase, index) =>
        paymentPrisma.$transaction((tx) =>
          service.reserveRange(tx, {
            purchaseId: purchase.id,
            drawId: draw.id,
            ticketCount:
              ticketCounts[index],
            correlationId: randomUUID(),
          }),
        ),
      ),
    );

    expect(allocations).toHaveLength(
      purchaseCount,
    );

    expect(
      allocations.every(
        (result) =>
          result.alreadyAllocated === false,
      ),
    ).toBe(true);

    const sorted = allocations
      .map((result) => result.allocation)
      .sort((left, right) => {
        if (
          left.startNumber <
          right.startNumber
        ) {
          return -1;
        }

        if (
          left.startNumber >
          right.startNumber
        ) {
          return 1;
        }

        return 0;
      });

    let expectedStart = 1n;

    for (const allocation of sorted) {
      expect(
        allocation.startNumber,
      ).toBe(expectedStart);

      expect(
        allocation.endNumber,
      ).toBeGreaterThanOrEqual(
        allocation.startNumber,
      );

      expectedStart =
        allocation.endNumber + 1n;
    }

    const expectedTicketTotal =
      ticketCounts.reduce(
        (sum, count) => sum + count,
        0,
      );

    expect(expectedStart - 1n).toBe(
      BigInt(expectedTicketTotal),
    );

    const persistedAllocations =
      await prisma.ticketAllocation.findMany({
        where: {
          drawId: draw.id,
        },
      });

    expect(
      persistedAllocations,
    ).toHaveLength(purchaseCount);

    const uniqueStarts = new Set(
      persistedAllocations.map(
        (allocation) =>
          allocation.startNumber.toString(),
      ),
    );

    const uniqueEnds = new Set(
      persistedAllocations.map(
        (allocation) =>
          allocation.endNumber.toString(),
      ),
    );

    expect(uniqueStarts.size).toBe(
      purchaseCount,
    );

    expect(uniqueEnds.size).toBe(
      purchaseCount,
    );

    const sequence =
      await prisma.ticketSequence.findUniqueOrThrow({
        where: {
          drawId: draw.id,
        },
      });

    expect(sequence.nextNumber).toBe(
      BigInt(expectedTicketTotal + 1),
    );
  });

  it('isolates concurrent sequences for different draws', async () => {
    const user = await fixturePrisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const draws = await Promise.all(
      [1, 2].map((sequenceNumber) =>
        fixturePrisma.lotteryDraw.create({
          data: {
            publicId:
              `W-2026-${randomUUID()}`,
            type: DrawType.WEEKLY,
            status: DrawStatus.SALES_OPEN,
            sequenceNumber:
              Math.floor(
                Math.random() *
                  1_000_000,
              ) + sequenceNumber,
            scheduledDrawAt: new Date(
              Date.now() + 86_400_000,
            ),
            currency: 'USD',
            ticketPriceMinor: 100n,
          },
        }),
      ),
    );

    const purchases = await Promise.all(
      draws.flatMap((draw) =>
        Array.from(
          { length: 10 },
          async () =>
            fixturePrisma.purchase.create({
              data: {
                publicId:
                  `PUR-${randomUUID()}`,
                userId: user.id,
                drawId: draw.id,
                status:
                  PurchaseStatus
                    .PAYMENT_CONFIRMED,
                requestedTicketCount: 2,
                ticketPriceMinor: 100n,
                totalAmountMinor: 200n,
                currency: 'USD',
                idempotencyKey:
                  randomUUID(),
                paymentConfirmedAt:
                  new Date(),
              },
            }),
        ),
      ),
    );

    await Promise.all(
      purchases.map((purchase) =>
        paymentPrisma.$transaction((tx) =>
          service.reserveRange(tx, {
            purchaseId: purchase.id,
            drawId: purchase.drawId,
            ticketCount: 2,
            correlationId: randomUUID(),
          }),
        ),
      ),
    );

    for (const draw of draws) {
      const allocations =
        await prisma.ticketAllocation.findMany({
          where: {
            drawId: draw.id,
          },
          orderBy: {
            startNumber: 'asc',
          },
        });

      expect(allocations).toHaveLength(10);
      expect(
        allocations[0].startNumber,
      ).toBe(1n);

      expect(
        allocations[
          allocations.length - 1
        ].endNumber,
      ).toBe(20n);
    }
  });
});
