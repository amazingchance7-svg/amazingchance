import { Permissions } from '../../src/authorization/permissions.constants';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('Randomness permission integration', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma =
      await createTestPrisma();
  });

  beforeEach(async () => {
    await cleanTestDatabase(
      prisma,
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('seeds draw.request_randomness and grants it to DRAW_OPERATOR', async () => {
    const permission =
      await prisma.permission.findUnique({
        where: {
          code:
            Permissions
              .DRAW_REQUEST_RANDOMNESS,
        },
      });

    expect(permission).not.toBeNull();

    expect(
      permission?.code,
    ).toBe(
      'draw.request_randomness',
    );

    const role =
      await prisma.role.findUniqueOrThrow({
        where: {
          code:
            'DRAW_OPERATOR',
        },
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      });

    expect(
      role.permissions.map(
        (entry) =>
          entry.permission.code,
      ),
    ).toContain(
      Permissions
        .DRAW_REQUEST_RANDOMNESS,
    );
  });

  it('does not grant draw.request_randomness to CUSTOMER', async () => {
    const role =
      await prisma.role.findUniqueOrThrow({
        where: {
          code:
            'CUSTOMER',
        },
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      });

    expect(
      role.permissions.map(
        (entry) =>
          entry.permission.code,
      ),
    ).not.toContain(
      Permissions
        .DRAW_REQUEST_RANDOMNESS,
    );
  });
});
