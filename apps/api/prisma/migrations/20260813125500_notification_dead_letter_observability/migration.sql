ALTER TYPE "NotificationOutboxStatus"
ADD VALUE IF NOT EXISTS 'DEAD_LETTER';

ALTER TABLE "notification_outbox"
ADD COLUMN "deadLetteredAt" TIMESTAMPTZ(3);

CREATE INDEX
  "notification_outbox_deadLetteredAt_idx"
ON "notification_outbox"("deadLetteredAt");
