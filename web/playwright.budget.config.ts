import { defineConfig } from '@playwright/test';
import { CHROME_ARGS } from './playwright.config';

/**
 * Budget du premier chargement (spec §6.6, §10.5), mesuré sur le site déployé par défaut (09/10/2026) ;
 * `npm run budget:local` (BUDGET_BASE_URL=http://localhost:5175) : build de production servi par `vite preview`.
 */
const target = process.env.BUDGET_BASE_URL ?? 'https://countrizz.fr';
export default defineConfig({
  testDir: 'e2e-budget',
  timeout: process.env.CI ? 360_000 : 120_000,
  reporter: [['list']],
  use: { baseURL: target, launchOptions: { args: CHROME_ARGS } },
  ...(target.includes('localhost')
    ? { webServer: { command: 'npm run build && npx vite preview --port 5175 --strictPort', url: 'http://localhost:5175/', reuseExistingServer: false, timeout: 300_000 } }
    : {}),
});
