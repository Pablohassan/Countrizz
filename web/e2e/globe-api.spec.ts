import { expect, test, type Page } from '@playwright/test';

/** API du globe (plan 2A-4) sur la page de démo. */
test.use({ viewport: { width: 390, height: 844 } });

const view = (page: Page) => page.evaluate(() => window.__globe!.view());
// SwiftShader rend quelques images par seconde et le pas de la rotation est plafonné à 100 ms (director.ts) : 6 °/s n'y
// avance que de 0,7° en 1,5 s (11/10) ; 30 °/s et un seuil de 0,5°.
const lngGap = (a: [number, number], b: [number, number]) => Math.abs(((b[0] - a[0] + 540) % 360) - 180);

test('mouvement réduit relu à chaud : la rotation s’arrête puis reprend', async ({ page }) => {
  await page.goto('/demo.html?spin=30');
  await page.waitForFunction(() => (window.__demo?.ready ?? 0) > 0 && (window.__globe?.frames ?? 0) > 5, null, { timeout: 120_000 });
  const a = (await view(page))!;
  await page.waitForTimeout(1500);
  expect(lngGap(a, (await view(page))!)).toBeGreaterThan(0.5);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(300);
  const b = (await view(page))!;
  await page.waitForTimeout(1500);
  expect(lngGap(b, (await view(page))!)).toBeLessThan(0.01);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(1500);
  expect(lngGap(b, (await view(page))!)).toBeGreaterThan(0.5);
});
