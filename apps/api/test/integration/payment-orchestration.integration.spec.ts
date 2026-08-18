import {
  DrawStatus,
  DrawType,
  LedgerAccountCode,
  LedgerSide,
  LedgerTransactionType,
  PaymentStatus,
  PrismaClient,
  PurchaseStatus,
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PlayerProtectionService } from '../../src/compliance/player-protection.service';
import { FinancialAllocationService } from '../../src/finance/financial-allocation.service';
import { LedgerService } from '../../src/ledger/ledger.service';
import { PaymentOrchestratorService } from '../../src/payments/payment-orchestrator.service';
import {
  PaymentPrismaService,
  PrismaService,
} from '../../src/prisma/prisma.service';
import { TicketAllocationService } from '../../src/tickets/ticket-allocation.service';
import {
  cleanTestDatabase,
  createTestPrisma,
  executeAdminSql,
} from './database.helper';
import {
  createTestAdminPrisma,
  createTestPaymentPrisma,
} from './database-role.helper';

describe('Verified payment orchestration integration', () => {
  let prisma: PrismaService;
  let fixturePrisma: PrismaClient;
  let paymentPrisma: PaymentPrismaService;
  let service: PaymentOrchestratorService;

  beforeAll(async () => {
    prisma =
      await createTestPrisma();
    fixturePrisma =
      await createTestAdminPrisma();
    paymentPrisma =
      await createTestPaymentPrisma();
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
      new PaymentOrchestratorService(
        paymentPrisma,
        new LedgerService(paymentPrisma),
        new TicketAllocationService(),
        new FinancialAllocationService(
          paymentPrisma,
        ),
        playerProtection,
      );
  });

  beforeEach(async () => {
    await cleanTestDatabase(
      prisma,
    );

    await fixturePrisma.allocationRule.create({
      data: {
        version:
          1,
        weeklyJackpotBps:
          7000,
        annualJackpotBps:
          1000,
        companyRevenueBps:
          2000,
        effectiveFrom:
          new Date(
            '2026-01-01T00:00:00.000Z',
          ),
      },
    });
  });

  afterAll(async () => {
    await Promise.all([
      prisma.$disconnect(),
      fixturePrisma.$disconnect(),
      paymentPrisma.$disconnect(),
    ]);
  });

  async function scenario(
    ticketCount = 3,
    options?: {
      purchaseStatus?:
        PurchaseStatus;
      paymentStatus?:
        PaymentStatus;
      drawStatus?:
        DrawStatus;
      paymentAmountMinor?:
        bigint;
      paymentCurrency?:
        string;
    },
  ) {
    const user =
      await fixturePrisma.user.create({
        data: {
          email:
            `${randomUUID()}@example.com`,
          passwordHash:
            'hash',
          status:
            UserStatus.ACTIVE,
          emailVerifiedAt:
            new Date(),
        },
      });

    const draw =
      await fixturePrisma.lotteryDraw.create({
        data: {
          publicId:
            `W-2026-${randomUUID()}`,
          type:
            DrawType.WEEKLY,
          status:
            options?.drawStatus ??
            DrawStatus.SALES_OPEN,
          sequenceNumber:
            Math.floor(
              Math.random() *
                1_000_000,
            ),
          scheduledDrawAt:
            new Date(
              Date.now() +
                86_400_000,
            ),
          currency:
            'USD',
          ticketPriceMinor:
            100n,
        },
      });

    const purchase =
      await fixturePrisma.purchase.create({
        data: {
          publicId:
            `PUR-${randomUUID()}`,
          userId:
            user.id,
          drawId:
            draw.id,
          status:
            options?.purchaseStatus ??
            PurchaseStatus.PAYMENT_PENDING,
          requestedTicketCount:
            ticketCount,
          ticketPriceMinor:
            100n,
          totalAmountMinor:
            BigInt(ticketCount) *
            100n,
          currency:
            'USD',
          idempotencyKey:
            randomUUID(),
        },
      });

    const payment =
      await fixturePrisma.payment.create({
        data: {
          purchaseId:
            purchase.id,
          provider:
            'TEST',
          providerTransactionId:
            randomUUID(),
          status:
            options?.paymentStatus ??
            PaymentStatus.SUCCEEDED,
          amountMinor:
            options
              ?.paymentAmountMinor ??
            BigInt(ticketCount) *
              100n,
          currency:
            options
              ?.paymentCurrency ??
            'USD',
          confirmedAt:
            new Date(),
        },
      });

    return {
      user,
      draw,
      purchase,
      payment,
    };
  }

  async function expectNoOrchestrationSideEffects(
    purchaseId: string,
  ): Promise<void> {
    expect(
      (
        await prisma.purchase.findUniqueOrThrow({
          where: {
            id:
              purchaseId,
          },
        })
      ).status,
    ).not.toBe(
      PurchaseStatus.COMPLETED,
    );

    expect(
      await prisma.ledgerTransaction.count(),
    ).toBe(0);

    expect(
      await prisma.ticketAllocation.count(),
    ).toBe(0);

    expect(
      await prisma.ticket.count(),
    ).toBe(0);

    expect(
      await prisma.purchaseStateEvent.count(),
    ).toBe(0);
  }

  it('commits payment ledger, allocation ledger, purchase, allocation and tickets atomically', async () => {
    const s =
      await scenario(3);

    const result =
      await service.confirmPayment(
        s.payment.id,
      );

    expect(
      result.ticketCount,
    ).toBe(3);

    expect(
      result.allocationRuleVersion,
    ).toBe(1);

    expect(
      (
        await prisma.purchase.findUniqueOrThrow({
          where: {
            id:
              s.purchase.id,
          },
        })
      ).status,
    ).toBe(
      PurchaseStatus.COMPLETED,
    );

    expect(
      await prisma.ledgerTransaction.count(),
    ).toBe(2);

    expect(
      await prisma.ticketAllocation.count(),
    ).toBe(1);

    expect(
      await prisma.purchaseStateEvent.count(),
    ).toBe(1);
    const notification =
      await prisma
        .notificationOutbox
        .findUnique({
          where: {
            idempotencyKey:
              `purchase-completed:${s.purchase.id}`,
          },
        });

    expect(
      notification,
    ).toMatchObject({
      recipientEmail:
        s.user.email,
      status:
        'PENDING',
    });

    expect(
      notification?.payload,
    ).toMatchObject({
      purchasePublicId:
        s.purchase.publicId,
      drawPublicId:
        s.draw.publicId,
      ticketNumbers: [
        '1',
        '2',
        '3',
      ],
    });

    const ledgerTransactions =
      await prisma.ledgerTransaction.findMany({
        where: {
          referenceType:
            'PAYMENT',
          referenceId:
            s.payment.id,
        },
        include: {
          postings: true,
        },
        orderBy: {
          createdAt:
            'asc',
        },
      });

    expect(
      ledgerTransactions,
    ).toHaveLength(2);

    const paymentLedger =
      ledgerTransactions.find(
        (transaction) =>
          transaction.type ===
          LedgerTransactionType.PAYMENT_CONFIRMED,
      );

    const allocationLedger =
      ledgerTransactions.find(
        (transaction) =>
          transaction.type ===
          LedgerTransactionType.PAYMENT_ALLOCATION,
      );

    expect(
      paymentLedger,
    ).toBeDefined();

    expect(
      allocationLedger,
    ).toBeDefined();

    expect(
      paymentLedger?.postings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountCode:
            LedgerAccountCode.CASH,
          side:
            LedgerSide.DEBIT,
          amountMinor:
            300n,
        }),
        expect.objectContaining({
          accountCode:
            LedgerAccountCode.PAYMENT_CLEARING,
          side:
            LedgerSide.CREDIT,
          amountMinor:
            300n,
        }),
      ]),
    );

    expect(
      allocationLedger?.postings,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountCode:
            LedgerAccountCode.PAYMENT_CLEARING,
          side:
            LedgerSide.DEBIT,
          amountMinor:
            300n,
        }),
        expect.objectContaining({
          accountCode:
            LedgerAccountCode.WEEKLY_JACKPOT,
          side:
            LedgerSide.CREDIT,
          amountMinor:
            210n,
        }),
        expect.objectContaining({
          accountCode:
            LedgerAccountCode.ANNUAL_JACKPOT,
          side:
            LedgerSide.CREDIT,
          amountMinor:
            30n,
        }),
        expect.objectContaining({
          accountCode:
            LedgerAccountCode.COMPANY_REVENUE,
          side:
            LedgerSide.CREDIT,
          amountMinor:
            60n,
        }),
      ]),
    );

    expect(
      allocationLedger?.metadata,
    ).toMatchObject({
      allocationRuleVersion:
        1,
      weeklyJackpotBps:
        7000,
      annualJackpotBps:
        1000,
      companyRevenueBps:
        2000,
      weeklyJackpotMinor:
        '210',
      annualJackpotMinor:
        '30',
      companyRevenueMinor:
        '60',
    });

    const tickets =
      await prisma.ticket.findMany({
        where: {
          purchaseId:
            s.purchase.id,
        },
        orderBy: {
          numberInDraw:
            'asc',
        },
      });

    expect(
      tickets.map(
        (ticket) =>
          ticket.numberInDraw.toString(),
      ),
    ).toEqual([
      '1',
      '2',
      '3',
    ]);
  });

  it('is idempotent for a repeated confirmation', async () => {
    const s =
      await scenario(2);

    const first =
      await service.confirmPayment(
        s.payment.id,
      );

    const second =
      await service.confirmPayment(
        s.payment.id,
      );

    expect(
      second.alreadyProcessed,
    ).toBe(true);

    expect(
      second.ledgerTransactionId,
    ).toBe(
      first.ledgerTransactionId,
    );

    expect(
      second.allocationLedgerTransactionId,
    ).toBe(
      first.allocationLedgerTransactionId,
    );

    expect(
      await prisma.ledgerTransaction.count(),
    ).toBe(2);

    expect(
      await prisma.ticketAllocation.count(),
    ).toBe(1);

    expect(
      await prisma.ticket.count(),
    ).toBe(2);

    expect(
      await prisma.purchaseStateEvent.count(),
    ).toBe(1);
    const notification =
      await prisma
        .notificationOutbox
        .findUnique({
          where: {
            idempotencyKey:
              `purchase-completed:${s.purchase.id}`,
          },
        });

    expect(
      notification,
    ).toMatchObject({
      recipientEmail:
        s.user.email,
      status:
        'PENDING',
    });

    expect(
      notification?.payload,
    ).toMatchObject({
      purchasePublicId:
        s.purchase.publicId,
      drawPublicId:
        s.draw.publicId,
      ticketNumbers: ['1', '2'],
    });
  });

  it('is safe for concurrent repeated confirmations', async () => {
    const s =
      await scenario(4);

    const results =
      await Promise.all([
        service.confirmPayment(
          s.payment.id,
        ),
        service.confirmPayment(
          s.payment.id,
        ),
      ]);

    expect(
      results[0].ledgerTransactionId,
    ).toBe(
      results[1].ledgerTransactionId,
    );

    expect(
      results[0]
        .allocationLedgerTransactionId,
    ).toBe(
      results[1]
        .allocationLedgerTransactionId,
    );

    expect(
      await prisma.ledgerTransaction.count(),
    ).toBe(2);

    expect(
      await prisma.ticketAllocation.count(),
    ).toBe(1);

    expect(
      await prisma.ticket.count(),
    ).toBe(4);

    expect(
      await prisma.purchaseStateEvent.count(),
    ).toBe(1);
    const notification =
      await prisma
        .notificationOutbox
        .findUnique({
          where: {
            idempotencyKey:
              `purchase-completed:${s.purchase.id}`,
          },
        });

    expect(
      notification,
    ).toMatchObject({
      recipientEmail:
        s.user.email,
      status:
        'PENDING',
    });

    expect(
      notification?.payload,
    ).toMatchObject({
      purchasePublicId:
        s.purchase.publicId,
      drawPublicId:
        s.draw.publicId,
      ticketNumbers: ['1', '2', '3', '4'],
    });
  });

  it('rolls back both ledger transactions and allocation when ticket issuance fails', async () => {
    const s =
      await scenario(1);

    await executeAdminSql(`
      CREATE OR REPLACE FUNCTION sec004_test_reject_ticket_insert()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION
          'SEC004_TEST_TICKET_INSERT_FAILURE'
          USING ERRCODE = '23514';
      END;
      $$;
    `);

    await executeAdminSql(`
      DROP TRIGGER IF EXISTS
        aaa_sec004_test_reject_ticket_insert
      ON "tickets";

      CREATE TRIGGER
        aaa_sec004_test_reject_ticket_insert
      BEFORE INSERT ON "tickets"
      FOR EACH ROW
      EXECUTE FUNCTION sec004_test_reject_ticket_insert();
    `);

    try {
      await expect(
        service.confirmPayment(
          s.payment.id,
        ),
      ).rejects.toThrow(
        'SEC004_TEST_TICKET_INSERT_FAILURE',
      );
    } finally {
      await executeAdminSql(`
        DROP TRIGGER IF EXISTS
          aaa_sec004_test_reject_ticket_insert
        ON "tickets";
      `);
      await executeAdminSql(`
        DROP FUNCTION IF EXISTS
          sec004_test_reject_ticket_insert();
      `);
    }

    expect(
      (
        await prisma.purchase.findUniqueOrThrow({
          where: {
            id:
              s.purchase.id,
          },
        })
      ).status,
    ).toBe(
      PurchaseStatus.PAYMENT_PENDING,
    );

    expect(
      await prisma.ledgerTransaction.count(),
    ).toBe(0);
    expect(
      await prisma.ticketAllocation.count(),
    ).toBe(0);
    expect(
      await prisma.ticket.count(),
    ).toBe(0);
    expect(
      await prisma.purchaseStateEvent.count(),
    ).toBe(0);
  });

  it('rejects a non-succeeded payment without side effects', async () => {
    const s =
      await scenario(1, {
        paymentStatus:
          PaymentStatus.PENDING,
      });

    await expect(
      service.confirmPayment(
        s.payment.id,
      ),
    ).rejects.toThrow(
      'Only a succeeded payment can be confirmed',
    );

    await expectNoOrchestrationSideEffects(
      s.purchase.id,
    );
  });

  it('rejects an invalid purchase state without side effects', async () => {
    const s =
      await scenario(1, {
        purchaseStatus:
          PurchaseStatus.PAYMENT_FAILED,
      });

    await expect(
      service.confirmPayment(
        s.payment.id,
      ),
    ).rejects.toThrow(
      `Purchase in ${PurchaseStatus.PAYMENT_FAILED} cannot be completed`,
    );

    await expectNoOrchestrationSideEffects(
      s.purchase.id,
    );
  });

  it('rejects a closed draw without side effects', async () => {
    const s =
      await scenario(1, {
        drawStatus:
          DrawStatus.SALES_CLOSED,
      });

    await expect(
      service.confirmPayment(
        s.payment.id,
      ),
    ).rejects.toThrow(
      `Tickets cannot be issued for a draw in ${DrawStatus.SALES_CLOSED}`,
    );

    await expectNoOrchestrationSideEffects(
      s.purchase.id,
    );
  });

  it('rejects a cancelled draw without side effects', async () => {
    const s =
      await scenario(1, {
        drawStatus:
          DrawStatus.CANCELLED,
      });

    await expect(
      service.confirmPayment(
        s.payment.id,
      ),
    ).rejects.toThrow(
      `Tickets cannot be issued for a draw in ${DrawStatus.CANCELLED}`,
    );

    await expectNoOrchestrationSideEffects(
      s.purchase.id,
    );
  });

  it('rejects a payment amount mismatch without side effects', async () => {
    const s =
      await scenario(2, {
        paymentAmountMinor:
          199n,
      });

    await expect(
      service.confirmPayment(
        s.payment.id,
      ),
    ).rejects.toThrow(
      'Payment amount or currency does not match the purchase',
    );

    await expectNoOrchestrationSideEffects(
      s.purchase.id,
    );
  });

  it('rejects a payment currency mismatch without side effects', async () => {
    const s =
      await scenario(2, {
        paymentCurrency:
          'EUR',
      });

    await expect(
      service.confirmPayment(
        s.payment.id,
      ),
    ).rejects.toThrow(
      'Payment amount or currency does not match the purchase',
    );

    await expectNoOrchestrationSideEffects(
      s.purchase.id,
    );
  });

  it('prevents corruption of a completed purchase by deleting a ticket', async () => {
    const s =
      await scenario(2);

    await service.confirmPayment(
      s.payment.id,
    );

    const ticket =
      await prisma.ticket.findFirstOrThrow({
        where: {
          purchaseId:
            s.purchase.id,
        },
      });

    await expect(
      fixturePrisma.$executeRaw`
        DELETE FROM "tickets"
        WHERE "id" = ${ticket.id}::uuid
      `,
    ).rejects.toThrow(
      'Tickets are immutable and cannot be deleted',
    );

    expect(
      await prisma.ticket.count({
        where: {
          purchaseId:
            s.purchase.id,
        },
      }),
    ).toBe(2);

    const result =
      await service.confirmPayment(
        s.payment.id,
      );

    expect(
      result.alreadyProcessed,
    ).toBe(true);

    expect(
      result.ticketCount,
    ).toBe(2);
  });
});
