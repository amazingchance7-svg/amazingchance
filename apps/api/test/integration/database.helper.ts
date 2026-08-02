import { PrismaService } from "../../src/prisma/prisma.service";

export async function createTestPrisma(): Promise<PrismaService> {
  const prisma = new PrismaService();
  await prisma.$connect();
  return prisma;
}

export async function cleanTestDatabase(
  prisma: PrismaService,
): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_logs",
      "ledger_postings",
      "ledger_transactions",
      "allocation_rules",
      "payouts",
      "prizes",
      "draw_winners",
      "randomness_evidence",
      "ticket_snapshot_entries",
      "ticket_snapshots",
      "tickets",
      "ticket_allocations",
      "ticket_sequences",
      "webhook_events",
      "payment_attempts",
      "payments",
      "purchase_state_events",
      "purchases",
      "user_roles",
      "user_tokens",
      "refresh_tokens",
      "lottery_draws",
      "users"
    RESTART IDENTITY CASCADE
  `);
}
