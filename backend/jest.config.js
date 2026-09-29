/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Only collect files named *.test.ts or *.spec.ts
  // This prevents src/config/test.ts from being treated as a test suite.
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],

  // Resolve TypeScript path alias @/ → src/
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Bootstrap minimal env vars before any module is imported
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],

  // Use tsconfig.test.json so @types/jest globals (describe/it/expect) are available
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },

  // Limit parallelism to avoid port conflicts in integration tests
  maxWorkers: '50%',

  // Coverage gate: a flat 90% quality bar enforced repo-wide across all four
  // metrics. Reached via `npm run test:ci` on 2026-09-29 (97.51% statements /
  // 90.27% branches / 93.63% functions / 97.77% lines) after systematically
  // writing real tests file-by-file — see git history for that effort. The
  // earlier per-file allowlist (added incrementally as each file crossed 90%)
  // is retired now that the repo-wide aggregate itself clears the bar.
  //
  // Do not lower these numbers to force a failing suite to pass — if a
  // change legitimately drops coverage, add real tests instead.
  coverageThreshold: {
    global: {
      lines: 90,
      statements: 90,
      functions: 90,
      branches: 90,
    },
  },
}
