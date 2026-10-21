import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        // constantes du build (vite.config.ts) : vides pour les tests unitaires (src/pwa/empreintes.ts)
        define: { __COUNTRIZZ_EMPREINTES__: '{}', __COUNTRIZZ_CACHES__: '[]' },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'scripts/geodata/__tests__/unit/**/*.test.ts', 'scripts/textures/__tests__/unit/**/*.test.ts', 'scripts/imagery/__tests__/unit/**/*.test.ts', 'scripts/intro/__tests__/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'data',
          environment: 'node',
          include: ['scripts/geodata/__tests__/data/**/*.test.ts', 'scripts/textures/__tests__/data/**/*.test.ts', 'scripts/imagery/__tests__/data/**/*.test.ts'],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
