import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import {
  ClaimPrismaService,
  DrawPrismaService,
  PaymentPrismaService,
  PayoutPrismaService,
} from '../../src/prisma/prisma.service';

function requireEnvironmentVariable(
  name: string,
): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is required for integration tests`,
    );
  }

  return value;
}

export async function createTestAdminPrisma(): Promise<PrismaClient> {
  const connectionString =
    requireEnvironmentVariable(
      'TEST_ADMIN_DATABASE_URL',
    );

  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
    }),
  });

  await prisma.$connect();

  return prisma;
}

export async function createTestPaymentPrisma(): Promise<PaymentPrismaService> {
  const prisma =
    new PaymentPrismaService();

  await prisma.$connect();

  return prisma;
}

export async function createTestDrawPrisma(): Promise<DrawPrismaService> {
  const prisma =
    new DrawPrismaService();

  await prisma.$connect();

  return prisma;
}

export async function createTestClaimPrisma(): Promise<ClaimPrismaService> {
  const prisma =
    new ClaimPrismaService();

  await prisma.$connect();

  return prisma;
}

export async function createTestPayoutPrisma(): Promise<PayoutPrismaService> {
  const prisma =
    new PayoutPrismaService();

  await prisma.$connect();

  return prisma;
}