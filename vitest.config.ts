import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts', 'remotion/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.test-cases.ts',
        'tests/fixtures/**',
        'tests/snapshots/**',
        'remotion/**',
        'dist/**',
        '*.config.ts',
        '*.config.js',
        'eslint.config.js',
        'src/**/types.ts',
      ],
      thresholds: {
        lines: 80,
      },
    },
  },
});
