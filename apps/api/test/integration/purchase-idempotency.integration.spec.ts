import {
  DrawStatus,
  DrawType,
  PurchaseStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PlayerProtectionService } from '../../src/compliance/player-protection.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PurchasesService } from '../../src/purchases/purchases.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('Purchase idempotency integration', () => {
  let prisma: PrismaService;
  let service: PurchasesService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    const playerProtection = {
      assertCanPurchaseInTransaction:
        jest.fn().mockResolvedValue({
          userId: 'fixture-user',
          countryCode: 'UA',
          policyVersion: 1,
          minimumAge: 18,
        }),
    } as unknown as PlayerProtectionService;
    service =
      new PurchasesService(
        prisma,
        playerProtection,
      );
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createScenario() {
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
        publicId: `W-2026-${randomUUID()}`,
        type: DrawType.WEEKLY,
        status: DrawStatus.SALES_OPEN,
        sequenceNumber:
          Math.floor(
            Math.random() * 1_000_000,
          ),
        salesOpenAt: new Date(
          Date.now() - 60_000,
        ),
        salesCloseAt: new Date(
          Date.now() + 3_600_000,
        ),
        scheduledDrawAt: new Date(
          Date.now() + 86_400_000,
        ),
        currency: 'USD',
        ticketPriceMinor: 100n,
      },
    });

    return {
      user,
      draw,
    };
  }

  it('returns the same purchase for an identical retry', async () => {
    const { user, draw } =
      await createScenario();

    const dto = {
      drawId: draw.id,
      requestedTicketCount: 3,
    };

    const first = await service.create(
      user.id,
      dto,
      'purchase-retry-001',
    );

    const second = await service.create(
      user.id,
      dto,
      'purchase-retry-001',
    );

    expect(second.id).toBe(first.id);
    expect(second.publicId).toBe(
      first.publicId,
    );

    expect(
      await prisma.purchase.count(),
    ).toBe(1);

    expect(
      await prisma.purchaseStateEvent.count(),
    ).toBe(1);
  });

  it('rejects reuse of a key with a different payload', async () => {
    const { user, draw } =
      await createScenario();

    await service.create(
      user.id,
      {
        drawId: draw.id,
        requestedTicketCount: 2,
      },
      'purchase-conflict-001',
    );

    await expect(
      service.create(
        user.id,
        {
          drawId: draw.id,
          requestedTicketCount: 4,
        },
        'purchase-conflict-001',
      ),
    ).rejects.toThrow(
      'Idempotency-Key was already used with a different purchase request',
    );

    expect(
      await prisma.purchase.count(),
    ).toBe(1);

    expect(
      await prisma.purchaseStateEvent.count(),
    ).toBe(1);
  });

  it('creates only one purchase for concurrent identical requests', async () => {
    const { user, draw } =
      await createScenario();

    const dto = {
      drawId: draw.id,
      requestedTicketCount: 5,
    };

    const results = await Promise.all([
      service.create(
        user.id,
        dto,
        'purchase-concurrent-001',
      ),
      service.create(
        user.id,
        dto,
        'purchase-concurrent-001',
      ),
    ]);

    expect(results[0].id).toBe(
      results[1].id,
    );

    const purchases =
      await prisma.purchase.findMany();

    expect(purchases).toHaveLength(1);

    expect(
      purchases[0].requestedTicketCount,
    ).toBe(5);

    expect(
      await prisma.purchaseStateEvent.count(),
    ).toBe(1);
  });

  it('scopes the same client key to different users', async () => {
    const firstScenario =
      await createScenario();

    const secondUser =
      await prisma.user.create({
        data: {
          email: `${randomUUID()}@example.com`,
          passwordHash: 'hash',
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
      });

    const dto = {
      drawId: firstScenario.draw.id,
      requestedTicketCount: 1,
    };

    const first = await service.create(
      firstScenario.user.id,
      dto,
      'shared-client-key',
    );

    const second = await service.create(
      secondUser.id,
      dto,
      'shared-client-key',
    );

    expect(second.id).not.toBe(first.id);

    expect(
      await prisma.purchase.count(),
    ).toBe(2);
  });

  it('allows only one concurrent cancellation transition', async () => {
    const { user, draw } =
      await createScenario();

    const created = await service.create(
      user.id,
      {
        drawId: draw.id,
        requestedTicketCount: 2,
      },
      'purchase-cancel-001',
    );

    const results =
      await Promise.allSettled([
        service.cancel(
          user.id,
          created.id,
        ),
        service.cancel(
          user.id,
          created.id,
        ),
      ]);

    const fulfilled = results.filter(
      (
        result,
      ): result is PromiseFulfilledResult<
        Awaited<
          ReturnType<
            PurchasesService['cancel']
          >
        >
      > =>
        result.status === 'fulfilled',
    );

    const rejected = results.filter(
      (
        result,
      ): result is PromiseRejectedResult =>
        result.status === 'rejected',
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    expect(
      fulfilled[0].value.status,
    ).toBe(PurchaseStatus.CANCELLED);

    expect(
      await prisma.purchaseStateEvent.count({
        where: {
          purchaseId: created.id,
          toStatus:
            PurchaseStatus.CANCELLED,
        },
      }),
    ).toBe(1);

    const persisted =
      await prisma.purchase.findUniqueOrThrow({
        where: {
          id: created.id,
        },
      });

    expect(persisted.status).toBe(
      PurchaseStatus.CANCELLED,
    );
  });
});
