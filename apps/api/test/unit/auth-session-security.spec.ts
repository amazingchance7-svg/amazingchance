import {
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ConfigService,
} from '@nestjs/config';
import {
  UserStatus,
} from '@prisma/client';

import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { EmailService } from '../../src/email/email.service';

describe('Auth session security', () => {
  const accessSecret =
    'unit-access-secret-at-least-32-bytes-long';

  function createStrategy(
    findOne: jest.Mock,
  ) {
    return new JwtStrategy(
      new ConfigService({
        JWT_ACCESS_SECRET:
          accessSecret,
      }),
      {
        findOne,
      } as never,
    );
  }

  it('rejects refresh tokens at the access-token strategy boundary', async () => {
    const findOne =
      jest.fn();

    const strategy =
      createStrategy(
        findOne,
      );

    await expect(
      strategy.validate({
        sub:
          'user-id',
        email:
          'user@example.com',
        type:
          'refresh',
        mfa: false,
        jti:
          'refresh-jti',
      }),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(
      findOne,
    ).not.toHaveBeenCalled();
  });

  it('rejects legacy access tokens without an explicit MFA assurance claim', async () => {
    const strategy =
      createStrategy(
        jest.fn(),
      );

    await expect(
      strategy.validate({
        sub: 'user-id',
        email:
          'user@example.com',
        type: 'access',
      }),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects access tokens for suspended users', async () => {
    const findOne =
      jest.fn()
        .mockResolvedValue({
          id:
            'user-id',
          email:
            'user@example.com',
          status:
            UserStatus
              .SUSPENDED,
          emailVerifiedAt:
            new Date(),
          createdAt:
            new Date(),
          updatedAt:
            new Date(),
        });

    const strategy =
      createStrategy(
        findOne,
      );

    await expect(
      strategy.validate({
        sub:
          'user-id',
        email:
          'user@example.com',
        type:
          'access',
        mfa: false,
      }),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects access tokens for unverified users', async () => {
    const findOne =
      jest.fn()
        .mockResolvedValue({
          id:
            'user-id',
          email:
            'user@example.com',
          status:
            UserStatus
              .ACTIVE,
          emailVerifiedAt:
            null,
          createdAt:
            new Date(),
          updatedAt:
            new Date(),
        });

    const strategy =
      createStrategy(
        findOne,
      );

    await expect(
      strategy.validate({
        sub:
          'user-id',
        email:
          'user@example.com',
        type:
          'access',
        mfa: false,
      }),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects access tokens whose email no longer matches the account', async () => {
    const findOne =
      jest.fn()
        .mockResolvedValue({
          id:
            'user-id',
          email:
            'new@example.com',
          status:
            UserStatus
              .ACTIVE,
          emailVerifiedAt:
            new Date(),
          createdAt:
            new Date(),
          updatedAt:
            new Date(),
        });

    const strategy =
      createStrategy(
        findOne,
      );

    await expect(
      strategy.validate({
        sub:
          'user-id',
        email:
          'old@example.com',
        type:
          'access',
        mfa: false,
      }),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('normalizes a deleted account to an authentication failure', async () => {
    const findOne =
      jest.fn()
        .mockRejectedValue(
          new NotFoundException(
            'User not found',
          ),
        );

    const strategy =
      createStrategy(
        findOne,
      );

    await expect(
      strategy.validate({
        sub:
          'deleted-user-id',
        email:
          'user@example.com',
        type:
          'access',
        mfa: false,
      }),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns current user data with MFA assurance from the token', async () => {
    const findOne =
      jest.fn()
        .mockResolvedValue({
          id:
            'user-id',
          email:
            'user@example.com',
          status:
            UserStatus
              .ACTIVE,
          emailVerifiedAt:
            new Date(),
          createdAt:
            new Date(),
          updatedAt:
            new Date(),
        });

    const strategy =
      createStrategy(
        findOne,
      );

    await expect(
      strategy.validate({
        sub:
          'user-id',
        email:
          'user@example.com',
        type:
          'access',
        mfa: true,
      }),
    ).resolves.toMatchObject({
      id:
        'user-id',
      mfaVerified:
        true,
    });
  });

  afterAll(() => {
    jest
      .spyOn(
        Logger.prototype,
        'log',
      )
      .mockRestore?.();

    void EmailService;
  });
});
