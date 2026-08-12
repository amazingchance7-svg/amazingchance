import {
  ConfigService,
} from '@nestjs/config';
import {
  JwtService,
} from '@nestjs/jwt';
import {
  UserStatus,
} from '@prisma/client';

import {
  JwtStrategy,
} from '../../src/auth/strategies/jwt.strategy';
import {
  TokenService,
} from '../../src/auth/token.service';
import {
  UserTokenService,
} from '../../src/auth/user-token.service';
import {
  UsersService,
} from '../../src/users/users.service';
import {
  cleanTestDatabase,
  createTestPrisma,
} from './database.helper';

describe('authVersion recovery revocation', () => {
  const accessSecret =
    'integration-access-secret-at-least-32-bytes';
  const refreshSecret =
    'integration-refresh-secret-at-least-32-bytes';

  it('invalidates an issued access token after password reset while preserving MFA', async () => {
    const prisma =
      await createTestPrisma();

    try {
      await cleanTestDatabase(
        prisma,
      );

      const user =
        await prisma.user.create({
          data: {
            email:
              'recovery@example.com',
            passwordHash:
              'old-password-hash',
            status:
              UserStatus.ACTIVE,
            emailVerifiedAt:
              new Date(),
          },
        });

      await prisma.mfaCredential.create({
        data: {
          userId:
            user.id,
          encryptedSecret:
            'ciphertext',
          encryptionIv:
            'iv',
          authTag:
            'tag',
          enabledAt:
            new Date(),
        },
      });

      const tokenService =
        new TokenService(
          new JwtService(),
          new ConfigService({
            JWT_ACCESS_SECRET:
              accessSecret,
            JWT_REFRESH_SECRET:
              refreshSecret,
            JWT_ACCESS_TTL_SECONDS:
              900,
            JWT_REFRESH_TTL_SECONDS:
              86_400,
          }),
          prisma,
        );

      const pair =
        await tokenService
          .createTokenPair({
            id:
              user.id,
            email:
              user.email,
            mfaVerified:
              true,
          });

      const oldPayload =
        await new JwtService()
          .verifyAsync(
            pair.accessToken,
            {
              secret:
                accessSecret,
            },
          );

      expect(
        oldPayload.authVersion,
      ).toBe(1);

      const userTokenService =
        new UserTokenService(
          prisma,
          new ConfigService({
            PASSWORD_RESET_TTL_SECONDS:
              3600,
          }),
        );

      const resetToken =
        await userTokenService
          .createPasswordResetToken(
            user.id,
          );

      await userTokenService
        .resetPassword(
          resetToken,
          'new-password-hash',
        );

      const afterReset =
        await prisma.user
          .findUniqueOrThrow({
            where: {
              id:
                user.id,
            },
            include: {
              mfaCredential:
                true,
              refreshTokens:
                true,
            },
          });

      expect(
        afterReset.authVersion,
      ).toBe(2);

      expect(
        afterReset
          .mfaCredential
          ?.enabledAt,
      ).not.toBeNull();

      expect(
        afterReset
          .refreshTokens
          .every(
            (token) =>
              token.revokedAt !==
              null,
          ),
      ).toBe(true);

      const strategy =
        new JwtStrategy(
          new ConfigService({
            JWT_ACCESS_SECRET:
              accessSecret,
          }),
          new UsersService(
            prisma,
          ),
        );

      await expect(
        strategy.validate(
          oldPayload,
        ),
      ).rejects.toThrow(
        'Access token is no longer valid',
      );
    } finally {
      await prisma.$disconnect();
    }
  });
});
