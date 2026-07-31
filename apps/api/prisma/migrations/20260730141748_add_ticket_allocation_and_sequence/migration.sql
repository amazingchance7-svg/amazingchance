-- CreateTable
CREATE TABLE "ticket_sequences" (
    "drawId" UUID NOT NULL,
    "nextNumber" BIGINT NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ticket_sequences_pkey" PRIMARY KEY ("drawId")
);

-- CreateTable
CREATE TABLE "ticket_allocations" (
    "id" UUID NOT NULL,
    "purchaseId" UUID NOT NULL,
    "drawId" UUID NOT NULL,
    "startNumber" BIGINT NOT NULL,
    "endNumber" BIGINT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ticket_allocations_purchaseId_key" ON "ticket_allocations"("purchaseId");

-- CreateIndex
CREATE INDEX "ticket_allocations_drawId_createdAt_idx" ON "ticket_allocations"("drawId", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_allocations_correlationId_idx" ON "ticket_allocations"("correlationId");

-- AddForeignKey
ALTER TABLE "ticket_sequences" ADD CONSTRAINT "ticket_sequences_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "lottery_draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_allocations" ADD CONSTRAINT "ticket_allocations_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_allocations" ADD CONSTRAINT "ticket_allocations_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "lottery_draws"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
