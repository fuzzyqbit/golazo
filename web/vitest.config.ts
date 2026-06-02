import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'tests/**/*.test.ts',
      'tests/**/*.bench.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.test-cases.ts',
        'tests/fixtures/**',
        'src/app/**',
        'src/components/**',
        'src/fonts.ts',
        '.next/**',
        'dist/**',
        '*.config.ts',
      ],
      thresholds: {
        lines: 80,
      },
    },
  },
});
