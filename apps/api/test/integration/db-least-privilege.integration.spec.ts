import {
  UserStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../../src/prisma/prisma.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('SEC-006 DB least privilege', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('runs application queries as a non-owner, non-superuser runtime login', async () => {
    const rows =
      await prisma.$queryRaw<
        Array<{
          currentUser: string;
          isSuperuser: boolean;
          canCreateRole: boolean;
          canCreateDb: boolean;
          bypassRls: boolean;
        }>
      >`
        SELECT
          current_user AS "currentUser",
          r.rolsuper AS "isSuperuser",
          r.rolcreaterole AS "canCreateRole",
          r.rolcreatedb AS "canCreateDb",
          r.rolbypassrls AS "bypassRls"
        FROM pg_roles AS r
        WHERE r.rolname = current_user
      `;

    expect(rows).toEqual([
      {
        currentUser:
          'amazing_chance_runtime_test',
        isSuperuser: false,
        canCreateRole: false,
        canCreateDb: false,
        bypassRls: false,
      },
    ]);
  });

  it('allows ordinary application DML', async () => {
    await expect(
      prisma.user.create({
        data: {
          email:
            `${randomUUID()}@example.com`,
          passwordHash: 'hash',
          status:
            UserStatus.ACTIVE,
          emailVerifiedAt:
            new Date(),
        },
      }),
    ).resolves.toMatchObject({
      status:
        UserStatus.ACTIVE,
    });
  });

  it('cannot create schema objects', async () => {
    await expect(
      prisma.$executeRawUnsafe(`
        CREATE TABLE sec006_forbidden_table (
          id INTEGER PRIMARY KEY
        )
      `),
    ).rejects.toThrow();
  });

  it('cannot alter tables or disable security triggers', async () => {
    await expect(
      prisma.$executeRawUnsafe(`
        ALTER TABLE "tickets"
        DISABLE TRIGGER ALL
      `),
    ).rejects.toThrow();
  });

  it('cannot truncate application tables', async () => {
    await expect(
      prisma.$executeRawUnsafe(`
        TRUNCATE TABLE "users"
      `),
    ).rejects.toThrow();
  });

  it('cannot access Prisma migration history', async () => {
    await expect(
      prisma.$queryRawUnsafe(`
        SELECT *
        FROM "_prisma_migrations"
        LIMIT 1
      `),
    ).rejects.toThrow();
  });

  it('does not receive structural privileges through role membership', async () => {
    const rows =
      await prisma.$queryRaw<
        Array<{
          schemaCreate: boolean;
          ticketTruncate: boolean;
          ticketTrigger: boolean;
          migrationSelect: boolean;
          ownsApplicationTable: boolean;
        }>
      >`
        SELECT
          has_schema_privilege(
            current_user,
            'public',
            'CREATE'
          ) AS "schemaCreate",
          has_table_privilege(
            current_user,
            'public.tickets',
            'TRUNCATE'
          ) AS "ticketTruncate",
          has_table_privilege(
            current_user,
            'public.tickets',
            'TRIGGER'
          ) AS "ticketTrigger",
          has_table_privilege(
            current_user,
            'public._prisma_migrations',
            'SELECT'
          ) AS "migrationSelect",
          EXISTS (
            SELECT 1
            FROM pg_class AS c
            JOIN pg_namespace AS n
              ON n.oid = c.relnamespace
            WHERE
              n.nspname = 'public'
              AND c.relkind IN ('r', 'p')
              AND pg_get_userbyid(
                c.relowner
              ) = current_user
          ) AS "ownsApplicationTable"
      `;

    expect(rows).toEqual([
      {
        schemaCreate: false,
        ticketTruncate: false,
        ticketTrigger: false,
        migrationSelect: false,
        ownsApplicationTable:
          false,
      },
    ]);
  });
});
