-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DrawType" AS ENUM ('WEEKLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "DrawStatus" AS ENUM ('SCHEDULED', 'SALES_OPEN', 'SALES_CLOSED', 'SNAPSHOT_BUILDING', 'SNAPSHOT_FINALIZED', 'RANDOMNESS_PENDING', 'RANDOMNESS_VERIFIED', 'WINNER_SELECTION_PENDING', 'COMPLETED', 'PUBLISHED', 'MANUAL_REVIEW', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('CREATED', 'PAYMENT_PENDING', 'PAYMENT_CONFIRMED', 'TICKET_ALLOCATION_PENDING', 'COMPLETED', 'PAYMENT_FAILED', 'EXPIRED', 'CANCELLED', 'MANUAL_REVIEW', 'REFUND_PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'MANUAL_REVIEW', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('RECEIVED', 'VERIFIED', 'PROCESSED', 'DUPLICATE', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('ACTIVE', 'VOIDED_BY_REFUND');

-- CreateEnum
CREATE TYPE "SnapshotStatus" AS ENUM ('BUILDING', 'FINALIZED');

-- CreateEnum
CREATE TYPE "RandomnessStatus" AS ENUM ('CREATED', 'REQUESTED', 'RECEIVED', 'VERIFIED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "PrizeStatus" AS ENUM ('CREATED', 'CLAIM_PENDING', 'APPROVED', 'PAYOUT_PENDING', 'PAID', 'WITHHELD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('CREATED', 'PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "LedgerTransactionType" AS ENUM ('PAYMENT_CONFIRMED', 'PAYMENT_ALLOCATION', 'PRIZE_RECOGNIZED', 'PAYOUT_COMPLETED', 'REFUND_COMPLETED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "LedgerAccountCode" AS ENUM ('PAYMENT_CLEARING', 'CASH', 'WEEKLY_JACKPOT', 'ANNUAL_JACKPOT', 'COMPANY_REVENUE', 'PRIZE_PAYABLE', 'PAYOUT_CLEARING', 'REFUND_PAYABLE');

-- CreateEnum
CREATE TYPE "LedgerSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM', 'PAYMENT_PROVIDER', 'RANDOMNESS_PROVIDER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lottery_draws" (
    "id" UUID NOT NULL,
    "publicId" TEXT NOT NULL,
    "type" "DrawType" NOT NULL,
    "status" "DrawStatus" NOT NULL DEFAULT 'SCHEDULED',
    "sequenceNumber" INTEGER NOT NULL,
    "participationYear" INTEGER,
    "salesOpenAt" TIMESTAMPTZ(3),
    "salesCloseAt" TIMESTAMPTZ(3),
    "scheduledDrawAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "publishedAt" TIMESTAMPTZ(3),
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "ticketPriceMinor" BIGINT NOT NULL,
    "winnerCount" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lottery_draws_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "drawId" UUID NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'CREATED',
    "requestedTicketCount" INTEGER NOT NULL,
    "ticketPriceMinor" BIGINT NOT NULL,
    "totalAmountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3),
    "paymentConfirmedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_state_events" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "fromStatus" "PurchaseStatus",
    "toStatus" "PurchaseStatus" NOT NULL,
    "cause" TEXT NOT NULL,
    "source" "AuditActorType" NOT NULL,
    "correlationId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_state_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "status" "PaymentStatus" NOT NULL DEFAULT 'CREATED',
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "providerData" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerSessionId" TEXT,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "paymentId" UUID,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "signature" TEXT,
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "errorMessage" TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "drawId" UUID NOT NULL,
    "numberInDraw" BIGINT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_snapshots" (
    "id" UUID NOT NULL,
    "drawId" UUID NOT NULL,
    "status" "SnapshotStatus" NOT NULL DEFAULT 'BUILDING',
    "ticketCount" BIGINT NOT NULL,
    "canonicalFormat" TEXT NOT NULL,
    "hashAlgorithm" TEXT NOT NULL DEFAULT 'SHA-256',
    "snapshotHash" TEXT,
    "builtAt" TIMESTAMPTZ(3),
    "finalizedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_snapshot_entries" (
    "id" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "position" BIGINT NOT NULL,
    "ticketPublicId" TEXT NOT NULL,
    "ownerPublicRef" TEXT NOT NULL,

    CONSTRAINT "ticket_snapshot_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "randomness_evidence" (
    "id" UUID NOT NULL,
    "drawId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'RANDOM_ORG',
    "status" "RandomnessStatus" NOT NULL DEFAULT 'CREATED',
    "idempotencyKey" TEXT NOT NULL,
    "requestedMin" BIGINT NOT NULL,
    "requestedMax" BIGINT NOT NULL,
    "requestedCount" INTEGER NOT NULL,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "responseHash" TEXT,
    "providerSignature" TEXT,
    "signatureVerified" BOOLEAN,
    "randomPositions" JSONB,
    "requestedAt" TIMESTAMPTZ(3),
    "receivedAt" TIMESTAMPTZ(3),
    "verifiedAt" TIMESTAMPTZ(3),
    "failureMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "randomness_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draw_winners" (
    "id" UUID NOT NULL,
    "drawId" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "snapshotEntryId" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "randomPosition" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draw_winners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prizes" (
    "id" UUID NOT NULL,
    "drawId" UUID NOT NULL,
    "winnerId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PrizeStatus" NOT NULL DEFAULT 'CREATED',
    "approvedAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "prizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL,
    "prizeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'CREATED',
    "amountMinor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT,
    "providerTransactionId" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allocation_rules" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "weeklyJackpotBps" INTEGER NOT NULL,
    "annualJackpotBps" INTEGER NOT NULL,
    "companyRevenueBps" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "effectiveTo" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allocation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "type" "LedgerTransactionType" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_postings" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "accountCode" "LedgerAccountCode" NOT NULL,
    "side" "LedgerSide" NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "previousState" JSONB,
    "newState" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "lottery_draws_publicId_key" ON "lottery_draws"("publicId");

-- CreateIndex
CREATE INDEX "lottery_draws_status_scheduledDrawAt_idx" ON "lottery_draws"("status", "scheduledDrawAt");

-- CreateIndex
CREATE INDEX "lottery_draws_type_participationYear_idx" ON "lottery_draws"("type", "participationYear");

-- CreateIndex
CREATE UNIQUE INDEX "lottery_draws_type_sequenceNumber_key" ON "lottery_draws"("type", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_publicId_key" ON "purchases"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_idempotencyKey_key" ON "purchases"("idempotencyKey");

-- CreateIndex
CREATE INDEX "purchases_userId_createdAt_idx" ON "purchases"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "purchases_drawId_status_idx" ON "purchases"("drawId", "status");

-- CreateIndex
CREATE INDEX "purchases_status_expiresAt_idx" ON "purchases"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "purchase_state_events_purchaseId_createdAt_idx" ON "purchase_state_events"("purchaseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_state_events_purchaseId_correlationId_toStatus_key" ON "purchase_state_events"("purchaseId", "correlationId", "toStatus");

-- CreateIndex
CREATE UNIQUE INDEX "payments_providerTransactionId_key" ON "payments"("providerTransactionId");

-- CreateIndex
CREATE INDEX "payments_purchaseId_status_idx" ON "payments"("purchaseId", "status");

-- CreateIndex
CREATE INDEX "payments_provider_status_idx" ON "payments"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_idempotencyKey_key" ON "payment_attempts"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_providerSessionId_key" ON "payment_attempts"("providerSessionId");

-- CreateIndex
CREATE INDEX "payment_attempts_paymentId_status_idx" ON "payment_attempts"("paymentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_paymentId_attemptNumber_key" ON "payment_attempts"("paymentId", "attemptNumber");

-- CreateIndex
CREATE INDEX "webhook_events_status_receivedAt_idx" ON "webhook_events"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "webhook_events_paymentId_idx" ON "webhook_events"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_providerEventId_key" ON "webhook_events"("provider", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_publicId_key" ON "tickets"("publicId");

-- CreateIndex
CREATE INDEX "tickets_userId_issuedAt_idx" ON "tickets"("userId", "issuedAt");

-- CreateIndex
CREATE INDEX "tickets_purchaseId_idx" ON "tickets"("purchaseId");

-- CreateIndex
CREATE INDEX "tickets_drawId_status_idx" ON "tickets"("drawId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_drawId_numberInDraw_key" ON "tickets"("drawId", "numberInDraw");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_snapshots_drawId_key" ON "ticket_snapshots"("drawId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_snapshots_snapshotHash_key" ON "ticket_snapshots"("snapshotHash");

-- CreateIndex
CREATE INDEX "ticket_snapshots_status_createdAt_idx" ON "ticket_snapshots"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_snapshot_entries_snapshotId_ticketPublicId_idx" ON "ticket_snapshot_entries"("snapshotId", "ticketPublicId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_snapshot_entries_snapshotId_position_key" ON "ticket_snapshot_entries"("snapshotId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "randomness_evidence_idempotencyKey_key" ON "randomness_evidence"("idempotencyKey");

-- CreateIndex
CREATE INDEX "randomness_evidence_drawId_status_idx" ON "randomness_evidence"("drawId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "randomness_evidence_drawId_attemptNumber_key" ON "randomness_evidence"("drawId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "draw_winners_snapshotEntryId_key" ON "draw_winners"("snapshotEntryId");

-- CreateIndex
CREATE INDEX "draw_winners_drawId_idx" ON "draw_winners"("drawId");

-- CreateIndex
CREATE UNIQUE INDEX "draw_winners_drawId_rank_key" ON "draw_winners"("drawId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "draw_winners_drawId_ticketId_key" ON "draw_winners"("drawId", "ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "draw_winners_drawId_randomPosition_key" ON "draw_winners"("drawId", "randomPosition");

-- CreateIndex
CREATE UNIQUE INDEX "prizes_winnerId_key" ON "prizes"("winnerId");

-- CreateIndex
CREATE INDEX "prizes_userId_status_idx" ON "prizes"("userId", "status");

-- CreateIndex
CREATE INDEX "prizes_status_createdAt_idx" ON "prizes"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "prizes_drawId_rank_key" ON "prizes"("drawId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_idempotencyKey_key" ON "payouts"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_providerTransactionId_key" ON "payouts"("providerTransactionId");

-- CreateIndex
CREATE INDEX "payouts_prizeId_status_idx" ON "payouts"("prizeId", "status");

-- CreateIndex
CREATE INDEX "payouts_userId_createdAt_idx" ON "payouts"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "allocation_rules_version_key" ON "allocation_rules"("version");

-- CreateIndex
CREATE INDEX "allocation_rules_effectiveFrom_effectiveTo_idx" ON "allocation_rules"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_idempotencyKey_key" ON "ledger_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ledger_transactions_referenceType_referenceId_idx" ON "ledger_transactions"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "ledger_transactions_type_createdAt_idx" ON "ledger_transactions"("type", "createdAt");

-- CreateIndex
CREATE INDEX "ledger_postings_transactionId_idx" ON "ledger_postings"("transactionId");

-- CreateIndex
CREATE INDEX "ledger_postings_accountCode_createdAt_idx" ON "ledger_postings"("accountCode", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorType_actorId_createdAt_idx" ON "audit_logs"("actorType", "actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_correlationId_idx" ON "audit_logs"("correlationId");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "lottery_draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_state_events" ADD CONSTRAINT "purchase_state_events_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "lottery_draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_snapshots" ADD CONSTRAINT "ticket_snapshots_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "lottery_draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_snapshot_entries" ADD CONSTRAINT "ticket_snapshot_entries_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "ticket_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_snapshot_entries" ADD CONSTRAINT "ticket_snapshot_entries_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "randomness_evidence" ADD CONSTRAINT "randomness_evidence_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "lottery_draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_winners" ADD CONSTRAINT "draw_winners_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "lottery_draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_winners" ADD CONSTRAINT "draw_winners_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draw_winners" ADD CONSTRAINT "draw_winners_snapshotEntryId_fkey" FOREIGN KEY ("snapshotEntryId") REFERENCES "ticket_snapshot_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "lottery_draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "draw_winners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prizes" ADD CONSTRAINT "prizes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "prizes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_postings" ADD CONSTRAINT "ledger_postings_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
