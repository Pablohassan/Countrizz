import { defineConfig } from '@playwright/test';
import { CHROME_ARGS } from './playwright.config';

/** Budget du premier chargement (spec §6.6, §10.5) : build de production servi par `vite preview`. */
export default defineConfig({
  testDir: 'e2e-budget',
  timeout: process.env.CI ? 360_000 : 120_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5175', launchOptions: { args: CHROME_ARGS } },
  webServer: { command: 'npm run build && npx vite preview --port 5175 --strictPort', url: 'http://localhost:5175/', reuseExistingServer: false, timeout: 300_000 },
});
