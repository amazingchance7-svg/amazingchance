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

  it('creates users only from an internal registration input', async () => {
    const create = jest.fn().mockResolvedValue({
      id: '8c178c35-c0cb-4634-a17f-3c868ea5e6e1',
      email: 'user@example.com',
    });

    const prisma = {
      user: {
        create,
      },
    };

    const service = new UsersService(prisma as never);

    await service.createFromRegistration({
      email: '  USER@EXAMPLE.COM ',
      passwordHash: '$argon2id$test-hash',
    });

    expect(create).toHaveBeenCalledWith({
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
  });
});
