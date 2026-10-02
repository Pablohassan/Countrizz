import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';

// Spec §5 : « prefers-reduced-motion : fondu + coupe » — la coupe se fond, l'image revient.
test.use({ viewport: { width: 960, height: 600 }, reducedMotion: 'reduce' });

test('mouvement réduit : coupe puis fondu, l’image revient', async ({ page }) => {
  await page.goto('/?demo=FRA&webgl');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 45_000 });
  await page.waitForTimeout(1000);
  const png = PNG.sync.read(await page.screenshot());
  let sum = 0;
  for (let i = 0; i < png.width * png.height; i++) sum += (png.data[i * 4]! + png.data[i * 4 + 1]! + png.data[i * 4 + 2]!) / 3;
  const mean = sum / (png.width * png.height);
  console.log('luminance moyenne', mean.toFixed(2));
  expect(mean).toBeGreaterThan(30);
});
