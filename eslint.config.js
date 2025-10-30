const js = require('@eslint/js');
const typescript = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.json',
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
        NodeJS: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      // Temporarily disable type-checking rules due to type resolution issues
      // ...typescript.configs['recommended-requiring-type-checking'].rules,
      // Remove strict rules that conflict with existing technical debt
      // ...typescript.configs.strict.rules,
      '@typescript-eslint/explicit-function-return-type': 'error',
      // Allow 'any' for database instances (better-sqlite3 compatibility)
      '@typescript-eslint/no-explicit-any': ['error', {
        ignoreRestArgs: true,
      }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Allow async methods without await for synchronous database operations
      '@typescript-eslint/require-await': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'eqeqeq': ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  // Specific overrides for known technical debt areas
  {
    files: ['src/storage/adapters/SQLiteStorageAdapter.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['src/storage/migrations.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    files: ['src/utils/performance/performance-monitor.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  // Additional overrides for remaining technical debt
  {
    files: ['src/auth/permissions.ts', 'src/middleware/permission-wrapper.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off', // Allow utility classes
    },
  },
  {
    files: ['src/storage/adapters/SQLiteStorageAdapter.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off', // Allow inference for complex functions
    },
  },
  {
    files: ['src/storage/config.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // Allow any for config values
    },
  },
  {
    files: ['src/tools/filters.ts', 'src/tools/tasks/index.ts', 'src/tools/templates.ts', 'src/utils/filtering/FilteringContext.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off', // Allow async methods without await
    },
  },
  {
    files: ['src/**/*Test*.ts', 'src/**/Testable*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.test.json',
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
        ...globals.jest,
        NodeJS: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      // Temporarily disable type-checking rules for test files as well
      // ...typescript.configs['recommended-requiring-type-checking'].rules,
      // Remove strict rules for test files as well
      // ...typescript.configs.strict.rules,
      '@typescript-eslint/explicit-function-return-type': 'off', // Allow inferred return types in tests
      '@typescript-eslint/no-explicit-any': 'off', // Allow any types in test mocks
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'off', // Allow regular imports in tests
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      'no-console': 'off', // Allow console in tests
      'eqeqeq': ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    files: ['tests/**/*.ts'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        project: './tsconfig.test.json',
      },
      globals: {
        ...globals.node,
        ...globals.es2022,
        ...globals.jest,
        NodeJS: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      ...typescript.configs.recommended.rules,
      // Temporarily disable type-checking rules for test files as well
      // ...typescript.configs['recommended-requiring-type-checking'].rules,
      // Remove strict rules for test files as well
      // ...typescript.configs.strict.rules,
      '@typescript-eslint/explicit-function-return-type': 'off', // Allow inferred return types in tests
      '@typescript-eslint/no-explicit-any': 'off', // Allow any types in test mocks
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'off', // Allow regular imports in tests
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/require-await': 'error',
      'no-console': 'off', // Allow console in tests
      'eqeqeq': ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
];