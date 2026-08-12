CREATE TYPE "NotificationOutboxType" AS ENUM (
  'PURCHASE_COMPLETED'
);

CREATE TYPE "NotificationOutboxStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SENT',
  'FAILED'
);

CREATE TABLE "notification_outbox" (
  "id" UUID NOT NULL,
  "type" "NotificationOutboxType" NOT NULL,
  "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMPTZ(3),
  "sentAt" TIMESTAMPTZ(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_outbox_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "notification_outbox_attempts_nonnegative"
    CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX
  "notification_outbox_idempotencyKey_key"
ON "notification_outbox"("idempotencyKey");

CREATE INDEX
  "notification_outbox_status_nextAttemptAt_idx"
ON "notification_outbox"("status", "nextAttemptAt");

CREATE INDEX
  "notification_outbox_lockedAt_idx"
ON "notification_outbox"("lockedAt");
