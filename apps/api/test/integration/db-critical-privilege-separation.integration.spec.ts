import { PrismaService } from '../../src/prisma/prisma.service';
import {
  createTestPrisma,
} from './database.helper';

describe(
  'SEC-026 critical database privilege separation',
  () => {
    let prisma: PrismaService;

    beforeAll(async () => {
      prisma = await createTestPrisma();
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    it(
      'prevents the default runtime principal from directly mutating integrity-critical state',
      async () => {
        const rows =
          await prisma.$queryRaw<
            Array<{
              tableName: string;
              privilege: string;
            }>
          >`
            WITH critical_tables("tableName") AS (
              VALUES
                ('lottery_draws'),
                ('payments'),
                ('payment_attempts'),
                ('webhook_events'),
                ('ledger_transactions'),
                ('ledger_postings'),
                ('allocation_rules'),
                ('ticket_sequences'),
                ('ticket_allocations'),
                ('tickets'),
                ('ticket_snapshots'),
                ('ticket_snapshot_entries'),
                ('randomness_evidence'),
                ('draw_winners'),
                ('prize_distribution_rules'),
                ('prize_distribution_rule_entries'),
                ('prizes'),
                ('prize_claims'),
                ('prize_eligibility_checks'),
                ('payouts')
            ),
            mutation_privileges("privilege") AS (
              VALUES
                ('INSERT'),
                ('UPDATE'),
                ('DELETE')
            )
            SELECT
              critical_tables."tableName",
              mutation_privileges."privilege"
            FROM critical_tables
            CROSS JOIN mutation_privileges
            WHERE has_table_privilege(
              current_user,
              FORMAT(
                'public.%I',
                critical_tables."tableName"
              ),
              mutation_privileges."privilege"
            )
            ORDER BY
              critical_tables."tableName",
              mutation_privileges."privilege"
          `;

        expect(rows).toEqual([]);
      },
    );
  },
);
