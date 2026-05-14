// @ts-check
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

/**
 * Flat ESLint config for golazo.
 *
 * ESLint 10 dropped support for `.eslintrc.*` files; this is the
 * forward-compatible equivalent of the configuration the plan originally
 * specified (`eslint:recommended` + `plugin:@typescript-eslint/recommended`,
 * unused-vars allowed when prefixed with `_`).
 *
 * Note: typed-linting (`parserOptions.project`) is deliberately NOT set
 * because the `recommended` rule set does not require type information,
 * and including tests in a build-only tsconfig would force a second
 * tsconfig file just to satisfy the linter. Phase 4 may revisit this when
 * QA-01..03 raise the coverage and lint bar.
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.cjs', '*.config.js'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
      },
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
];
