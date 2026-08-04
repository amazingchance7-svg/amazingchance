process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://amazing_chance_test:amazing_chance_test@127.0.0.1:55432/amazing_chance_test?schema=public";
process.env.JWT_ACCESS_SECRET =
  "integration-access-secret-at-least-32-bytes";
process.env.JWT_REFRESH_SECRET =
  "integration-refresh-secret-at-least-32-bytes";
process.env.JWT_ACCESS_TTL_SECONDS = "900";
process.env.JWT_REFRESH_TTL_SECONDS = "86400";
process.env.EMAIL_VERIFICATION_TTL_SECONDS = "3600";
process.env.PASSWORD_RESET_TTL_SECONDS = "3600";
process.env.SNAPSHOT_OWNER_SECRET =
  "integration-snapshot-owner-secret-at-least-32-bytes";
