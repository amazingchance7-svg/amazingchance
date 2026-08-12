import {
  Injectable,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { Permission } from './permission.type';

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async getUserPermissions(
    userId: string,
  ): Promise<Set<string>> {
    const assignments =
      await this.prisma.userRole
        .findMany({
          where: {
            userId,
          },
          select: {
            role: {
              select: {
                permissions: {
                  select: {
                    permission: {
                      select: {
                        code: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

    return new Set(
      assignments.flatMap(
        (assignment) =>
          assignment
            .role
            .permissions
            .map(
              (entry) =>
                entry
                  .permission
                  .code,
            ),
      ),
    );
  }

  async hasAllPermissions(
    userId: string,
    required:
      readonly Permission[],
  ): Promise<boolean> {
    const granted =
      await this
        .getUserPermissions(
          userId,
        );

    return required.every(
      (permission) =>
        granted.has(
          permission,
        ),
    );
  }

  async hasActiveMfa(
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
}
