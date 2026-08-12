import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { SystemRoles } from '../authorization/authorization.constants';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateUserFromRegistrationInput {
  email: string;
  passwordHash: string;
}

const publicUserSelect = {
  id: true,
  email: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma:
      PrismaService,
  ) {}

  async createFromRegistration(
    input:
      CreateUserFromRegistrationInput,
  ) {
    try {
      return await this.prisma
        .$transaction(
          async (tx) => {
            const customerRole =
              await tx.role
                .findUnique({
                  where: {
                    code:
                      SystemRoles.CUSTOMER,
                  },
                  select: {
                    id: true,
                  },
                });

            if (!customerRole) {
              throw new InternalServerErrorException(
                'Default customer role is not configured',
              );
            }

            const user =
              await tx.user.create({
                data: {
                  email:
                    input.email
                      .trim()
                      .toLowerCase(),
                  passwordHash:
                    input.passwordHash,
                },
                select:
                  publicUserSelect,
              });

            await tx.userRole.create({
              data: {
                userId: user.id,
                roleId:
                  customerRole.id,
              },
            });

            return user;
          },
        );
    } catch (error: unknown) {
      if (
        error instanceof
          Prisma
            .PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'User with this email already exists',
        );
      }

      throw error;
    }
  }

  async findOne(id: string) {
    const user =
      await this.prisma.user
        .findUnique({
          where: {
            id,
          },
          select:
            publicUserSelect,
        });

    if (!user) {
      throw new NotFoundException(
        'User not found',
      );
    }

    return user;
  }

  async findByEmailForAuth(
    email: string,
  ) {
    return this.prisma.user
      .findUnique({
        where: {
          email:
            email
              .trim()
              .toLowerCase(),
        },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          status: true,
          emailVerifiedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
  }

  async isPrivilegedAccount(
    userId: string,
  ): Promise<boolean> {
    const assignment =
      await this.prisma.userRole
        .findFirst({
          where: {
            userId,
            role: {
              code: {
                not:
                  SystemRoles.CUSTOMER,
              },
            },
          },
          select: {
            userId: true,
          },
        });

    return Boolean(assignment);
  }
}
