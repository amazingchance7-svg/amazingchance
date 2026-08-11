import {
  DrawStatus,
  DrawType,
  PurchaseStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('SEC-004 DB-bound ticket issuance', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function fixture() {
    const [owner, otherUser] =
      await Promise.all([
        prisma.user.create({
          data: {
            email:
              `${randomUUID()}@owner.example`,
            passwordHash: 'hash',
            status:
              UserStatus.ACTIVE,
            emailVerifiedAt:
              new Date(),
          },
        }),
        prisma.user.create({
          data: {
            email:
              `${randomUUID()}@other.example`,
            passwordHash: 'hash',
            status:
              UserStatus.ACTIVE,
            emailVerifiedAt:
              new Date(),
          },
        }),
      ]);

    const [draw, otherDraw] =
      await Promise.all([
        prisma.lotteryDraw.create({
          data: {
            publicId:
              `W-${randomUUID()}`,
            type:
              DrawType.WEEKLY,
            status:
              DrawStatus.SALES_OPEN,
            sequenceNumber:
              Math.floor(
                Math.random() *
                  1_000_000_000,
              ),
            scheduledDrawAt:
              new Date(
                Date.now() +
                  86_400_000,
              ),
            ticketPriceMinor:
              100n,
          },
        }),
        prisma.lotteryDraw.create({
          data: {
            publicId:
              `W-${randomUUID()}`,
            type:
              DrawType.WEEKLY,
            status:
              DrawStatus.SALES_OPEN,
            sequenceNumber:
              Math.floor(
                Math.random() *
                  1_000_000_000,
              ),
            scheduledDrawAt:
              new Date(
                Date.now() +
                  86_400_000,
              ),
            ticketPriceMinor:
              100n,
          },
        }),
      ]);

    const purchase =
      await prisma.purchase.create({
        data: {
          publicId:
            `PUR-${randomUUID()}`,
          userId: owner.id,
          drawId: draw.id,
          status:
            PurchaseStatus.PAYMENT_PENDING,
          requestedTicketCount: 3,
          ticketPriceMinor: 100n,
          totalAmountMinor: 300n,
          currency: 'USD',
          idempotencyKey:
            randomUUID(),
        },
      });

    const allocation =
      await prisma.ticketAllocation.create({
        data: {
          purchaseId:
            purchase.id,
          drawId: draw.id,
          startNumber: 10n,
          endNumber: 12n,
          correlationId:
            randomUUID(),
        },
      });

    return {
      owner,
      otherUser,
      draw,
      otherDraw,
      purchase,
      allocation,
    };
  }

  it('allows a ticket whose identity and number match the purchase allocation', async () => {
    const data = await fixture();

    await expect(
      prisma.ticket.create({
        data: {
          publicId:
            `TKT-${randomUUID()}`,
          userId: data.owner.id,
          purchaseId:
            data.purchase.id,
          drawId: data.draw.id,
          numberInDraw: 10n,
        },
      }),
    ).resolves.toMatchObject({
      userId: data.owner.id,
      purchaseId:
        data.purchase.id,
      drawId: data.draw.id,
      numberInDraw: 10n,
    });
  });

  it('rejects a ticket bound to another user', async () => {
    const data = await fixture();

    await expect(
      prisma.ticket.create({
        data: {
          publicId:
            `TKT-${randomUUID()}`,
          userId:
            data.otherUser.id,
          purchaseId:
            data.purchase.id,
          drawId: data.draw.id,
          numberInDraw: 10n,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects a ticket bound to another draw', async () => {
    const data = await fixture();

    await expect(
      prisma.ticket.create({
        data: {
          publicId:
            `TKT-${randomUUID()}`,
          userId: data.owner.id,
          purchaseId:
            data.purchase.id,
          drawId:
            data.otherDraw.id,
          numberInDraw: 10n,
        },
      }),
    ).rejects.toThrow();
  });

  it('rejects ticket issuance without a reserved allocation', async () => {
    const data = await fixture();

    await prisma.ticketAllocation.delete({
      where: {
        id:
          data.allocation.id,
      },
    });

    await expect(
      prisma.ticket.create({
        data: {
          publicId:
            `TKT-${randomUUID()}`,
          userId: data.owner.id,
          purchaseId:
            data.purchase.id,
          drawId: data.draw.id,
          numberInDraw: 10n,
        },
      }),
    ).rejects.toThrow(
      'Ticket requires a reserved purchase allocation',
    );
  });

  it('rejects a ticket number outside the reserved allocation', async () => {
    const data = await fixture();

    await expect(
      prisma.ticket.create({
        data: {
          publicId:
            `TKT-${randomUUID()}`,
          userId: data.owner.id,
          purchaseId:
            data.purchase.id,
          drawId: data.draw.id,
          numberInDraw: 13n,
        },
      }),
    ).rejects.toThrow(
      'Ticket number is outside its reserved allocation',
    );
  });
});
