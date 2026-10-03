import { expect, test } from '@playwright/test';

// Petit viewport, densité 1 : en headless, SwiftShader rend le jeu post-traité à ≈ 1 image/s en densité 2 (03/10) ;
// la descente pas à pas est couverte par dynamicResolution.test.ts, ici on vérifie le branchement.
test.use({ viewport: { width: 480, height: 300 }, deviceScaleFactor: 1 });
test.slow(() => !!process.env.CI, 'SwiftShader : ≈ 1 image/s, il faut plusieurs fenêtres de 30 frames');

const ready = async (page: import('@playwright/test').Page, query: string) => {
  await page.goto(`/${query}`);
  await expect(page.getByRole('button', { name: 'Pays suivant' })).toBeEnabled({ timeout: 120_000 });
};

test('standard (WebGL 2) : la densité baisse quand les frames ralentissent, puis remonte', async ({ page }) => {
  await ready(page, '?webgl');
  expect(await page.evaluate(() => window.__globe!.dpr())).toBe(1);
  await page.evaluate(() => { window.__globe!.frameMsOverride = 40; });
  await page.waitForFunction(() => window.__globe!.dpr() === 0.75);
  expect(await page.evaluate(() => document.querySelector('canvas')!.width)).toBe(360);
  await page.evaluate(() => { window.__globe!.frameMsOverride = 8; });
  await page.waitForFunction(() => window.__globe!.dpr() === 1);
});

test('haute (WebGPU) : pas de résolution dynamique', async ({ page }) => {
  await ready(page, '');
  await page.evaluate(() => { window.__globe!.frameMsOverride = 40; });
  const before = await page.evaluate(() => window.__globe!.frames);
  await page.waitForFunction((n) => window.__globe!.frames > n + 35, before); // plus d'une fenêtre de 30 frames
  expect(await page.evaluate(() => window.__globe!.dpr())).toBe(1);
});

test('onglet caché : plus aucune frame ; elles reprennent au retour (spec §6.6)', async ({ page }) => {
  await ready(page, '?webgl');
  const setHidden = (hidden: boolean) => page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true);
  const frozen = await page.evaluate(() => window.__globe!.frames);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__globe!.frames)).toBe(frozen);
  await setHidden(false);
  await page.waitForFunction((n) => window.__globe!.frames > n, frozen);
});
