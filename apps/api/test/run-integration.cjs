const { spawnSync } = require("node:child_process");
const path = require("node:path");

const apiRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(apiRoot, "..", "..");
const composeFile = path.join(repositoryRoot, "docker-compose.test.yml");

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://amazing_chance_test:amazing_chance_test@127.0.0.1:55432/amazing_chance_test?schema=public";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repositoryRoot,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      TEST_DATABASE_URL: databaseUrl,
      NODE_ENV: "test",
    },
    shell: false,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${result.status}`,
    );
  }
}

function runNodeModule(modulePath, args, options = {}) {
  run(process.execPath, [modulePath, ...args], options);
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
    "compose",
    "-f",
    composeFile,
    "-p",
    "amazingchance-test",
    "up",
    "-d",
    "--wait",
  ]);
  composeStarted = true;

  runNodeModule(
    prismaCliPath,
    ["migrate", "deploy"],
    { cwd: apiRoot },
  );

  runNodeModule(
    jestCliPath,
    [
      "--config",
      "test/jest.integration.config.cjs",
      "--runInBand",
    ],
    { cwd: apiRoot },
  );
} finally {
  if (composeStarted) {
    try {
      run("docker", [
        "compose",
        "-f",
        composeFile,
        "-p",
        "amazingchance-test",
        "down",
        "-v",
        "--remove-orphans",
      ]);
    } catch (error) {
      console.error("Failed to stop the integration-test database:", error);
      process.exitCode = 1;
    }
  }
}
