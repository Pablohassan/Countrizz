import { defineConfig } from '@playwright/test';

/**
 * WebGPU passe par SwiftShader en headless ; sans ces options, la capture d'un canvas WebGPU sort noire (macOS). Sous Linux
 * (CI), il faut en plus `--use-vulkan=swiftshader` : sans elle, la capture sort noire (rendu unique) ou blanche (rendu
 * en boucle) — constaté le 02/10 dans l'image mcr.microsoft.com/playwright:v1.63.0-noble ; sans effet sur macOS.
 */
export const CHROME_ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-vulkan=swiftshader'];

export default defineConfig({
  testDir: 'e2e',
  // En CI, SwiftShader rend le jeu complet (GlobeView) bien plus lentement : un vol WebGL 2 y prend ≈ 1 min (02/10).
  timeout: process.env.CI ? 180_000 : 60_000,
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
