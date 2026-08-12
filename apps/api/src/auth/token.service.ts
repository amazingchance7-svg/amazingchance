import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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
  createHash,
  randomUUID,
} from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

interface TokenUser {
  id: string;
  email: string;
  mfaVerified: boolean;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwtService:
      JwtService,
    private readonly configService:
      ConfigService,
    private readonly prisma:
      PrismaService,
  ) {}

  async createTokenPair(
    user: TokenUser,
  ) {
    const pair =
      await this.signTokenPair(
        user,
      );

    await this.prisma.refreshToken
      .create({
        data: {
          userId:
            user.id,
          tokenHash:
            pair
              .refreshTokenHash,
          expiresAt:
            pair
              .refreshTokenExpiresAt,
          mfaVerified:
            user.mfaVerified,
        },
      });

    return this.toPublicPair(
      pair,
    );
  }

  async rotate(
    dto: RefreshTokenDto,
  ) {
    const payload =
      await this.verifyRefreshToken(
        dto.refreshToken,
      );

    const tokenHash =
      this.hashToken(
        dto.refreshToken,
      );

    const storedToken =
      await this.prisma.refreshToken
        .findUnique({
          where: {
            tokenHash,
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                status: true,
                emailVerifiedAt:
                  true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        });

    if (
      !storedToken ||
      storedToken.userId !==
        payload.sub ||
      storedToken.revokedAt !==
        null ||
      storedToken.expiresAt <=
        new Date()
    ) {
      throw new UnauthorizedException(
        'Refresh token is invalid or expired',
      );
    }

    if (
      storedToken.user.email !==
        payload.email ||
      storedToken.user.status !==
        UserStatus.ACTIVE ||
      !storedToken.user
        .emailVerifiedAt
    ) {
      await this.revokeAllForUser(
        storedToken.userId,
      );

      throw new UnauthorizedException(
        'Refresh token is invalid or expired',
      );
    }

    let mfaVerified =
      storedToken.mfaVerified &&
      payload.mfa === true;

    if (mfaVerified) {
      const credential =
        await this.prisma
          .mfaCredential
          .findUnique({
            where: {
              userId:
                storedToken.userId,
            },
            select: {
              enabledAt: true,
            },
          });

      mfaVerified =
        Boolean(
          credential?.enabledAt,
        );
    }

    const pair =
      await this.signTokenPair({
        id:
          storedToken.user.id,
        email:
          storedToken.user.email,
        mfaVerified,
      });

    await this.prisma
      .$transaction(
        async (
          transaction,
        ) => {
          const revokeResult =
            await transaction
              .refreshToken
              .updateMany({
                where: {
                  id:
                    storedToken.id,
                  revokedAt:
                    null,
                  expiresAt: {
                    gt:
                      new Date(),
                  },
                },
                data: {
                  revokedAt:
                    new Date(),
                },
              });

          if (
            revokeResult.count !== 1
          ) {
            throw new UnauthorizedException(
              'Refresh token has already been used',
            );
          }

          await transaction
            .refreshToken
            .create({
              data: {
                userId:
                  storedToken
                    .user.id,
                tokenHash:
                  pair
                    .refreshTokenHash,
                expiresAt:
                  pair
                    .refreshTokenExpiresAt,
                mfaVerified,
              },
            });
        },
      );

    return {
      ...this.toPublicPair(
        pair,
      ),
      user:
        storedToken.user,
    };
  }

  async revoke(
    dto: RefreshTokenDto,
  ): Promise<void> {
    await this.prisma
      .refreshToken
      .updateMany({
        where: {
          tokenHash:
            this.hashToken(
              dto.refreshToken,
            ),
          revokedAt:
            null,
        },
        data: {
          revokedAt:
            new Date(),
        },
      });
  }

  private async revokeAllForUser(
    userId: string,
  ): Promise<void> {
    await this.prisma
      .refreshToken
      .updateMany({
        where: {
          userId,
          revokedAt:
            null,
        },
        data: {
          revokedAt:
            new Date(),
        },
      });
  }

  private async signTokenPair(
    user: TokenUser,
  ) {
    const accessSecret =
      this.configService
        .getOrThrow<string>(
          'JWT_ACCESS_SECRET',
        );

    const refreshSecret =
      this.configService
        .getOrThrow<string>(
          'JWT_REFRESH_SECRET',
        );

    const accessTtlSeconds =
      this.configService
        .getOrThrow<number>(
          'JWT_ACCESS_TTL_SECONDS',
        );

    const refreshTtlSeconds =
      this.configService
        .getOrThrow<number>(
          'JWT_REFRESH_TTL_SECONDS',
        );

    const accessPayload:
      JwtPayload = {
        sub: user.id,
        email: user.email,
        type: 'access',
        mfa:
          user.mfaVerified,
      };

    const refreshPayload:
      JwtPayload = {
        sub: user.id,
        email: user.email,
        type: 'refresh',
        mfa:
          user.mfaVerified,
        jti:
          randomUUID(),
      };

    const [
      accessToken,
      refreshToken,
    ] =
      await Promise.all([
        this.jwtService
          .signAsync(
            accessPayload,
            {
              secret:
                accessSecret,
              expiresIn:
                accessTtlSeconds,
            },
          ),
        this.jwtService
          .signAsync(
            refreshPayload,
            {
              secret:
                refreshSecret,
              expiresIn:
                refreshTtlSeconds,
            },
          ),
      ]);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn:
        accessTtlSeconds,
      refreshTokenExpiresIn:
        refreshTtlSeconds,
      refreshTokenHash:
        this.hashToken(
          refreshToken,
        ),
      refreshTokenExpiresAt:
        new Date(
          Date.now() +
            refreshTtlSeconds *
              1000,
        ),
    };
  }

  private async verifyRefreshToken(
    refreshToken: string,
  ): Promise<JwtPayload> {
    try {
      const payload =
        await this.jwtService
          .verifyAsync<JwtPayload>(
            refreshToken,
            {
              secret:
                this.configService
                  .getOrThrow<string>(
                    'JWT_REFRESH_SECRET',
                  ),
            },
          );

      if (
        payload.type !==
          'refresh' ||
        !payload.sub ||
        !payload.email ||
        !payload.jti ||
        typeof payload.mfa !==
          'boolean'
      ) {
        throw new UnauthorizedException(
          'Invalid refresh token',
        );
      }

      return payload;
    } catch {
      throw new UnauthorizedException(
        'Refresh token is invalid or expired',
      );
    }
  }

  private hashToken(
    token: string,
  ): string {
    return createHash(
      'sha256',
    )
      .update(token)
      .digest('hex');
  }

  private toPublicPair(
    pair: {
      accessToken: string;
      refreshToken: string;
      accessTokenExpiresIn:
        number;
      refreshTokenExpiresIn:
        number;
    },
  ) {
    return {
      accessToken:
        pair.accessToken,
      refreshToken:
        pair.refreshToken,
      accessTokenExpiresIn:
        pair
          .accessTokenExpiresIn,
      refreshTokenExpiresIn:
        pair
          .refreshTokenExpiresIn,
    };
  }
}
