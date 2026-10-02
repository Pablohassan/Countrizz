import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'scripts/geodata/__tests__/unit/**/*.test.ts', 'scripts/textures/__tests__/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'data',
          environment: 'node',
          include: ['scripts/geodata/__tests__/data/**/*.test.ts', 'scripts/textures/__tests__/data/**/*.test.ts'],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
