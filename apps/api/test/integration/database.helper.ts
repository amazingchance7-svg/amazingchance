import { Client } from "pg";

import { PrismaService } from "../../src/prisma/prisma.service";

export async function createTestPrisma(): Promise<PrismaService> {
  const prisma = new PrismaService();
  await prisma.$connect();
  return prisma;
}

export async function executeAdminSql(
  sql: string,
): Promise<void> {
  const connectionString =
    process.env.TEST_ADMIN_DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "TEST_ADMIN_DATABASE_URL is required for privileged integration-test setup",
    );
  }

  const client = new Client({
    connectionString,
  });

  await client.connect();

  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

export async function cleanTestDatabase(
  prisma: PrismaService,
): Promise<void> {
  // Keep the runtime Prisma argument so every existing integration
  // suite uses one stable helper signature. Cleanup itself requires
  // the separate administrative connection because runtime has no
  // TRUNCATE privilege.
  void prisma;
  await executeAdminSql(`
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
