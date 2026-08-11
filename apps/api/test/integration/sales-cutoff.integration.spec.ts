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
import {
  ensureTestTicketAllocation,
} from './ticket-fixture.helper';


describe('SEC-001 hard ticket sales cutoff integration', () => {
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

  async function createFixture(input: {
    status?: DrawStatus;
    salesOpenAt?: Date | null;
    salesCloseAt?: Date | null;
    scheduledDrawAt: Date;
  }) {
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.com`,
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const draw = await prisma.lotteryDraw.create({
      data: {
        publicId: `W-SEC001-${randomUUID()}`,
        type: DrawType.WEEKLY,
        status: input.status ?? DrawStatus.SALES_OPEN,
        sequenceNumber: Math.floor(Math.random() * 1_000_000),
        scheduledDrawAt: input.scheduledDrawAt,
        salesOpenAt: input.salesOpenAt ?? null,
        salesCloseAt: input.salesCloseAt ?? null,
        currency: 'USD',
        ticketPriceMinor: 100n,
      },
    });

    const purchase = await prisma.purchase.create({
      data: {
        publicId: `PUR-SEC001-${randomUUID()}`,
        userId: user.id,
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

    return { user, draw, purchase };
  }

  async function issueTicket(
    fixture: Awaited<ReturnType<typeof createFixture>>,
  ) {
    await ensureTestTicketAllocation(
      prisma,
      {
        purchaseId: fixture.purchase.id,
        drawId: fixture.draw.id,
        numberInDraw: 1n,
      },
    );

    return prisma.ticket.create({
      data: {
        publicId: `TKT-SEC001-${randomUUID()}`,
        userId: fixture.user.id,
        purchaseId: fixture.purchase.id,
        drawId: fixture.draw.id,
        numberInDraw: 1n,
      },
    });
  }

  it('allows ticket issuance while more than ten minutes remain', async () => {
    const fixture = await createFixture({
      scheduledDrawAt: new Date(Date.now() + 20 * 60 * 1000),
    });

    await expect(issueTicket(fixture)).resolves.toMatchObject({
      drawId: fixture.draw.id,
      purchaseId: fixture.purchase.id,
    });
  });

  it('blocks ticket issuance inside the final ten minutes', async () => {
    const fixture = await createFixture({
      scheduledDrawAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    await expect(issueTicket(fixture)).rejects.toThrow(
      'Tickets cannot be issued after the hard sales cutoff',
    );
  });

  it('blocks ticket issuance after an earlier explicit salesCloseAt', async () => {
    const fixture = await createFixture({
      salesCloseAt: new Date(Date.now() - 60 * 1000),
      scheduledDrawAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(issueTicket(fixture)).rejects.toThrow(
      'Tickets cannot be issued after the hard sales cutoff',
    );
  });

  it('blocks ticket issuance before salesOpenAt', async () => {
    const fixture = await createFixture({
      salesOpenAt: new Date(Date.now() + 10 * 60 * 1000),
      scheduledDrawAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(issueTicket(fixture)).rejects.toThrow(
      'Tickets cannot be issued before salesOpenAt',
    );
  });

  it('blocks ticket issuance unless draw status is SALES_OPEN', async () => {
    const fixture = await createFixture({
      status: DrawStatus.SCHEDULED,
      scheduledDrawAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await expect(issueTicket(fixture)).rejects.toThrow(
      'Tickets can only be issued while draw sales are open',
    );
  });

  it('rejects a draw salesCloseAt later than the hard cutoff', async () => {
    const scheduledDrawAt = new Date(Date.now() + 60 * 60 * 1000);

    await expect(
      prisma.lotteryDraw.create({
        data: {
          publicId: `W-SEC001-CONSTRAINT-${randomUUID()}`,
          type: DrawType.WEEKLY,
          status: DrawStatus.SALES_OPEN,
          sequenceNumber: Math.floor(Math.random() * 1_000_000),
          scheduledDrawAt,
          salesCloseAt: new Date(
            scheduledDrawAt.getTime() - 5 * 60 * 1000,
          ),
          currency: 'USD',
          ticketPriceMinor: 100n,
        },
      }),
    ).rejects.toThrow();
  });

  it('uses wall-clock time even when the transaction started before cutoff', async () => {
    const hardCutoffAt = new Date(Date.now() + 3_000);
    const fixture = await createFixture({
      scheduledDrawAt: new Date(
        hardCutoffAt.getTime() + 10 * 60 * 1000,
      ),
    });

    await expect(
      prisma.$transaction(async (tx) => {
        const [{ transactionStartedAt }] = await tx.$queryRaw<
          { transactionStartedAt: Date }[]
        >`
          SELECT transaction_timestamp() AS "transactionStartedAt"
        `;

        expect(
          transactionStartedAt.getTime(),
        ).toBeLessThan(hardCutoffAt.getTime());

        await new Promise((resolve) => setTimeout(resolve, 3_500));

        await ensureTestTicketAllocation(
          tx,
          {
            purchaseId: fixture.purchase.id,
            drawId: fixture.draw.id,
            numberInDraw: 1n,
          },
        );

        return tx.ticket.create({
          data: {
            publicId: `TKT-SEC001-WALLCLOCK-${randomUUID()}`,
            userId: fixture.user.id,
            purchaseId: fixture.purchase.id,
            drawId: fixture.draw.id,
            numberInDraw: 1n,
          },
        });
      }),
    ).rejects.toThrow(
      'Tickets cannot be issued after the hard sales cutoff',
    );
  });
});
