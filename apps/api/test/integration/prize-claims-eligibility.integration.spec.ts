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
  PrismaClient,
  PrizeEligibilityCheckStatus,
  PrizeEligibilityCheckType,
  PrizeStatus,
  PurchaseStatus,
  RandomnessStatus,
  UserStatus,
} from '@prisma/client';
import {
  randomUUID,
} from 'node:crypto';

import {
  LedgerService,
} from '../../src/ledger/ledger.service';
import {
  PrizeClaimsService,
} from '../../src/prize-claims/prize-claims.service';
import {
  ClaimPrismaService,
  DrawPrismaService,
  PaymentPrismaService,
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
  createTestAdminPrisma,
  createTestClaimPrisma,
  createTestDrawPrisma,
  createTestPaymentPrisma,
} from './database-role.helper';
import {
  ensureTestTicketAllocation,
} from './ticket-fixture.helper';

const OWNER_SECRET =
  'a'.repeat(64);

describe(
  'Prize claims and eligibility integration',
  () => {
    let prisma:
      PrismaService;
    let fixturePrisma:
      PrismaClient;
    let paymentPrisma:
      PaymentPrismaService;
    let drawPrisma:
      DrawPrismaService;
    let claimPrisma:
      ClaimPrismaService;
    let paymentLedger:
      LedgerService;
    let drawLedger:
      LedgerService;
    let claims:
      PrizeClaimsService;
    let winnerSelection:
      WinnerSelectionService;
    let builder:
      SnapshotBuilderService;
    let finalizer:
      SnapshotFinalizerService;

    beforeAll(async () => {
      prisma =
        await createTestPrisma();
      fixturePrisma =
        await createTestAdminPrisma();
      paymentPrisma =
        await createTestPaymentPrisma();
      drawPrisma =
        await createTestDrawPrisma();
      claimPrisma =
        await createTestClaimPrisma();

      paymentLedger =
        new LedgerService(
          paymentPrisma,
        );

      drawLedger =
        new LedgerService(
          drawPrisma,
        );

      claims =
        new PrizeClaimsService(
          claimPrisma,
        );

      builder =
        new SnapshotBuilderService(
          drawPrisma,
          new ConfigService({
            SNAPSHOT_OWNER_SECRET:
              OWNER_SECRET,
          }),
        );

      finalizer =
        new SnapshotFinalizerService(
          drawPrisma,
          new SnapshotCryptographyService(),
        );

      winnerSelection =
        new WinnerSelectionService(
          drawPrisma,
          drawLedger,
          new PrizeDistributionService(
            drawPrisma,
          ),
          new PrizePoolService(
            drawPrisma,
          ),
        );
    });

    beforeEach(async () => {
      await cleanTestDatabase(
        prisma,
      );
    });

    afterAll(async () => {
      await Promise.all([
        prisma.$disconnect(),
        fixturePrisma.$disconnect(),
        paymentPrisma.$disconnect(),
        drawPrisma.$disconnect(),
        claimPrisma.$disconnect(),
      ]);
    });

    async function createRecognizedPrize() {
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

      const reviewer =
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
        await fixturePrisma.lotteryDraw
          .create({
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
        await fixturePrisma.purchase
          .create({
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

      await paymentLedger.append({
        type:
          LedgerTransactionType
            .PAYMENT_ALLOCATION,
        idempotencyKey:
          `claim-pool-${randomUUID()}`,
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
          fixturePrisma,
          {
            purchaseId:
              purchase.id,
            drawId:
              draw.id,
            numberInDraw:
              BigInt(index),
          },
        );

        await fixturePrisma.ticket.create({
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

      await fixturePrisma.lotteryDraw.update({
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

      await fixturePrisma.randomnessEvidence
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
              min:
                1,
              max:
                5,
              count:
                3,
            },
            responsePayload: {
              positions: [
                4,
                1,
                3,
              ],
            },
            responseHash:
              'a'.repeat(64),
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

      await fixturePrisma.lotteryDraw.update({
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

      return {
        user,
        reviewer,
        prize,
      };
    }

    const passedChecks = (): Array<{
      type: PrizeEligibilityCheckType;
      status: PrizeEligibilityCheckStatus;
      evidence: Prisma.InputJsonValue;
    }> => [
      {
        type:
          PrizeEligibilityCheckType
            .IDENTITY,
        status:
          PrizeEligibilityCheckStatus
            .PASSED,
        evidence: {
          source:
            'integration-test',
        } as Prisma.InputJsonValue,
      },
      {
        type:
          PrizeEligibilityCheckType
            .AGE,
        status:
          PrizeEligibilityCheckStatus
            .PASSED,
        evidence: {
          source:
            'integration-test',
        } as Prisma.InputJsonValue,
      },
      {
        type:
          PrizeEligibilityCheckType
            .JURISDICTION,
        status:
          PrizeEligibilityCheckStatus
            .PASSED,
        evidence: {
          source:
            'integration-test',
        } as Prisma.InputJsonValue,
      },
    ];

    it(
      'atomically submits an owned claim and is idempotent on replay',
      async () => {
        const scenario =
          await createRecognizedPrize();

        const first =
          await claims.submit({
            prizeId:
              scenario.prize.id,
            userId:
              scenario.user.id,
            declaredDateOfBirth:
              new Date(
                '1990-01-01',
              ),
            declaredCountryCode:
              'UA',
          });

        const second =
          await claims.submit({
            prizeId:
              scenario.prize.id,
            userId:
              scenario.user.id,
            declaredDateOfBirth:
              new Date(
                '1990-01-01',
              ),
            declaredCountryCode:
              'UA',
          });

        expect(
          second.id,
        ).toBe(
          first.id,
        );

        expect(
          await prisma.prizeClaim.count({
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
          PrizeStatus.CLAIM_PENDING,
        );
      },
    );

    it(
      'rejects a claim by a non-owner without changing prize state',
      async () => {
        const scenario =
          await createRecognizedPrize();

        const attacker =
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

        await expect(
          claims.submit({
            prizeId:
              scenario.prize.id,
            userId:
              attacker.id,
            declaredDateOfBirth:
              new Date(
                '1990-01-01',
              ),
            declaredCountryCode:
              'UA',
          }),
        ).rejects.toThrow();

        expect(
          await prisma.prizeClaim.count(),
        ).toBe(0);

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
          PrizeStatus.CREATED,
        );
      },
    );

    it(
      'approves only after immutable complete eligibility evidence',
      async () => {
        const scenario =
          await createRecognizedPrize();

        const claim =
          await claims.submit({
            prizeId:
              scenario.prize.id,
            userId:
              scenario.user.id,
            declaredDateOfBirth:
              new Date(
                '1990-01-01',
              ),
            declaredCountryCode:
              'UA',
          });

        const result =
          await claims.review({
            claimId:
              claim.id,
            reviewerUserId:
              scenario.reviewer.id,
            checks:
              passedChecks(),
            decisionReason:
              'All required checks passed',
          });

        expect(
          result.prize.status,
        ).toBe(
          PrizeStatus.APPROVED,
        );

        expect(
          result.checks,
        ).toHaveLength(3);

        await expect(
          fixturePrisma.prizeEligibilityCheck
            .update({
              where: {
                claimId_type: {
                  claimId:
                    claim.id,
                  type:
                    PrizeEligibilityCheckType
                      .IDENTITY,
                },
              },
              data: {
                status:
                  PrizeEligibilityCheckStatus
                    .FAILED,
              },
            }),
        ).rejects.toThrow();

        await expect(
          fixturePrisma.prizeEligibilityCheck
            .delete({
              where: {
                claimId_type: {
                  claimId:
                    claim.id,
                  type:
                    PrizeEligibilityCheckType
                      .AGE,
                },
              },
            }),
        ).rejects.toThrow();
      },
    );

    it(
      'withholds when any required eligibility check fails',
      async () => {
        const scenario =
          await createRecognizedPrize();

        const claim =
          await claims.submit({
            prizeId:
              scenario.prize.id,
            userId:
              scenario.user.id,
            declaredDateOfBirth:
              new Date(
                '1990-01-01',
              ),
            declaredCountryCode:
              'UA',
          });

        const checks =
          passedChecks();

        checks[2] = {
          ...checks[2],
          status:
            PrizeEligibilityCheckStatus
              .FAILED,
          evidence: {
            source:
              'integration-test',
            reason:
              'jurisdiction-not-eligible',
          },
        };

        const result =
          await claims.review({
            claimId:
              claim.id,
            reviewerUserId:
              scenario.reviewer.id,
            checks,
            decisionReason:
              'Jurisdiction eligibility failed',
          });

        expect(
          result.prize.status,
        ).toBe(
          PrizeStatus.WITHHELD,
        );

        expect(
          result.prize.approvedAt,
        ).toBeNull();
      },
    );

    it(
      'keeps submitted claim identity immutable and prevents deletion',
      async () => {
        const scenario =
          await createRecognizedPrize();

        const claim =
          await claims.submit({
            prizeId:
              scenario.prize.id,
            userId:
              scenario.user.id,
            declaredDateOfBirth:
              new Date(
                '1990-01-01',
              ),
            declaredCountryCode:
              'UA',
          });

        await expect(
          fixturePrisma.prizeClaim.update({
            where: {
              id:
                claim.id,
            },
            data: {
              declaredCountryCode:
                'US',
            },
          }),
        ).rejects.toThrow();

        await expect(
          fixturePrisma.prizeClaim.delete({
            where: {
              id:
                claim.id,
            },
          }),
        ).rejects.toThrow();
      },
    );

    it(
      'seeds privileged review permission for platform admin',
      async () => {
        const role =
          await prisma.role
            .findUniqueOrThrow({
              where: {
                code:
                  'PLATFORM_ADMIN',
              },
              include: {
                permissions: {
                  include: {
                    permission:
                      true,
                  },
                },
              },
            });

        expect(
          role.permissions.some(
            (entry) =>
              entry.permission.code ===
              'prize.claim.review.admin',
          ),
        ).toBe(true);
      },
    );
  },
);
