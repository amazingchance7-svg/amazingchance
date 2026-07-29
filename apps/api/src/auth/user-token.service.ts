import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  UserStatus,
  UserTokenType,
} from '@prisma/client';
import {
  createHash,
  randomBytes,
} from 'crypto';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  createEmailVerificationToken(
    userId: string,
  ): Promise<string> {
    const ttlSeconds = this.getPositiveInteger(
      'EMAIL_VERIFICATION_TTL_SECONDS',
      86_400,
    );

    return this.createToken(
      userId,
      UserTokenType.EMAIL_VERIFICATION,
      ttlSeconds,
    );
  }

  createPasswordResetToken(
    userId: string,
  ): Promise<string> {
    const ttlSeconds = this.getPositiveInteger(
      'PASSWORD_RESET_TTL_SECONDS',
      3_600,
    );

    return this.createToken(
      userId,
      UserTokenType.PASSWORD_RESET,
      ttlSeconds,
    );
  }

  async verifyEmail(rawToken: string) {
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();

    return this.prisma.$transaction(
      async (transaction) => {
        const token =
          await transaction.userToken.findUnique({
            where: { tokenHash },
          });

        if (
          !token ||
          token.type !==
            UserTokenType.EMAIL_VERIFICATION ||
          token.usedAt !== null ||
          token.expiresAt <= now
        ) {
          throw new BadRequestException(
            'Verification token is invalid or expired',
          );
        }

        const consumeResult =
          await transaction.userToken.updateMany({
            where: {
              id: token.id,
              usedAt: null,
              expiresAt: { gt: now },
            },
            data: { usedAt: now },
          });

        if (consumeResult.count !== 1) {
          throw new BadRequestException(
            'Verification token has already been used',
          );
        }

        const activationResult =
          await transaction.user.updateMany({
            where: {
              id: token.userId,
              status:
                UserStatus.PENDING_VERIFICATION,
              emailVerifiedAt: null,
            },
            data: {
              status: UserStatus.ACTIVE,
              emailVerifiedAt: now,
            },
          });

        if (activationResult.count !== 1) {
          throw new BadRequestException(
            'This account cannot be verified',
          );
        }

        await transaction.userToken.updateMany({
          where: {
            userId: token.userId,
            type:
              UserTokenType.EMAIL_VERIFICATION,
            usedAt: null,
          },
          data: { usedAt: now },
        });

        return transaction.user.findUniqueOrThrow({
          where: { id: token.userId },
          select: {
            id: true,
            email: true,
            status: true,
            emailVerifiedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      },
    );
  }

  async resetPassword(
    rawToken: string,
    passwordHash: string,
  ): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();

    await this.prisma.$transaction(
      async (transaction) => {
        const token =
          await transaction.userToken.findUnique({
            where: { tokenHash },
          });

        if (
          !token ||
          token.type !==
            UserTokenType.PASSWORD_RESET ||
          token.usedAt !== null ||
          token.expiresAt <= now
        ) {
          throw new BadRequestException(
            'Password reset token is invalid or expired',
          );
        }

        const consumeResult =
          await transaction.userToken.updateMany({
            where: {
              id: token.id,
              usedAt: null,
              expiresAt: { gt: now },
            },
            data: { usedAt: now },
          });

        if (consumeResult.count !== 1) {
          throw new BadRequestException(
            'Password reset token has already been used',
          );
        }

        await transaction.user.update({
          where: { id: token.userId },
          data: { passwordHash },
        });

        await transaction.refreshToken.updateMany({
          where: {
            userId: token.userId,
            revokedAt: null,
          },
          data: { revokedAt: now },
        });

        await transaction.userToken.updateMany({
          where: {
            userId: token.userId,
            type: UserTokenType.PASSWORD_RESET,
            usedAt: null,
          },
          data: { usedAt: now },
        });
      },
    );
  }

  private async createToken(
    userId: string,
    type: UserTokenType,
    ttlSeconds: number,
  ): Promise<string> {
    const rawToken =
      randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();

    await this.prisma.$transaction(
      async (transaction) => {
        await transaction.userToken.updateMany({
          where: {
            userId,
            type,
            usedAt: null,
          },
          data: { usedAt: now },
        });

        await transaction.userToken.create({
          data: {
            userId,
            type,
            tokenHash,
            expiresAt: new Date(
              now.getTime() + ttlSeconds * 1000,
            ),
          },
        });
      },
    );

    return rawToken;
  }

  private hashToken(token: string): string {
    return createHash('sha256')
      .update(token)
      .digest('hex');
  }

  private getPositiveInteger(
    key: string,
    fallback: number,
  ): number {
    const rawValue =
      this.configService.get<string | number>(key);

    if (rawValue === undefined) {
      return fallback;
    }

    const value = Number(rawValue);

    if (
      !Number.isSafeInteger(value) ||
      value <= 0
    ) {
      throw new Error(
        `${key} must be a positive integer`,
      );
    }

    return value;
  }
}
