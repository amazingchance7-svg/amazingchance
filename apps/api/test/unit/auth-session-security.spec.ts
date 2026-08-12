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
    findOneForAuthSession: jest.Mock,
  ) {
    return new JwtStrategy(
      new ConfigService({
        JWT_ACCESS_SECRET:
          accessSecret,
      }),
      {
        findOneForAuthSession,
      } as never,
    );
  }

  it('rejects refresh tokens at the access-token strategy boundary', async () => {
    const findOneForAuthSession =
      jest.fn();

    const strategy =
      createStrategy(
        findOneForAuthSession,
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
        authVersion: 1,
        jti:
          'refresh-jti',
      }),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(
      findOneForAuthSession,
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

  it('rejects access tokens without an explicit auth version claim', async () => {
    const strategy =
      createStrategy(
        jest.fn(),
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

  it('rejects access tokens for suspended users', async () => {
    const findOneForAuthSession =
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
          authVersion: 1,
          createdAt:
            new Date(),
          updatedAt:
            new Date(),
        });

    const strategy =
      createStrategy(
        findOneForAuthSession,
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
        authVersion: 1,
      }),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects access tokens for unverified users', async () => {
    const findOneForAuthSession =
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
          authVersion: 1,
          createdAt:
            new Date(),
          updatedAt:
            new Date(),
        });

    const strategy =
      createStrategy(
        findOneForAuthSession,
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
        authVersion: 1,
      }),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects access tokens whose email no longer matches the account', async () => {
    const findOneForAuthSession =
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
          authVersion: 1,
          createdAt:
            new Date(),
          updatedAt:
            new Date(),
        });

    const strategy =
      createStrategy(
        findOneForAuthSession,
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
        authVersion: 1,
      }),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects access tokens whose auth version no longer matches the account', async () => {
    const findOneForAuthSession =
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
          authVersion: 2,
          createdAt:
            new Date(),
          updatedAt:
            new Date(),
        });

    const strategy =
      createStrategy(
        findOneForAuthSession,
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
        authVersion: 1,
      }),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('normalizes a deleted account to an authentication failure', async () => {
    const findOneForAuthSession =
      jest.fn()
        .mockRejectedValue(
          new NotFoundException(
            'User not found',
          ),
        );

    const strategy =
      createStrategy(
        findOneForAuthSession,
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
        authVersion: 1,
      }),
    ).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('returns current user data with MFA assurance from the token', async () => {
    const findOneForAuthSession =
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
          authVersion: 1,
          createdAt:
            new Date(),
          updatedAt:
            new Date(),
        });

    const strategy =
      createStrategy(
        findOneForAuthSession,
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
        authVersion: 1,
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
