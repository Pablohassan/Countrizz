import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { NUIT } from '../src/globe/nuit';

/**
 * Le ciel du globe est la nuit de la vidéo et de l'interface (mise en scène du 24/10) : au fondu de l'intro, rien ne doit
 * changer de couleur sous l'accueil. Médiane d'un carré de ciel en haut à gauche (les étoiles n'y pèsent pas).
 */
test.slow(true, 'SwiftShader');
test.use({ viewport: { width: 390, height: 844 } });

async function ciel(page: Page) {
  await page.waitForFunction(() => (window.__globe?.frames ?? 0) > 5 && window.__globe!.skyReady(), null, { timeout: 180_000 });
  const png = PNG.sync.read(await page.screenshot());
  const k = png.width / page.viewportSize()!.width, px: number[][] = [[], [], []];
  for (let y = Math.round(20 * k); y < Math.round(60 * k); y++) for (let x = Math.round(12 * k); x < Math.round(72 * k); x++) {
    const i = (y * png.width + x) * 4;
    for (let c = 0; c < 3; c++) px[c]!.push(png.data[i + c]!);
  }
  return px.map((v) => v.sort((a, b) => a - b)[v.length >> 1]!);
}

for (const backend of ['webgpu', 'webgl2'] as const) {
  test(`${backend} : le ciel au-dessus du globe est la nuit de la vidéo`, async ({ page }) => {
    await page.route('**/video/videos.json', (r) => r.abort());
    await page.goto(backend === 'webgl2' ? '/?webgl' : '/');
    await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
    await page.waitForFunction(() => !!window.__globe, null, { timeout: 120_000 });
    test.skip(await page.evaluate(() => window.__globe!.backend) !== backend, `${backend} indisponible`);
    const c = await ciel(page);
    console.log(backend, 'ciel', JSON.stringify(c));
    c.forEach((v, i) => expect(Math.abs(v - NUIT[i]!), `canal ${i} : ${v} contre ${NUIT[i]}`).toBeLessThanOrEqual(3));
  });
}
