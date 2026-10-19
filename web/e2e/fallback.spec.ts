import { expect, test } from '@playwright/test';

test.slow(true, 'SwiftShader : onze fenêtres de 30 images');
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('téléphone en WebGPU : qualité haute, puis repli sous la lenteur, sans arrêter la manche ni remonter après une perte du GPU', async ({ page }) => {
  await page.goto('/demo.html?demo=FRA&mesure');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.__globe!.quality())).toEqual({ tier: 'haute', degradation: 'aucune', traa: true });
  await expect(page.locator('.mesure')).toContainText('Qualité : haute');
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
