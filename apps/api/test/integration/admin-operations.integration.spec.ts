import {
  PaymentStatus,
  PrismaClient,
  PurchaseStatus,
  TicketStatus,
  UserStatus,
} from '@prisma/client';

import { AdminOperationsService } from '../../src/admin-operations/admin-operations.service';
import { Permissions } from '../../src/authorization/permissions.constants';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';
import {
  createTestAdminPrisma,
} from './database-role.helper';
import {
  ensureTestTicketAllocation,
} from './ticket-fixture.helper';


describe('Admin operations backoffice', () => {
  let prisma: PrismaService;
  let fixturePrisma: PrismaClient;
  let service: AdminOperationsService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    fixturePrisma = await createTestAdminPrisma();
    service = new AdminOperationsService(prisma);
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await Promise.all([
      prisma.$disconnect(),
      fixturePrisma.$disconnect(),
    ]);
  });

  it('separates backoffice read permissions between PLATFORM_ADMIN and BUSINESS_OWNER', async () => {
    const roles = await prisma.role.findMany({
      where: {
        code: {
          in: [
            'BUSINESS_OWNER',
            'PLATFORM_ADMIN',
            'DRAW_OPERATOR',
            'CUSTOMER',
          ],
        },
      },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    const codesByRole = new Map(
      roles.map((role) => [
        role.code,
        role.permissions.map(
          (entry) => entry.permission.code,
        ),
      ]),
    );

    const platformCodes =
      codesByRole.get('PLATFORM_ADMIN') ?? [];
    const ownerCodes =
      codesByRole.get('BUSINESS_OWNER') ?? [];
    const operatorCodes =
      codesByRole.get('DRAW_OPERATOR') ?? [];
    const customerCodes =
      codesByRole.get('CUSTOMER') ?? [];

    for (const permission of [
      Permissions.USER_READ_ADMIN,
      Permissions.PURCHASE_READ_ADMIN,
      Permissions.TICKET_READ_ADMIN,
    ]) {
      expect(platformCodes).toContain(permission);
    }

    expect(platformCodes).not.toContain(
      Permissions.FINANCE_READ_ADMIN,
    );

    for (const permission of [
      Permissions.PURCHASE_READ_ADMIN,
      Permissions.TICKET_READ_ADMIN,
      Permissions.FINANCE_READ_ADMIN,
    ]) {
      expect(ownerCodes).toContain(permission);
    }

    expect(ownerCodes).not.toContain(
      Permissions.USER_READ_ADMIN,
    );

    for (const permission of [
      Permissions.USER_READ_ADMIN,
      Permissions.PURCHASE_READ_ADMIN,
      Permissions.TICKET_READ_ADMIN,
      Permissions.FINANCE_READ_ADMIN,
    ]) {
      expect(operatorCodes).not.toContain(permission);
      expect(customerCodes).not.toContain(permission);
    }
  });

  it('returns aggregate overview without exposing secret fields', async () => {
    const user = await fixturePrisma.user.create({
      data: {
        email: 'admin-overview-customer@example.com',
        passwordHash: 'integration-test-password-hash',
        status: UserStatus.ACTIVE,
      },
    });

    const draw = await fixturePrisma.lotteryDraw.create({
      data: {
        publicId: 'weekly-admin-overview',
        type: 'WEEKLY',
        status: 'SALES_OPEN',
        sequenceNumber: 91001,
        scheduledDrawAt: new Date('2026-08-20T18:00:00.000Z'),
        currency: 'USD',
        ticketPriceMinor: 100n,
        winnerCount: 3,
      },
    });

    const purchase = await fixturePrisma.purchase.create({
      data: {
        publicId: 'purchase-admin-overview',
        userId: user.id,
        drawId: draw.id,
        status: PurchaseStatus.COMPLETED,
        requestedTicketCount: 2,
        ticketPriceMinor: 100n,
        totalAmountMinor: 200n,
        currency: 'USD',
        idempotencyKey: 'admin-overview-purchase-key',
        paymentConfirmedAt: new Date(),
        completedAt: new Date(),
      },
    });

    await fixturePrisma.payment.create({
      data: {
        purchaseId: purchase.id,
        provider: 'STRIPE',
        providerTransactionId: 'pi_admin_overview',
        status: PaymentStatus.SUCCEEDED,
        amountMinor: 200n,
        currency: 'USD',
        confirmedAt: new Date(),
      },
    });

    await ensureTestTicketAllocation(
      fixturePrisma,
      {
        purchaseId: purchase.id,
        drawId: draw.id,
        numberInDraw: 1n,
      },
    );

    await fixturePrisma.ticket.create({
      data: {
        publicId: 'ticket-admin-overview',
        userId: user.id,
        purchaseId: purchase.id,
        drawId: draw.id,
        numberInDraw: 1n,
        status: TicketStatus.ACTIVE,
      },
    });

    const result = await service.overview();

    expect(result.users).toMatchObject({
      total: 1,
      active: 1,
    });
    expect(result.purchases).toMatchObject({
      total: 1,
      completed: 1,
    });
    expect(result.tickets).toMatchObject({
      total: 1,
      active: 1,
    });
    expect(result.finance.completedPurchaseVolume).toEqual([
      {
        currency: 'USD',
        amountMinor: '200',
        purchaseCount: 1,
      },
    ]);
    expect(result.finance.successfulPaymentVolume).toEqual([
      {
        currency: 'USD',
        amountMinor: '200',
        paymentCount: 1,
      },
    ]);
  });

  it('returns sanitized recent users, purchases and tickets', async () => {
    const customerRole = await prisma.role.findUniqueOrThrow({
      where: { code: 'CUSTOMER' },
    });

    const user = await fixturePrisma.user.create({
      data: {
        email: 'backoffice-customer@example.com',
        passwordHash: 'must-never-be-returned',
        status: UserStatus.ACTIVE,
        roles: {
          create: {
            roleId: customerRole.id,
          },
        },
      },
    });

    const draw = await fixturePrisma.lotteryDraw.create({
      data: {
        publicId: 'weekly-backoffice-list',
        type: 'WEEKLY',
        status: 'SALES_OPEN',
        sequenceNumber: 91002,
        scheduledDrawAt: new Date('2026-08-21T18:00:00.000Z'),
        currency: 'USD',
        ticketPriceMinor: 100n,
        winnerCount: 3,
      },
    });

    const purchase = await fixturePrisma.purchase.create({
      data: {
        publicId: 'purchase-backoffice-list',
        userId: user.id,
        drawId: draw.id,
        status: PurchaseStatus.COMPLETED,
        requestedTicketCount: 1,
        ticketPriceMinor: 100n,
        totalAmountMinor: 100n,
        currency: 'USD',
        idempotencyKey: 'backoffice-list-purchase-key',
        completedAt: new Date(),
      },
    });

    await ensureTestTicketAllocation(
      fixturePrisma,
      {
        purchaseId: purchase.id,
        drawId: draw.id,
        numberInDraw: 44n,
      },
    );

    await fixturePrisma.ticket.create({
      data: {
        publicId: 'ticket-backoffice-list',
        userId: user.id,
        purchaseId: purchase.id,
        drawId: draw.id,
        numberInDraw: 44n,
        status: TicketStatus.ACTIVE,
      },
    });

    const [users, purchases, tickets] = await Promise.all([
      service.users(),
      service.purchases(),
      service.tickets(),
    ]);

    expect(users.items[0]).toMatchObject({
      email: user.email,
      roles: ['CUSTOMER'],
      purchaseCount: 1,
      ticketCount: 1,
    });
    expect(users.items[0]).not.toHaveProperty('passwordHash');

    expect(purchases.items[0]).toMatchObject({
      publicId: purchase.publicId,
      totalAmountMinor: '100',
      ticketPriceMinor: '100',
      currency: 'USD',
      ticketCount: 1,
    });
    expect(purchases.items[0].user.email).toBe(user.email);

    expect(tickets.items[0]).toMatchObject({
      publicId: 'ticket-backoffice-list',
      numberInDraw: '44',
      status: TicketStatus.ACTIVE,
    });
    expect(tickets.items[0].user.email).toBe(user.email);
  });
});
