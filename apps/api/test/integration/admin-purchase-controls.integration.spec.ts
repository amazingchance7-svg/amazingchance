import {
  PaymentStatus,
  PurchaseStatus,
  UserStatus,
} from '@prisma/client';

import { AdminPurchaseControlsService } from '../../src/admin-operations/admin-purchase-controls.service';
import { Permissions } from '../../src/authorization/permissions.constants';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('Admin purchase operational controls', () => {
  let prisma: PrismaService;
  let service: AdminPurchaseControlsService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    service = new AdminPurchaseControlsService(prisma);
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function fixture(status: PurchaseStatus) {
    const user = await prisma.user.create({
      data: {
        email: `controls-${status.toLowerCase()}@example.com`,
        passwordHash: 'test-password-hash',
        status: UserStatus.ACTIVE,
      },
    });

    const draw = await prisma.lotteryDraw.create({
      data: {
        publicId: `draw-controls-${status.toLowerCase()}`,
        type: 'WEEKLY',
        status: 'SALES_OPEN',
        sequenceNumber:
          status === PurchaseStatus.PAYMENT_PENDING ? 92001 : 92002,
        scheduledDrawAt: new Date('2026-08-22T18:00:00.000Z'),
        currency: 'USD',
        ticketPriceMinor: 100n,
        winnerCount: 3,
      },
    });

    const purchase = await prisma.purchase.create({
      data: {
        publicId: `purchase-controls-${status.toLowerCase()}`,
        userId: user.id,
        drawId: draw.id,
        status,
        requestedTicketCount: 1,
        ticketPriceMinor: 100n,
        totalAmountMinor: 100n,
        currency: 'USD',
        idempotencyKey: `controls-${status.toLowerCase()}-key`,
      },
    });

    return { user, draw, purchase };
  }

  it('seeds operational control permissions only for PLATFORM_ADMIN', async () => {
    const platformAdmin = await prisma.role.findUniqueOrThrow({
      where: { code: 'PLATFORM_ADMIN' },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    const customer = await prisma.role.findUniqueOrThrow({
      where: { code: 'CUSTOMER' },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    const adminCodes = platformAdmin.permissions.map(
      (entry) => entry.permission.code,
    );
    const customerCodes = customer.permissions.map(
      (entry) => entry.permission.code,
    );

    expect(adminCodes).toContain(Permissions.PURCHASE_REVIEW_ADMIN);
    expect(adminCodes).toContain(Permissions.PURCHASE_CANCEL_ADMIN);
    expect(customerCodes).not.toContain(Permissions.PURCHASE_REVIEW_ADMIN);
    expect(customerCodes).not.toContain(Permissions.PURCHASE_CANCEL_ADMIN);
  });

  it('moves an unpaid PAYMENT_FAILED purchase into manual review and seals a state event', async () => {
    const { purchase } = await fixture(PurchaseStatus.PAYMENT_FAILED);

    const result = await service.markManualReview(
      purchase.id,
      'Payment failure requires operator review',
      '00000000-0000-4000-8000-000000009999',
    );

    expect(result).toMatchObject({
      purchaseId: purchase.id,
      fromStatus: PurchaseStatus.PAYMENT_FAILED,
      toStatus: PurchaseStatus.MANUAL_REVIEW,
      alreadyApplied: false,
    });

    const updated = await prisma.purchase.findUniqueOrThrow({
      where: { id: purchase.id },
    });

    expect(updated.status).toBe(PurchaseStatus.MANUAL_REVIEW);

    const event = await prisma.purchaseStateEvent.findFirstOrThrow({
      where: { purchaseId: purchase.id },
    });

    expect(event.toStatus).toBe(PurchaseStatus.MANUAL_REVIEW);
    expect(event.cause).toBe('ADMIN_MANUAL_REVIEW');
    expect(event.sealedAt).not.toBeNull();
  });

  it('cancels an unpaid manual-review purchase without issuing tickets or refunding money', async () => {
    const { purchase } = await fixture(PurchaseStatus.PAYMENT_FAILED);

    await service.markManualReview(
      purchase.id,
      'Investigate failed payment',
      null,
    );

    const result = await service.cancelManualReview(
      purchase.id,
      'Customer abandoned unpaid purchase',
      null,
    );

    expect(result.toStatus).toBe(PurchaseStatus.CANCELLED);

    const updated = await prisma.purchase.findUniqueOrThrow({
      where: { id: purchase.id },
      include: {
        tickets: true,
        payments: true,
      },
    });

    expect(updated.status).toBe(PurchaseStatus.CANCELLED);
    expect(updated.tickets).toHaveLength(0);
    expect(updated.payments).toHaveLength(0);
  });

  it('refuses to cancel manual review when a succeeded payment exists', async () => {
    const { purchase } = await fixture(PurchaseStatus.PAYMENT_FAILED);

    await service.markManualReview(
      purchase.id,
      'Investigate failed payment',
      null,
    );

    await prisma.payment.create({
      data: {
        purchaseId: purchase.id,
        provider: 'STRIPE',
        providerTransactionId: 'pi_controls_succeeded',
        status: PaymentStatus.SUCCEEDED,
        amountMinor: 100n,
        currency: 'USD',
        confirmedAt: new Date(),
      },
    });

    await expect(
      service.cancelManualReview(
        purchase.id,
        'Do not cancel paid purchase',
        null,
      ),
    ).rejects.toThrow(
      'successful or refunding payment activity',
    );
  });
});
