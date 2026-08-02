import { Prisma } from '@prisma/client';

import { Permissions } from '../../src/authorization/permissions.constants';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UsersService } from '../../src/users/users.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('Authorization foundation', () => {
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

  it('seeds the exact approved roles and permissions', async () => {
    const roles = await prisma.role.findMany({
      orderBy: { code: 'asc' },
      select: { code: true },
    });
    const permissions = await prisma.permission.findMany({
      orderBy: { code: 'asc' },
      select: { code: true },
    });

    expect(roles.map((role) => role.code)).toEqual([
      'CUSTOMER',
      'DRAW_OPERATOR',
      'PLATFORM_ADMIN',
    ]);
    expect(permissions.map((permission) => permission.code)).toEqual(
      Object.values(Permissions).sort(),
    );
  });

  it('does not grant administrative draw permissions to CUSTOMER', async () => {
    const customer = await prisma.role.findUniqueOrThrow({
      where: { code: 'CUSTOMER' },
      include: { permissions: true },
    });

    expect(customer.permissions).toHaveLength(0);
  });

  it('never creates ticket, snapshot, randomness, or winner override permissions', async () => {
    const forbidden = await prisma.permission.findMany({
      where: {
        OR: [
          { code: { startsWith: 'ticket.' } },
          { code: { startsWith: 'snapshot.' } },
          { code: { startsWith: 'randomness.' } },
          { code: { startsWith: 'winner.' } },
        ],
      },
    });

    expect(forbidden).toEqual([]);
  });

  it('assigns CUSTOMER in the same registration transaction', async () => {
    const usersService = new UsersService(prisma);
    const user = await usersService.createFromRegistration({
      email: 'customer@example.com',
      passwordHash: '$argon2id$integration-test-hash',
    });

    const assignment = await prisma.userRole.findUnique({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId: '00000000-0000-4000-8000-000000000101',
        },
      },
      include: { role: true },
    });

    expect(assignment?.role.code).toBe('CUSTOMER');
  });

  it('prevents duplicate role assignments at database level', async () => {
    const usersService = new UsersService(prisma);
    const user = await usersService.createFromRegistration({
      email: 'duplicate-role@example.com',
      passwordHash: '$argon2id$integration-test-hash',
    });

    await expect(
      prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: '00000000-0000-4000-8000-000000000101',
        },
      }),
    ).rejects.toMatchObject<Partial<Prisma.PrismaClientKnownRequestError>>({
      code: 'P2002',
    });
  });
});
