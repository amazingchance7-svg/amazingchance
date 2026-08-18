import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

abstract class ManagedPrismaClient
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  protected constructor(
    databaseUrlEnvironmentVariable: string,
  ) {
    const connectionString =
      process.env[
        databaseUrlEnvironmentVariable
      ];

    if (!connectionString) {
      throw new Error(
        `${databaseUrlEnvironmentVariable} environment variable is not defined`,
      );
    }

    const adapter = new PrismaPg({
      connectionString,
    });

    super({
      adapter,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

@Injectable()
export class PrismaService
  extends ManagedPrismaClient
{
  constructor() {
    super('DATABASE_URL');
  }
}

@Injectable()
export class PaymentPrismaService
  extends ManagedPrismaClient
{
  constructor() {
    super('PAYMENT_DATABASE_URL');
  }
}

@Injectable()
export class DrawPrismaService
  extends ManagedPrismaClient
{
  constructor() {
    super('DRAW_DATABASE_URL');
  }
}

@Injectable()
export class ClaimPrismaService
  extends ManagedPrismaClient
{
  constructor() {
    super('CLAIM_DATABASE_URL');
  }
}

@Injectable()
export class PayoutPrismaService
  extends ManagedPrismaClient
{
  constructor() {
    super('PAYOUT_DATABASE_URL');
  }
}