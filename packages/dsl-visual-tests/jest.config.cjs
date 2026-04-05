const { createDefaultPreset } = require("ts-jest");

/** @type {import("jest").Config} */
module.exports = {
  testEnvironment: "node",
  transform: {
    ...createDefaultPreset({ tsconfig: "./tsconfig.json" }).transform,
  },
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
  moduleNameMapper: {
    "^@m0saic/platform/(.*)$": "<rootDir>/../platform/src/$1",
    "^@m0saic/dsl-file-formats$": "<rootDir>/../dsl-file-formats/src/index.ts",
    "^@m0saic/dsl$": "<rootDir>/../dsl/src/index.ts",
    "^@m0saic/dsl-stdlib$": "<rootDir>/../dsl-stdlib/src/index.ts",
  },
};
