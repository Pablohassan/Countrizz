import { expect, test } from '@playwright/test';

test('la page de calibration charge le globe et cadre un pays de référence', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto('/calibrate.html?webgl');
  await page.getByRole('button', { name: 'FRA' }).click({ timeout: 120_000 });
  await expect(page.getByText(/^France : θ = 4\.866°, altitude = /)).toBeVisible();
  await expect(page.getByText('export const FRAMING: FramingParams = {k: 1, margin: 3, floor: 0.0003')).toBeVisible();
});

test('les réglages passent par l’URL, contexte minimal compris', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto('/calibrate.html?webgl&country=LUX&k=1&margin=3&ctx=3');
  // Luxembourg (θ = 0,381°) cadré comme une calotte de 3° avec m = 3 : cos 3° + sin 3° / tan(25°/3) − 1
  const expected = (Math.cos((3 * Math.PI) / 180) + Math.sin((3 * Math.PI) / 180) / Math.tan((25 / 3) * (Math.PI / 180)) - 1).toFixed(4);
  await expect(page.getByText(`Luxembourg : θ = 0.381°, altitude = ${expected} rayon`)).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('minContextDeg: 3')).toBeVisible();
});
