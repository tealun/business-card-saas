module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.ts$": "ts-jest"
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  },
  setupFiles: ["<rootDir>/jest.setup.cjs"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.spec.ts"],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 75,
      lines: 75,
      statements: 75
    }
  }
};
