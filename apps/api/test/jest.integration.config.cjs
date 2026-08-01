/** @type {import("jest").Config} */
module.exports = {
  displayName: "integration",
  rootDir: "..",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/integration/**/*.spec.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.spec.json",
        diagnostics: true
      }
    ]
  },
  testTimeout: 30000,
  clearMocks: true,
  restoreMocks: true,
  maxWorkers: 1
};
