module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: [
    'dist',
    '.eslintrc.cjs',
    'src/components/ui',
    'tailwind.config.js',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    // SonarQube Clean Code: Complexity & Maintainability
    complexity: ['error', 12],
    'max-depth': ['error', 4],
    'no-duplicate-imports': 'error',

    // Strict Type Safety
    '@typescript-eslint/no-explicit-any': 'error',

    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
}
