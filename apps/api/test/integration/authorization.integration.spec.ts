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
      'BUSINESS_OWNER',
      'CUSTOMER',
      'DRAW_OPERATOR',
      'PLATFORM_ADMIN',
    ]);
    expect(permissions.map((permission) => permission.code)).toEqual(
      Object.values(Permissions).sort(),
    );
  });


  it('enforces the exact privileged separation-of-duties matrix', async () => {
    async function rolePermissions(
      code: string,
    ): Promise<string[]> {
      const role =
        await prisma.role.findUniqueOrThrow({
          where: {
            code,
          },
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        });

      return role.permissions
        .map(
          (entry) =>
            entry.permission.code,
        )
        .sort();
    }

    await expect(
      rolePermissions(
        'BUSINESS_OWNER',
      ),
    ).resolves.toEqual(
      [
        Permissions.DRAW_CANCEL,
        Permissions.DRAW_CREATE,
        Permissions.DRAW_PUBLISH,
        Permissions.DRAW_READ_ADMIN,
        Permissions.DRAW_UPDATE,
        Permissions.FINANCE_READ_ADMIN,
        Permissions.PURCHASE_READ_ADMIN,
        Permissions.PURCHASE_REFUND_ADMIN,
        Permissions.TICKET_READ_ADMIN,
      ].sort(),
    );

    await expect(
      rolePermissions(
        'PLATFORM_ADMIN',
      ),
    ).resolves.toEqual(
      [
        Permissions.DRAW_READ_ADMIN,
        Permissions.PRIZE_CLAIM_REVIEW_ADMIN,
        Permissions.PURCHASE_CANCEL_ADMIN,
        Permissions.PURCHASE_READ_ADMIN,
        Permissions.PURCHASE_REVIEW_ADMIN,
        Permissions.TICKET_READ_ADMIN,
        Permissions.USER_READ_ADMIN,
      ].sort(),
    );

    await expect(
      rolePermissions(
        'DRAW_OPERATOR',
      ),
    ).resolves.toEqual(
      [
        Permissions.DRAW_BUILD_SNAPSHOT,
        Permissions.DRAW_FINALIZE_SNAPSHOT,
        Permissions.DRAW_READ_ADMIN,
        Permissions.DRAW_REQUEST_RANDOMNESS,
        Permissions.DRAW_SELECT_WINNERS,
      ].sort(),
    );
  });

  it('does not grant manual sales-window control to any privileged human role', async () => {
    const grants =
      await prisma.rolePermission.findMany({
        where: {
          role: {
            code: {
              in: [
                'BUSINESS_OWNER',
                'PLATFORM_ADMIN',
                'DRAW_OPERATOR',
              ],
            },
          },
          permission: {
            code: {
              in: [
                Permissions.DRAW_OPEN_SALES,
                Permissions.DRAW_CLOSE_SALES,
              ],
            },
          },
        },
      });

    expect(grants).toEqual([]);
  });

  it('keeps cryptographic draw execution away from BUSINESS_OWNER and PLATFORM_ADMIN', async () => {
    const grants =
      await prisma.rolePermission.findMany({
        where: {
          role: {
            code: {
              in: [
                'BUSINESS_OWNER',
                'PLATFORM_ADMIN',
              ],
            },
          },
          permission: {
            code: {
              in: [
                Permissions.DRAW_BUILD_SNAPSHOT,
                Permissions.DRAW_FINALIZE_SNAPSHOT,
                Permissions.DRAW_REQUEST_RANDOMNESS,
                Permissions.DRAW_SELECT_WINNERS,
              ],
            },
          },
        },
      });

    expect(grants).toEqual([]);
  });

  it('does not grant administrative draw permissions to CUSTOMER', async () => {
    const customer = await prisma.role.findUniqueOrThrow({
      where: { code: 'CUSTOMER' },
      include: { permissions: true },
    });

    expect(customer.permissions).toHaveLength(0);
  });

  it('never creates ticket mutation, snapshot, randomness, or winner override permissions', async () => {
    const forbidden = await prisma.permission.findMany({
      where: {
        OR: [
          {
            AND: [
              { code: { startsWith: 'ticket.' } },
              { code: { not: Permissions.TICKET_READ_ADMIN } },
            ],
          },
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
