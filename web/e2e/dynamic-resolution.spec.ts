import { expect, test } from '@playwright/test';

// Petit viewport : en headless, SwiftShader rend le jeu post-traité à ≈ 1 image/s en 960 × 600 (03/10) ; la descente pas à
// pas est couverte par dynamicResolution.test.ts, ici on vérifie le branchement. Densité 2 (240 × 150, autant de pixels que
// 480 × 300 en densité 1) : depuis le 21/10, un écran de densité 1 ne descend plus (plancher 1, plafond 1).
test.use({ viewport: { width: 240, height: 150 }, deviceScaleFactor: 2 });
// Partout, pas seulement en CI : sur le site déployé, descente puis remontée prennent ≈ 58 s pour 60 (mesuré le 09/10).
test.slow(true, 'SwiftShader : ≈ 1 image/s, il faut plusieurs fenêtres de 30 frames');

const ready = async (page: import('@playwright/test').Page, query: string) => {
  await page.goto(`/demo.html${query}`);
  await expect(page.getByRole('button', { name: 'Pays suivant' })).toBeEnabled({ timeout: 120_000 });
};

test('standard (WebGL 2) : la densité baisse quand les frames ralentissent, puis remonte', async ({ page }) => {
  await ready(page, '?webgl');
  expect(await page.evaluate(() => window.__globe!.dpr())).toBe(2);
  await page.evaluate(() => { window.__globe!.frameMsOverride = 40; });
  await page.waitForFunction(() => window.__globe!.dpr() === 1.75);
  expect(await page.evaluate(() => document.querySelector('canvas')!.width)).toBe(420);
  await page.evaluate(() => { window.__globe!.frameMsOverride = 8; });
  await page.waitForFunction(() => window.__globe!.dpr() === 2);
});

test('standard : la densité choisie survit aux re-rendus de la page (changement de manche)', async ({ page }) => {
  // 03/10 (revue finale) : R3F réappliquait la prop dpr de bornes du Canvas à chaque re-rendu, et le régulateur, resté au
  // plancher, ne la corrigeait plus — la densité remontait à son maximum sur un téléphone lent.
  await ready(page, '?webgl');
  await page.evaluate(() => { window.__globe!.frameMsOverride = 40; });
  await page.waitForFunction(() => window.__globe!.dpr() === 1.75);
  await page.getByRole('button', { name: 'Pays suivant' }).click(); // la page, donc le Canvas, se re-rend
  await page.waitForFunction(() => window.__demo!.arrived.length === 1, null, { timeout: 120_000 });
  const n = await page.evaluate(() => window.__globe!.frames);
  await page.waitForFunction((k) => window.__globe!.frames > k + 2, n);
  expect(await page.evaluate(() => window.__globe!.dpr())).toBe(1.75);
});

test('haute (WebGPU) : la résolution dynamique tourne aussi (spec zoom §5), la qualité reste haute au premier pas', async ({ page }) => {
  // jusqu'au 19/10, la qualité haute gardait sa densité ; depuis la spec zoom §5, le régulateur tourne dans les deux
  // niveaux, et c'est au plancher et encore lent qu'il déclenche le repli (fallback.spec.ts)
  await ready(page, '');
  expect(await page.evaluate(() => window.__globe!.quality().tier)).toBe('haute');
  await page.evaluate(() => { window.__globe!.frameMsOverride = 40; });
  await page.waitForFunction(() => window.__globe!.dpr() === 1.75);
  expect(await page.evaluate(() => window.__globe!.quality())).toEqual({ tier: 'haute', degradation: 'aucune', traa: true });
});

test('onglet caché : plus aucune frame ; elles reprennent au retour (spec §6.6)', async ({ page }) => {
  await ready(page, '?webgl');
  const setHidden = (hidden: boolean) => page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  // La boucle tourne avant de masquer ; puis on compte des tours de rAF de la page, pas une durée : l'onglet n'est que
  // simulé caché, le rAF continue, et sans la pause chaque tour rendrait une frame du globe. (03/10 : une attente de
  // 1000 ms tombait dans un creux de rendu de SwiftShader et passait même sans la pause.)
  const n0 = await page.evaluate(() => window.__globe!.frames);
  await page.waitForFunction((n) => window.__globe!.frames > n + 1, n0);
  await setHidden(true);
  const frozen = await page.evaluate(() => window.__globe!.frames);
  await page.evaluate(() => new Promise<void>((done) => { let k = 0; const tick = () => (++k >= 5 ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); }));
  expect(await page.evaluate(() => window.__globe!.frames)).toBe(frozen);
  await setHidden(false);
  await page.waitForFunction((n) => window.__globe!.frames > n, frozen);
});
