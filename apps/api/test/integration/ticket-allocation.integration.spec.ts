import {
  DrawStatus,
  DrawType,
  PurchaseStatus,
  UserStatus,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { PaymentPrismaService, PrismaService } from "../../src/prisma/prisma.service";
import { TicketAllocationService } from "../../src/tickets/ticket-allocation.service";
import {
  cleanTestDatabase,
  createTestPrisma,
} from "./database.helper";
import {
  createTestAdminPrisma,
  createTestPaymentPrisma,
} from "./database-role.helper";

describe("TicketAllocationService concurrency integration", () => {
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

  it("allocates non-overlapping contiguous ranges under concurrency", async () => {
    const user = await fixturePrisma.user.create({
      data: {
        email: "tickets@example.com",
        passwordHash: "test-password-hash",
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const draw = await fixturePrisma.lotteryDraw.create({
      data: {
        publicId: `draw_${randomUUID()}`,
        type: DrawType.WEEKLY,
        status: DrawStatus.SALES_OPEN,
        sequenceNumber: 1,
        scheduledDrawAt: new Date(Date.now() + 86_400_000),
        ticketPriceMinor: 100n,
      },
    });

    const counts = [1, 3, 2, 5, 4];

    const purchases = await Promise.all(
      counts.map((ticketCount, index) =>
        fixturePrisma.purchase.create({
          data: {
            publicId: `purchase_${index}_${randomUUID()}`,
            userId: user.id,
            drawId: draw.id,
            status: PurchaseStatus.PAYMENT_CONFIRMED,
            requestedTicketCount: ticketCount,
            ticketPriceMinor: 100n,
            totalAmountMinor: BigInt(ticketCount * 100),
            currency: "USD",
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
            ticketCount: counts[index],
            correlationId: randomUUID(),
          }),
        ),
      ),
    );

    const sorted = allocations
      .map((result) => result.allocation)
      .sort((a, b) =>
        a.startNumber < b.startNumber ? -1 : 1,
      );

    let expectedStart = 1n;

    for (const allocation of sorted) {
      expect(allocation.startNumber).toBe(expectedStart);
      expect(allocation.endNumber).toBeGreaterThanOrEqual(
        allocation.startNumber,
      );
      expectedStart = allocation.endNumber + 1n;
    }

    expect(expectedStart - 1n).toBe(
      BigInt(counts.reduce((sum, count) => sum + count, 0)),
    );
  });

  it("returns the existing allocation when the same purchase is retried", async () => {
    const user = await fixturePrisma.user.create({
      data: {
        email: "retry@example.com",
        passwordHash: "test-password-hash",
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const draw = await fixturePrisma.lotteryDraw.create({
      data: {
        publicId: `draw_${randomUUID()}`,
        type: DrawType.WEEKLY,
        status: DrawStatus.SALES_OPEN,
        sequenceNumber: 1,
        scheduledDrawAt: new Date(Date.now() + 86_400_000),
        ticketPriceMinor: 100n,
      },
    });

    const purchase = await fixturePrisma.purchase.create({
      data: {
        publicId: `purchase_${randomUUID()}`,
        userId: user.id,
        drawId: draw.id,
        status: PurchaseStatus.PAYMENT_CONFIRMED,
        requestedTicketCount: 3,
        ticketPriceMinor: 100n,
        totalAmountMinor: 300n,
        currency: "USD",
        idempotencyKey: randomUUID(),
        paymentConfirmedAt: new Date(),
      },
    });

    const first = await paymentPrisma.$transaction((tx) =>
      service.reserveRange(tx, {
        purchaseId: purchase.id,
        drawId: draw.id,
        ticketCount: 3,
        correlationId: randomUUID(),
      }),
    );

    const second = await paymentPrisma.$transaction((tx) =>
      service.reserveRange(tx, {
        purchaseId: purchase.id,
        drawId: draw.id,
        ticketCount: 3,
        correlationId: randomUUID(),
      }),
    );

    expect(first.alreadyAllocated).toBe(false);
    expect(second.alreadyAllocated).toBe(true);
    expect(second.allocation.id).toBe(first.allocation.id);
  });
});
