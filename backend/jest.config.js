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
}
