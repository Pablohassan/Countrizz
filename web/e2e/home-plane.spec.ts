import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { openHome } from './game-helpers';

/**
 * Avion A2 et repères G5 de l'accueil (plan 2A-6 ; spec 2A §3, §4) : l'avion passe Rabat et la bulle « Maroc · Rabat »
 * s'allume ; en mouvement réduit, il est figé entre Paris et Athènes avec trois bulles, dessiné (contour noir, papier
 * crème) à sa position projetée ; le drapeau planté de Paris est visible.
 */
test.use({ locale: 'fr-FR' });

const plane = (page: import('@playwright/test').Page) =>
  page.evaluate(() => { const p = window.__plane; const l = p?.look(); return l ? { e: l.e, bubbles: l.bubbles, screen: p!.screen() } : null; });

test('l’avion passe Rabat : la bulle « Maroc · Rabat » s’allume, sans nom au départ', async ({ page }) => {
  // SwiftShader : accueil long à charger, images lentes (l'horaire avance d'au plus 0,25 s par image)
  test.setTimeout(240_000);
  await openHome(page);
  await page.waitForFunction(() => !!window.__plane?.look(), null, { timeout: 60_000 });
  // départ derrière la Terre : aucune bulle
  expect((await plane(page))!.bubbles).toEqual([false, false, false, false]);
  await page.waitForFunction(() => window.__plane?.look()?.bubbles[0] === true, null, { timeout: 90_000 });
  const bulle = page.locator('.escale.on');
  await expect(bulle.first()).toContainText('Maroc');
  await expect(bulle.first()).toContainText('Rabat');
});

test('mouvement réduit : l’avion figé entre Paris et Athènes, trois bulles, dessiné à sa place', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openHome(page);
  await page.waitForFunction(() => !!window.__plane?.screen(), null, { timeout: 60_000 });
  const s = (await plane(page))!;
  expect(s.bubbles).toEqual([true, true, true, false]);
  await expect(page.locator('.escale.on')).toHaveCount(3);
  await expect(page.locator('.escale.on').nth(2)).toContainText('France');
  const [x, y] = s.screen!;
  const png = PNG.sync.read(await page.screenshot());
  const dpr = png.width / page.viewportSize()!.width;
  let dark = 0, cream = 0;
  for (let j = Math.round((y - 16) * dpr); j <= Math.round((y + 16) * dpr); j++) {
    for (let i = Math.round((x - 16) * dpr); i <= Math.round((x + 16) * dpr); i++) {
      const k = (j * png.width + i) * 4;
      const [r, g, b] = [png.data[k]!, png.data[k + 1]!, png.data[k + 2]!];
      if (r < 40 && g < 40 && b < 40) dark++;
      if (r > 215 && g > 205 && b > 175) cream++;
    }
  }
  console.log('avion figé', JSON.stringify({ x, y, dark, cream }));
  expect(dark).toBeGreaterThan(15);
  expect(cream).toBeGreaterThan(10);
});

test('repères : cinq posés sur le globe, le drapeau planté de Paris visible', async ({ page }) => {
  await openHome(page);
  await expect(page.locator('.reperes .mk')).toHaveCount(5);
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.mk--paris')!).opacity) > 0.5, null, { timeout: 30_000 });
});
