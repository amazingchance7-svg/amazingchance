import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserStatus } from "@prisma/client";

import { UserTokenService } from "../../src/auth/user-token.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import {
  cleanTestDatabase,
  createTestPrisma,
} from "./database.helper";

describe("UserTokenService integration", () => {
  let prisma: PrismaService;
  let service: UserTokenService;

  beforeAll(async () => {
    prisma = await createTestPrisma();
    service = new UserTokenService(
      prisma,
      new ConfigService({
        EMAIL_VERIFICATION_TTL_SECONDS: 3600,
        PASSWORD_RESET_TTL_SECONDS: 3600,
      }),
    );
  });

  beforeEach(async () => {
    await cleanTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("allows an email-verification token to be consumed exactly once under concurrency", async () => {
    const user = await prisma.user.create({
      data: {
        email: "verification@example.com",
        passwordHash: "test-password-hash",
      },
    });

    const token = await service.createEmailVerificationToken(user.id);

    const results = await Promise.allSettled([
      service.verifyEmail(token),
      service.verifyEmail(token),
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
      BadRequestException,
    );

    const persistedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    expect(persistedUser.status).toBe(UserStatus.ACTIVE);
    expect(persistedUser.emailVerifiedAt).not.toBeNull();
  });

  it("allows a password-reset token to be consumed exactly once", async () => {
    const user = await prisma.user.create({
      data: {
        email: "reset@example.com",
        passwordHash: "old-hash",
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
    });

    const token = await service.createPasswordResetToken(user.id);

    await service.resetPassword(token, "new-hash");

    await expect(
      service.resetPassword(token, "another-hash"),
    ).rejects.toBeInstanceOf(BadRequestException);

    const persistedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });

    expect(persistedUser.passwordHash).toBe("new-hash");
  });
});
