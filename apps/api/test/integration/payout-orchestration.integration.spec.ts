import {
  ConfigService,
} from '@nestjs/config';
import {
  DrawStatus,
  DrawType,
  LedgerAccountCode,
  LedgerSide,
  LedgerTransactionType,
  Prisma,
  PrizeEligibilityCheckStatus,
  PrizeEligibilityCheckType,
  PrizeStatus,
  PurchaseStatus,
  RandomnessStatus,
  UserStatus,
  PayoutStatus,
} from '@prisma/client';
import {
  randomUUID,
} from 'node:crypto';

import {
  LedgerService,
} from '../../src/ledger/ledger.service';
import {
  PayoutOrchestratorService,
} from '../../src/payouts/payout-orchestrator.service';
import {
  PrizeClaimsService,
} from '../../src/prize-claims/prize-claims.service';
import {
  PrismaService,
} from '../../src/prisma/prisma.service';
import {
  PrizeDistributionService,
} from '../../src/prizes/prize-distribution.service';
import {
  PrizePoolService,
} from '../../src/prizes/prize-pool.service';
import {
  SnapshotBuilderService,
} from '../../src/snapshots/snapshot-builder.service';
import {
  SnapshotCryptographyService,
} from '../../src/snapshots/snapshot-cryptography.service';
import {
  SnapshotFinalizerService,
} from '../../src/snapshots/snapshot-finalizer.service';
import {
  WinnerSelectionService,
} from '../../src/winners/winner-selection.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';
import {
  ensureTestTicketAllocation,
} from './ticket-fixture.helper';

const OWNER_SECRET =
  'a'.repeat(64);

describe(
  'Payout orchestration integration',
  () => {
    let prisma:
      PrismaService;
    let ledger:
      LedgerService;
    let claims:
      PrizeClaimsService;
    let payouts:
      PayoutOrchestratorService;
    let winnerSelection:
      WinnerSelectionService;
    let builder:
      SnapshotBuilderService;
    let finalizer:
      SnapshotFinalizerService;

    beforeAll(async () => {
      prisma =
        await createTestPrisma();

      ledger =
        new LedgerService(
          prisma,
        );

      claims =
        new PrizeClaimsService(
          prisma,
        );

      payouts =
        new PayoutOrchestratorService(
          prisma,
          ledger,
        );

      builder =
        new SnapshotBuilderService(
          prisma,
          new ConfigService({
            SNAPSHOT_OWNER_SECRET:
              OWNER_SECRET,
          }),
        );

      finalizer =
        new SnapshotFinalizerService(
          prisma,
          new SnapshotCryptographyService(),
        );

      winnerSelection =
        new WinnerSelectionService(
          prisma,
          ledger,
          new PrizeDistributionService(
            prisma,
          ),
          new PrizePoolService(
            prisma,
          ),
        );
    });

    beforeEach(async () => {
      await cleanTestDatabase(
        prisma,
      );
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    async function createApprovedPrize() {
      const user =
        await prisma.user.create({
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

      const reviewer =
        await prisma.user.create({
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
        await prisma.lotteryDraw.create({
          data: {
            publicId:
              `W-2026-${randomUUID()}`,
            type:
              DrawType.WEEKLY,
            status:
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
            winnerCount:
              3,
          },
        });

      const purchase =
        await prisma.purchase.create({
          data: {
            publicId:
              `PUR-${randomUUID()}`,
            userId:
              user.id,
            drawId:
              draw.id,
            status:
              PurchaseStatus.COMPLETED,
            requestedTicketCount:
              5,
            ticketPriceMinor:
              100n,
            totalAmountMinor:
              500n,
            currency:
              'USD',
            idempotencyKey:
              randomUUID(),
            paymentConfirmedAt:
              new Date(),
            completedAt:
              new Date(),
          },
        });

      await ledger.append({
        type:
          LedgerTransactionType
            .PAYMENT_ALLOCATION,
        idempotencyKey:
          `payout-pool-${randomUUID()}`,
        referenceType:
          'PAYMENT',
        referenceId:
          randomUUID(),
        currency:
          'USD',
        metadata: {
          drawId:
            draw.id,
        },
        postings: [
          {
            accountCode:
              LedgerAccountCode
                .PAYMENT_CLEARING,
            side:
              LedgerSide.DEBIT,
            amountMinor:
              500n,
          },
          {
            accountCode:
              LedgerAccountCode
                .WEEKLY_JACKPOT,
            side:
              LedgerSide.CREDIT,
            amountMinor:
              350n,
          },
          {
            accountCode:
              LedgerAccountCode
                .ANNUAL_JACKPOT,
            side:
              LedgerSide.CREDIT,
            amountMinor:
              50n,
          },
          {
            accountCode:
              LedgerAccountCode
                .COMPANY_REVENUE,
            side:
              LedgerSide.CREDIT,
            amountMinor:
              100n,
          },
        ],
      });

      for (
        let index = 1;
        index <= 5;
        index += 1
      ) {
        await ensureTestTicketAllocation(
          prisma,
          {
            purchaseId:
              purchase.id,
            drawId:
              draw.id,
            numberInDraw:
              BigInt(index),
          },
        );

        await prisma.ticket.create({
          data: {
            publicId:
              `TKT-${index}-${randomUUID()}`,
            userId:
              user.id,
            purchaseId:
              purchase.id,
            drawId:
              draw.id,
            numberInDraw:
              BigInt(index),
          },
        });
      }

      await prisma.lotteryDraw.update({
        where: {
          id:
            draw.id,
        },
        data: {
          status:
            DrawStatus.SALES_CLOSED,
        },
      });

      await builder.build(
        draw.id,
      );

      await finalizer.finalize(
        draw.id,
      );

      await prisma.randomnessEvidence
        .create({
          data: {
            drawId:
              draw.id,
            attemptNumber:
              1,
            provider:
              'RANDOM_ORG',
            status:
              RandomnessStatus.VERIFIED,
            idempotencyKey:
              `randomness-${randomUUID()}`,
            requestedMin:
              1n,
            requestedMax:
              5n,
            requestedCount:
              3,
            requestPayload: {
              min: 1,
              max: 5,
              count: 3,
            },
            responsePayload: {
              positions: [
                4,
                1,
                3,
              ],
            },
            responseHash:
              'b'.repeat(64),
            providerSignature:
              'integration-provider-signature',
            signatureVerified:
              true,
            randomPositions: [
              4,
              1,
              3,
            ],
            requestedAt:
              new Date(
                Date.now() -
                  2_000,
              ),
            receivedAt:
              new Date(
                Date.now() -
                  1_000,
              ),
            verifiedAt:
              new Date(),
          },
        });

      await prisma.lotteryDraw.update({
        where: {
          id:
            draw.id,
        },
        data: {
          status:
            DrawStatus
              .RANDOMNESS_VERIFIED,
        },
      });

      await winnerSelection.finalize(
        draw.id,
      );

      const prize =
        await prisma.prize
          .findFirstOrThrow({
            where: {
              drawId:
                draw.id,
              rank:
                1,
            },
          });

      const claim =
        await claims.submit({
          prizeId:
            prize.id,
          userId:
            user.id,
          declaredDateOfBirth:
            new Date(
              '1990-01-01',
            ),
          declaredCountryCode:
            'UA',
        });

      await claims.review({
        claimId:
          claim.id,
        reviewerUserId:
          reviewer.id,
        checks: [
          PrizeEligibilityCheckType
            .IDENTITY,
          PrizeEligibilityCheckType
            .AGE,
          PrizeEligibilityCheckType
            .JURISDICTION,
        ].map(
          (type) => ({
            type,
            status:
              PrizeEligibilityCheckStatus
                .PASSED,
            evidence: {
              source:
                'integration-test',
            } as Prisma.InputJsonValue,
          }),
        ),
        decisionReason:
          'eligible',
      });

      return {
        user,
        prize:
          await prisma.prize
            .findUniqueOrThrow({
              where: {
                id:
                  prize.id,
              },
            }),
      };
    }

    it(
      'prepares exactly one immutable payout instruction for an approved prize',
      async () => {
        const scenario =
          await createApprovedPrize();

        const first =
          await payouts.prepare({
            prizeId:
              scenario.prize.id,
            provider:
              'test_provider',
            destinationRef:
              'opaque-destination-token',
          });

        const second =
          await payouts.prepare({
            prizeId:
              scenario.prize.id,
            provider:
              'TEST_PROVIDER',
            destinationRef:
              'opaque-destination-token',
          });

        expect(
          second.payoutId,
        ).toBe(
          first.payoutId,
        );

        expect(
          second.alreadyPrepared,
        ).toBe(true);

        expect(
          await prisma.payout.count({
            where: {
              prizeId:
                scenario.prize.id,
            },
          }),
        ).toBe(1);

        expect(
          (
            await prisma.prize
              .findUniqueOrThrow({
                where: {
                  id:
                    scenario.prize.id,
                },
              })
          ).status,
        ).toBe(
          PrizeStatus.PAYOUT_PENDING,
        );
      },
    );

    it(
      'keeps payout financial instruction identity immutable and prevents deletion',
      async () => {
        const scenario =
          await createApprovedPrize();

        const prepared =
          await payouts.prepare({
            prizeId:
              scenario.prize.id,
            provider:
              'TEST_PROVIDER',
            destinationRef:
              'opaque-destination-token',
          });

        await expect(
          prisma.payout.update({
            where: {
              id:
                prepared.payoutId,
            },
            data: {
              amountMinor:
                176n,
            },
          }),
        ).rejects.toThrow();

        await expect(
          prisma.payout.update({
            where: {
              id:
                prepared.payoutId,
            },
            data: {
              destinationRef:
                'other-destination',
            },
          }),
        ).rejects.toThrow();

        await expect(
          prisma.payout.delete({
            where: {
              id:
                prepared.payoutId,
            },
          }),
        ).rejects.toThrow();
      },
    );

    it(
      'finalizes successful provider payout with sealed balanced ledger settlement',
      async () => {
        const scenario =
          await createApprovedPrize();

        const prepared =
          await payouts.prepare({
            prizeId:
              scenario.prize.id,
            provider:
              'TEST_PROVIDER',
            destinationRef:
              'opaque-destination-token',
          });

        await payouts.beginExecution(
          prepared.payoutId,
        );

        const completion =
          await payouts.finalizeSucceeded(
            prepared.payoutId,
            'provider-transfer-001',
          );

        const payout =
          await prisma.payout
            .findUniqueOrThrow({
              where: {
                id:
                  prepared.payoutId,
              },
            });

        const prize =
          await prisma.prize
            .findUniqueOrThrow({
              where: {
                id:
                  scenario.prize.id,
              },
            });

        const settlement =
          await prisma.ledgerTransaction
            .findUniqueOrThrow({
              where: {
                id:
                  completion
                    .ledgerTransactionId,
              },
              include: {
                postings:
                  true,
              },
            });

        expect(
          payout.status,
        ).toBe(
          PayoutStatus.SUCCEEDED,
        );

        expect(
          payout.providerTransactionId,
        ).toBe(
          'provider-transfer-001',
        );

        expect(
          prize.status,
        ).toBe(
          PrizeStatus.PAID,
        );

        expect(
          prize.paidAt,
        ).not.toBeNull();

        expect(
          settlement.type,
        ).toBe(
          LedgerTransactionType
            .PAYOUT_COMPLETED,
        );

        expect(
          settlement.sealedAt,
        ).not.toBeNull();

        const debit =
          settlement.postings
            .filter(
              (posting) =>
                posting.side ===
                LedgerSide.DEBIT,
            )
            .reduce(
              (
                total,
                posting,
              ) =>
                total +
                posting.amountMinor,
              0n,
            );

        const credit =
          settlement.postings
            .filter(
              (posting) =>
                posting.side ===
                LedgerSide.CREDIT,
            )
            .reduce(
              (
                total,
                posting,
              ) =>
                total +
                posting.amountMinor,
              0n,
            );

        expect(debit).toBe(credit);
        expect(debit).toBe(
          scenario.prize
            .amountMinor,
        );
      },
    );

    it(
      'rolls back payout success and prize payment when ledger settlement fails',
      async () => {
        const scenario =
          await createApprovedPrize();

        const prepared =
          await payouts.prepare({
            prizeId:
              scenario.prize.id,
            provider:
              'TEST_PROVIDER',
            destinationRef:
              'opaque-destination-token',
          });

        await payouts.beginExecution(
          prepared.payoutId,
        );

        const spy =
          jest
            .spyOn(
              ledger,
              'appendInTransaction',
            )
            .mockRejectedValueOnce(
              new Error(
                'SEC017_TEST_LEDGER_FAILURE',
              ),
            );

        try {
          await expect(
            payouts.finalizeSucceeded(
              prepared.payoutId,
              'provider-transfer-fail',
            ),
          ).rejects.toThrow(
            'SEC017_TEST_LEDGER_FAILURE',
          );
        } finally {
          spy.mockRestore();
        }

        const payout =
          await prisma.payout
            .findUniqueOrThrow({
              where: {
                id:
                  prepared.payoutId,
              },
            });

        const prize =
          await prisma.prize
            .findUniqueOrThrow({
              where: {
                id:
                  scenario.prize.id,
              },
            });

        expect(
          payout.status,
        ).toBe(
          PayoutStatus.PROCESSING,
        );

        expect(
          payout.providerTransactionId,
        ).toBeNull();

        expect(
          prize.status,
        ).toBe(
          PrizeStatus.PAYOUT_PENDING,
        );

        expect(
          prize.paidAt,
        ).toBeNull();

        expect(
          await prisma.ledgerTransaction
            .count({
              where: {
                type:
                  LedgerTransactionType
                    .PAYOUT_COMPLETED,
                referenceId:
                  prepared.payoutId,
              },
            }),
        ).toBe(0);
      },
    );

    it(
      'rejects direct SUCCEEDED and PAID bypasses without sealed payout ledger evidence',
      async () => {
        const scenario =
          await createApprovedPrize();

        const prepared =
          await payouts.prepare({
            prizeId:
              scenario.prize.id,
            provider:
              'TEST_PROVIDER',
            destinationRef:
              'opaque-destination-token',
          });

        await expect(
          prisma.payout.update({
            where: {
              id:
                prepared.payoutId,
            },
            data: {
              status:
                PayoutStatus.SUCCEEDED,
              providerTransactionId:
                'bypass-provider-id',
              processedAt:
                new Date(),
            },
          }),
        ).rejects.toThrow();

        await expect(
          prisma.prize.update({
            where: {
              id:
                scenario.prize.id,
            },
            data: {
              status:
                PrizeStatus.PAID,
              paidAt:
                new Date(),
            },
          }),
        ).rejects.toThrow();
      },
    );

    it(
      'is idempotent for successful completion and rejects provider identity replacement',
      async () => {
        const scenario =
          await createApprovedPrize();

        const prepared =
          await payouts.prepare({
            prizeId:
              scenario.prize.id,
            provider:
              'TEST_PROVIDER',
            destinationRef:
              'opaque-destination-token',
          });

        await payouts.beginExecution(
          prepared.payoutId,
        );

        const first =
          await payouts.finalizeSucceeded(
            prepared.payoutId,
            'provider-transfer-002',
          );

        const second =
          await payouts.finalizeSucceeded(
            prepared.payoutId,
            'provider-transfer-002',
          );

        expect(
          second.ledgerTransactionId,
        ).toBe(
          first.ledgerTransactionId,
        );

        expect(
          second.alreadyProcessed,
        ).toBe(true);

        await expect(
          payouts.finalizeSucceeded(
            prepared.payoutId,
            'provider-transfer-other',
          ),
        ).rejects.toThrow();

        expect(
          await prisma.ledgerTransaction
            .count({
              where: {
                type:
                  LedgerTransactionType
                    .PAYOUT_COMPLETED,
                referenceId:
                  prepared.payoutId,
              },
            }),
        ).toBe(1);
      },
    );

    it(
      'records provider failure without marking the prize paid',
      async () => {
        const scenario =
          await createApprovedPrize();

        const prepared =
          await payouts.prepare({
            prizeId:
              scenario.prize.id,
            provider:
              'TEST_PROVIDER',
            destinationRef:
              'opaque-destination-token',
          });

        await payouts.beginExecution(
          prepared.payoutId,
        );

        await payouts.markFailed(
          prepared.payoutId,
          {
            providerTransactionId:
              'provider-transfer-failed',
            failureCode:
              'PROVIDER_DECLINED',
            failureMessage:
              'Provider declined transfer',
          },
        );

        const payout =
          await prisma.payout
            .findUniqueOrThrow({
              where: {
                id:
                  prepared.payoutId,
              },
            });

        const prize =
          await prisma.prize
            .findUniqueOrThrow({
              where: {
                id:
                  scenario.prize.id,
              },
            });

        expect(
          payout.status,
        ).toBe(
          PayoutStatus.FAILED,
        );

        expect(
          prize.status,
        ).toBe(
          PrizeStatus.PAYOUT_PENDING,
        );

        expect(
          prize.paidAt,
        ).toBeNull();
      },
    );
  },
);
