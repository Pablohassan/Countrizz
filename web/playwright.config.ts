import { defineConfig } from '@playwright/test';

/** WebGPU passe par SwiftShader en headless ; sans ces options, la capture d'un canvas WebGPU sort noire. */
export const CHROME_ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader'];

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: process.env.CI ? 2 : 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5174', launchOptions: { args: CHROME_ARGS } },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174/probe.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
