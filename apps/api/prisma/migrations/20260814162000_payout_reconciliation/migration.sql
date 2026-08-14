ALTER TABLE "payouts"
ADD COLUMN "reconciliationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastReconciledAt" TIMESTAMPTZ(3),
ADD COLUMN "nextReconciliationAt" TIMESTAMPTZ(3);

CREATE INDEX "payouts_status_nextReconciliationAt_idx"
ON "payouts"("status", "nextReconciliationAt");
