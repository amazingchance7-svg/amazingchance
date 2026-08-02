import { MODULE_METADATA } from '@nestjs/common/constants';

import { UsersModule } from '../../src/users/users.module';
import { UsersService } from '../../src/users/users.service';

describe('Users security boundary', () => {
  it('does not register a public UsersController', () => {
    const controllers =
      Reflect.getMetadata(
        MODULE_METADATA.CONTROLLERS,
        UsersModule,
      ) ?? [];

    expect(controllers).toEqual([]);
  });

  it('creates a user and assigns the default customer role atomically', async () => {
    const userCreate = jest.fn().mockResolvedValue({
      id: '8c178c35-c0cb-4634-a17f-3c868ea5e6e1',
      email: 'user@example.com',
    });
    const userRoleCreate = jest.fn().mockResolvedValue({});
    const roleFindUnique = jest.fn().mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000101',
    });

    type TransactionClient = {
      role: { findUnique: typeof roleFindUnique };
      user: { create: typeof userCreate };
      userRole: { create: typeof userRoleCreate };
    };

    const transaction = jest.fn(
      async (
        callback: (client: TransactionClient) => Promise<unknown>,
      ) => callback({
        role: { findUnique: roleFindUnique },
        user: { create: userCreate },
        userRole: { create: userRoleCreate },
      }),
    );

    const service = new UsersService({
      $transaction: transaction,
    } as never);

    await service.createFromRegistration({
      email: '  USER@EXAMPLE.COM ',
      passwordHash: '$argon2id$test-hash',
    });

    expect(roleFindUnique).toHaveBeenCalledWith({
      where: { code: 'CUSTOMER' },
      select: { id: true },
    });
    expect(userCreate).toHaveBeenCalledWith({
      data: {
        email: 'user@example.com',
        passwordHash: '$argon2id$test-hash',
      },
      select: {
        id: true,
        email: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    expect(userRoleCreate).toHaveBeenCalledWith({
      data: {
        userId: '8c178c35-c0cb-4634-a17f-3c868ea5e6e1',
        roleId: '00000000-0000-4000-8000-000000000101',
      },
    });
  });
});
