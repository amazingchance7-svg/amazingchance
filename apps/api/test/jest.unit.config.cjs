/** @type {import("jest").Config} */
module.exports = {
  displayName: "unit",
  rootDir: "..",
  testEnvironment: "node",
  testMatch: ["<rootDir>/test/unit/**/*.spec.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.spec.json",
        diagnostics: true
      }
    ]
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/main.ts",
    "!src/generated/**"
  ],
  coverageDirectory: "<rootDir>/coverage/unit",
  clearMocks: true,
  restoreMocks: true
};
