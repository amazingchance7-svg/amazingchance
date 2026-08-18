const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const apiRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(apiRoot, "..", "..");
const composeFile = path.join(repositoryRoot, "docker-compose.test.yml");
const runtimeRoleFile = path.join(apiRoot, "prisma", "runtime-role.sql");

const adminDatabaseUrl =
  process.env.TEST_ADMIN_DATABASE_URL ??
  "postgresql://amazing_chance_admin:amazing_chance_admin@127.0.0.1:55432/amazing_chance_test?schema=public";

const runtimeDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://amazing_chance_runtime_test:amazing_chance_runtime_test@127.0.0.1:55432/amazing_chance_test?schema=public";

const paymentDatabaseUrl =
  process.env.TEST_PAYMENT_DATABASE_URL ??
  "postgresql://amazing_chance_payment_test:amazing_chance_payment_test@127.0.0.1:55432/amazing_chance_test?schema=public";

const drawDatabaseUrl =
  process.env.TEST_DRAW_DATABASE_URL ??
  "postgresql://amazing_chance_draw_test:amazing_chance_draw_test@127.0.0.1:55432/amazing_chance_test?schema=public";

const claimDatabaseUrl =
  process.env.TEST_CLAIM_DATABASE_URL ??
  "postgresql://amazing_chance_claim_test:amazing_chance_claim_test@127.0.0.1:55432/amazing_chance_test?schema=public";
const payoutDatabaseUrl =
  process.env.TEST_PAYOUT_DATABASE_URL ??
  "postgresql://amazing_chance_payout_test:amazing_chance_payout_test@127.0.0.1:55432/amazing_chance_test?schema=public";
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    env: {
      ...process.env,
      DATABASE_URL: options.databaseUrl ?? runtimeDatabaseUrl,
      PAYMENT_DATABASE_URL: paymentDatabaseUrl,
      DRAW_DATABASE_URL: drawDatabaseUrl,
      CLAIM_DATABASE_URL: claimDatabaseUrl,
      PAYOUT_DATABASE_URL: payoutDatabaseUrl,
      TEST_DATABASE_URL: runtimeDatabaseUrl,
      TEST_ADMIN_DATABASE_URL: adminDatabaseUrl,
      NODE_ENV: "test",
      ...(options.env ?? {}),
    },
    input: options.input,
    encoding: options.input !== undefined ? "utf8" : undefined,
    shell: false,
    stdio:
      options.input !== undefined
        ? ["pipe", "inherit", "inherit"]
        : "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}`,
    );
  }
}

function runNodeModule(modulePath, args, options = {}) {
  run(process.execPath, [modulePath, ...args], options);
}

function runAdminPsql(sql) {
  run(
    "docker",
    [
      "compose", "-f", composeFile, "-p", "amazingchance-test",
      "exec", "-T", "postgres-test",
      "psql", "-v", "ON_ERROR_STOP=1",
      "-U", "amazing_chance_admin",
      "-d", "amazing_chance_test",
    ],
    {
      databaseUrl: adminDatabaseUrl,
      input: sql,
    },
  );
}

const prismaCliPath = require.resolve("prisma/build/index.js", {
  paths: [apiRoot],
});
const jestCliPath = require.resolve("jest/bin/jest", {
  paths: [apiRoot],
});

let composeStarted = false;

try {
  run("docker", [
    "compose", "-f", composeFile, "-p", "amazingchance-test",
    "up", "-d", "--wait",
  ]);
  composeStarted = true;

  runNodeModule(
    prismaCliPath,
    ["migrate", "deploy"],
    { cwd: apiRoot, databaseUrl: adminDatabaseUrl },
  );

  runAdminPsql(fs.readFileSync(runtimeRoleFile, "utf8"));

  runAdminPsql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'amazing_chance_runtime_test'
      ) THEN
        CREATE ROLE amazing_chance_runtime_test
          LOGIN INHERIT
          NOSUPERUSER NOCREATEDB NOCREATEROLE
          NOREPLICATION NOBYPASSRLS
          PASSWORD 'amazing_chance_runtime_test';
      END IF;
    END;
    $$;

    GRANT amazing_chance_runtime
    TO amazing_chance_runtime_test;
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'amazing_chance_payment_test'
      ) THEN
        CREATE ROLE amazing_chance_payment_test
          LOGIN INHERIT
          NOSUPERUSER NOCREATEDB NOCREATEROLE
          NOREPLICATION NOBYPASSRLS
          PASSWORD 'amazing_chance_payment_test';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'amazing_chance_draw_test'
      ) THEN
        CREATE ROLE amazing_chance_draw_test
          LOGIN INHERIT
          NOSUPERUSER NOCREATEDB NOCREATEROLE
          NOREPLICATION NOBYPASSRLS
          PASSWORD 'amazing_chance_draw_test';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'amazing_chance_payout_test'
      ) THEN
        CREATE ROLE amazing_chance_payout_test
          LOGIN INHERIT
          NOSUPERUSER NOCREATEDB NOCREATEROLE
          NOREPLICATION NOBYPASSRLS
          PASSWORD 'amazing_chance_payout_test';
      END IF;
    END;
    $$;

    GRANT amazing_chance_payment
    TO amazing_chance_payment_test;

    GRANT amazing_chance_draw
    TO amazing_chance_draw_test;

    GRANT amazing_chance_payout
    TO amazing_chance_payout_test;
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'amazing_chance_claim_test'
      ) THEN
        CREATE ROLE amazing_chance_claim_test
          LOGIN INHERIT
          NOSUPERUSER NOCREATEDB NOCREATEROLE
          NOREPLICATION NOBYPASSRLS
          PASSWORD 'amazing_chance_claim_test';
      END IF;
    END;
    $$;

    GRANT amazing_chance_claim
    TO amazing_chance_claim_test;
  `);

  runNodeModule(
    jestCliPath,
    [
      "--config",
      "test/jest.integration.config.cjs",
      "--runInBand",
      ...process.argv.slice(2),
    ],
    { cwd: apiRoot, databaseUrl: runtimeDatabaseUrl },
  );
} finally {
  if (composeStarted) {
    try {
      run("docker", [
        "compose", "-f", composeFile, "-p", "amazingchance-test",
        "down", "-v", "--remove-orphans",
      ]);
    } catch (error) {
      console.error("Failed to stop the integration-test database:", error);
      process.exitCode = 1;
    }
  }
}
