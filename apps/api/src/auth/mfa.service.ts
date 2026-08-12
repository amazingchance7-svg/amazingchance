import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ConfigService,
} from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import {
  decodeMfaEncryptionKey,
  decryptTotpSecret,
  encodeBase32,
  encryptTotpSecret,
  generateTotpSecret,
  verifyTotpCode,
} from './mfa-totp.util';

const MFA_ISSUER =
  'Amazing Chance';

@Injectable()
export class MfaService {
  constructor(
    private readonly prisma:
      PrismaService,
    private readonly config:
      ConfigService,
  ) {}

  async startSetup(
    userId: string,
    email: string,
  ) {
    const existing =
      await this.prisma
        .mfaCredential
        .findUnique({
          where: {
            userId,
          },
        });

    if (
      existing?.enabledAt
    ) {
      throw new ConflictException(
        'MFA is already enabled',
      );
    }

    const secret =
      generateTotpSecret();

    const encrypted =
      encryptTotpSecret(
        secret,
        this.getEncryptionKey(),
      );

    await this.prisma
      .mfaCredential
      .upsert({
        where: {
          userId,
        },
        create: {
          userId,
          ...encrypted,
        },
        update: {
          ...encrypted,
          enabledAt:
            null,
        },
      });

    const encodedSecret =
      encodeBase32(
        secret,
      );

    const label =
      encodeURIComponent(
        `${MFA_ISSUER}:${email}`,
      );

    const issuer =
      encodeURIComponent(
        MFA_ISSUER,
      );

    return {
      secret:
        encodedSecret,
      otpauthUri:
        `otpauth://totp/${label}` +
        `?secret=${encodedSecret}` +
        `&issuer=${issuer}` +
        '&algorithm=SHA1' +
        '&digits=6' +
        '&period=30',
    };
  }

  async enable(
    userId: string,
    code: string,
  ) {
    const credential =
      await this.prisma
        .mfaCredential
        .findUnique({
          where: {
            userId,
          },
        });

    if (!credential) {
      throw new UnauthorizedException(
        'MFA setup is not initialized',
      );
    }

    this.assertValidCode(
      credential,
      code,
    );

    if (
      credential.enabledAt
    ) {
      return {
        enabledAt:
          credential.enabledAt,
      };
    }

    const enabledAt =
      new Date();

    await this.prisma
      .mfaCredential
      .update({
        where: {
          userId,
        },
        data: {
          enabledAt,
        },
      });

    return {
      enabledAt,
    };
  }

  async verify(
    userId: string,
    code: string,
  ): Promise<boolean> {
    const credential =
      await this.prisma
        .mfaCredential
        .findUnique({
          where: {
            userId,
          },
        });

    if (
      !credential ||
      !credential.enabledAt
    ) {
      return false;
    }

    try {
      this.assertValidCode(
        credential,
        code,
      );

      return true;
    } catch {
      return false;
    }
  }

  async isEnabled(
    userId: string,
  ): Promise<boolean> {
    const credential =
      await this.prisma
        .mfaCredential
        .findUnique({
          where: {
            userId,
          },
          select: {
            enabledAt: true,
          },
        });

    return Boolean(
      credential?.enabledAt,
    );
  }

  async disable(
    userId: string,
    code: string,
  ): Promise<void> {
    const credential =
      await this.prisma
        .mfaCredential
        .findUnique({
          where: {
            userId,
          },
        });

    if (
      !credential ||
      !credential.enabledAt
    ) {
      throw new UnauthorizedException(
        'MFA is not enabled',
      );
    }

    this.assertValidCode(
      credential,
      code,
    );

    await this.prisma
      .$transaction(
        async (tx) => {
          await tx
            .mfaCredential
            .delete({
              where: {
                userId,
              },
            });

          await tx
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
        },
      );
  }

  private assertValidCode(
    credential: {
      encryptedSecret:
        string;
      encryptionIv:
        string;
      authTag:
        string;
    },
    code: string,
  ): void {
    const secret =
      decryptTotpSecret(
        {
          encryptedSecret:
            credential
              .encryptedSecret,
          encryptionIv:
            credential
              .encryptionIv,
          authTag:
            credential
              .authTag,
        },
        this.getEncryptionKey(),
      );

    if (
      !verifyTotpCode(
        secret,
        code,
      )
    ) {
      throw new UnauthorizedException(
        'Invalid MFA code',
      );
    }
  }

  private getEncryptionKey():
    Buffer {
    return decodeMfaEncryptionKey(
      this.config
        .getOrThrow<string>(
          'MFA_ENCRYPTION_KEY',
        ),
    );
  }
}
