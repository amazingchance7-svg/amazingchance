import {
  AuditActorType,
  PurchaseStatus,
  UserStatus,
} from '@prisma/client';

import { AdminPurchaseControlsService } from '../../src/admin-operations/admin-purchase-controls.service';
import { AuditActions } from '../../src/audit/audit-events.constants';
import { AuditService } from '../../src/audit/audit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  cleanTestDatabase,
  createTestPrisma,
  executeAdminSql,
} from './database.helper';

describe('SEC-007 immutable privileged audit', () => {
  let prisma: PrismaService;
  let audit: AuditService;
  let controls: AdminPurchaseControlsService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    audit = new AuditService(prisma);
    controls = new AdminPurchaseControlsService(prisma);
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createPurchase(status: PurchaseStatus) {
    const suffix = crypto.randomUUID();

    const user = await prisma.user.create({
      data: {
        email: `sec007-${suffix}@example.com`,
        passwordHash: 'hash',
        status: UserStatus.ACTIVE,
      },
    });

    const draw = await prisma.lotteryDraw.create({
      data: {
        publicId: `sec007-draw-${suffix}`,
        type: 'WEEKLY',
        status: 'SALES_OPEN',
        sequenceNumber: Math.floor(
          100000 + Math.random() * 800000,
        ),
        scheduledDrawAt:
          new Date('2026-08-30T18:00:00.000Z'),
        currency: 'USD',
        ticketPriceMinor: 100n,
        winnerCount: 3,
      },
    });

    return prisma.purchase.create({
      data: {
        publicId: `sec007-purchase-${suffix}`,
        userId: user.id,
        drawId: draw.id,
        status,
        requestedTicketCount: 1,
        ticketPriceMinor: 100n,
        totalAmountMinor: 100n,
        currency: 'USD',
        idempotencyKey: `sec007-${suffix}`,
      },
    });
  }

  it('rejects runtime UPDATE and DELETE of an audit record', async () => {
    const row = await audit.record({
      actorType: AuditActorType.SYSTEM,
      action: AuditActions.AUTHORIZATION_DENIED,
      entityType: 'PERMISSION',
      entityId: 'sec007-runtime',
      correlationId: crypto.randomUUID(),
    });

    await expect(
      prisma.auditLog.update({
        where: { id: row.id },
        data: { entityId: 'tampered' },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.auditLog.delete({
        where: { id: row.id },
      }),
    ).rejects.toThrow();

    expect(
      await prisma.auditLog.findUnique({
        where: { id: row.id },
      }),
    ).toMatchObject({
      entityId: 'sec007-runtime',
    });
  });

  it('rejects mutation through the administrative DB connection', async () => {
    const row = await audit.record({
      actorType: AuditActorType.SYSTEM,
      action: AuditActions.AUTHORIZATION_DENIED,
      entityType: 'PERMISSION',
      entityId: 'sec007-admin',
      correlationId: crypto.randomUUID(),
    });

    await expect(
      executeAdminSql(`
        UPDATE "audit_logs"
        SET "entityId" = 'tampered'
        WHERE "id" = '${row.id}'::uuid
      `),
    ).rejects.toThrow('Audit logs are immutable');

    await expect(
      executeAdminSql(`
        DELETE FROM "audit_logs"
        WHERE "id" = '${row.id}'::uuid
      `),
    ).rejects.toThrow('Audit logs are immutable');
  });

  it('atomically audits admin manual review', async () => {
    const purchase = await createPurchase(
      PurchaseStatus.PAYMENT_PENDING,
    );
    const actorId = crypto.randomUUID();

    const result = await controls.markManualReview(
      purchase.id,
      'fraud review requested',
      actorId,
    );

    const row = await prisma.auditLog.findFirstOrThrow({
      where: {
        correlationId: result.correlationId,
        action:
          AuditActions.ADMIN_PURCHASE_MANUAL_REVIEW,
      },
    });

    expect(row).toMatchObject({
      actorType: AuditActorType.ADMIN,
      actorId,
      entityType: 'PURCHASE',
      entityId: purchase.id,
    });
    expect(row.previousState).toEqual({
      status: PurchaseStatus.PAYMENT_PENDING,
    });
    expect(row.newState).toEqual({
      status: PurchaseStatus.MANUAL_REVIEW,
    });
    expect(row.metadata).toEqual({
      reason: 'fraud review requested',
    });
    expect(row.sealedAt).not.toBeNull();
  });

  it('atomically audits admin cancellation', async () => {
    const purchase = await createPurchase(
      PurchaseStatus.MANUAL_REVIEW,
    );
    const actorId = crypto.randomUUID();

    const result = await controls.cancelManualReview(
      purchase.id,
      'review resolved by cancellation',
      actorId,
    );

    const row = await prisma.auditLog.findFirstOrThrow({
      where: {
        correlationId: result.correlationId,
        action:
          AuditActions.ADMIN_PURCHASE_CANCELLED,
      },
    });

    expect(row).toMatchObject({
      actorType: AuditActorType.ADMIN,
      actorId,
      entityType: 'PURCHASE',
      entityId: purchase.id,
    });
    expect(row.previousState).toEqual({
      status: PurchaseStatus.MANUAL_REVIEW,
    });
    expect(row.newState).toEqual({
      status: PurchaseStatus.CANCELLED,
    });
    expect(row.metadata).toEqual({
      reason: 'review resolved by cancellation',
    });
  });
});
