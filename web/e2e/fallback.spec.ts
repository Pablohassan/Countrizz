import { expect, test } from '@playwright/test';

test.slow(true, 'SwiftShader : onze fenêtres de 30 images');
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('téléphone en WebGPU : qualité haute, puis repli sous la lenteur, sans arrêter la manche ni remonter après une perte du GPU', async ({ page }) => {
  // l'encart rapporte ses fenêtres d'images à /__mesure (journal de nginx : la mesure d'un vrai téléphone, 23/10)
  const rapport = page.waitForRequest((r) => r.url().includes('/__mesure?'), { timeout: 180_000 });
  await page.goto('/demo.html?demo=FRA&mesure');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.__globe!.quality())).toEqual({ tier: 'haute', degradation: 'aucune', traa: true });
  await expect(page.locator('.mesure')).toContainText('Qualité : haute');
  const q = new URL((await rapport).url()).searchParams;
  expect([q.get('v'), q.get('be'), q.get('tier')]).toEqual(['1', 'webgpu', 'haute']);
  expect(Number(q.get('n'))).toBeGreaterThan(0);
  await expect(page.locator('.mesure')).toContainText('Images : ');
  await page.evaluate(() => { window.__globe!.frameMsOverride = 40; });
  await page.waitForFunction(() => window.__globe!.quality().degradation === 'sans-traa', null, { timeout: 180_000 });
  await page.waitForFunction(() => window.__globe!.quality().degradation === 'standard', null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.__globe!.quality().tier)).toBe('standard');
  await expect(page.locator('.mesure')).toContainText('Replis : sans TRAA à');
  await page.evaluate(() => { window.__globe!.frameMsOverride = undefined; window.__globe!.simulateDeviceLost(); });
  await page.waitForFunction(() => window.__globe?.generation === 1 && window.__globe.frames > 10, null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.__globe!.quality())).toEqual({ tier: 'standard', degradation: 'standard', traa: false });
  expect(await page.evaluate(() => window.__demo!.errors)).toEqual([]);
});
