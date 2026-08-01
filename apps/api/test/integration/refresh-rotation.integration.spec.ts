import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { UserStatus } from "@prisma/client";

import { TokenService } from "../../src/auth/token.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import {
  cleanTestDatabase,
  createTestPrisma,
} from "./database.helper";

describe("TokenService refresh rotation integration", () => {
  let prisma: PrismaService;
  let service: TokenService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    service = new TokenService(
      new JwtService(),
      new ConfigService({
        JWT_ACCESS_SECRET:
          "integration-access-secret-at-least-32-bytes",
        JWT_REFRESH_SECRET:
          "integration-refresh-secret-at-least-32-bytes",
        JWT_ACCESS_TTL_SECONDS: 900,
        JWT_REFRESH_TTL_SECONDS: 86400,
      }),
      prisma,
    );
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows only one concurrent rotation of the same refresh token", async () => {
    const user = await prisma.user.create({
      data: {
        email: "refresh@example.com",
        passwordHash: "test-password-hash",
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const pair = await service.createTokenPair({
      id: user.id,
      email: user.email,
    });

    const results = await Promise.allSettled([
      service.rotate({ refreshToken: pair.refreshToken }),
      service.rotate({ refreshToken: pair.refreshToken }),
    ]);

    const fulfilled = results.filter(
      (result) => result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result) => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      UnauthorizedException,
    );

    const tokens = await prisma.refreshToken.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });

    expect(tokens).toHaveLength(2);
    expect(tokens.filter((token) => token.revokedAt === null)).toHaveLength(1);
  });
});
