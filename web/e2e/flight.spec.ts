import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import type { CountryRecord } from '../src/data/types';
import type { BackendName } from './sdf-check';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const by = (cca3: string) => countries.find((c) => c.cca3 === cca3)!;

async function pixelAt(page: Page, rec: CountryRecord): Promise<number[]> {
  const p = await page.evaluate((b) => window.__globe!.project(b), rec.beacon);
  if (!p) throw new Error(`${rec.cca3} : balise derrière l'horizon`);
  const png = PNG.sync.read(await page.screenshot());
  const i = (Math.floor(p[1]) * png.width + Math.floor(p[0])) * 4;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
}

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  const q = backend === 'webgl2' ? '&webgl' : '';
  test.describe(backend, () => {
    test.use({ viewport: { width: 960, height: 600 } });
    // En CI, SwiftShader rend le jeu WebGL 2 à quelques images par seconde, et la vitesse du runner varie : vol 2,1 puis
    // 2,9 min, patch 404 2,9 puis 4,2 min (runs 37049219647 et 37052457653). Délai du test triplé pour ce backend ; les
    // attentes internes n'ont pas de délai propre (0 par défaut) : seul le budget du test borne une recréation lente.
    test.slow(() => backend === 'webgl2' && !!process.env.CI, 'SwiftShader WebGL 2 lent en CI');

    test('vole de pays en pays et allume chacun à l’arrivée', async ({ page }) => {
      await page.goto(`/?demo=FRA,JPN,FJI${q}`);
      await page.waitForFunction(() => window.__demo?.done === true);
      expect(await page.evaluate(() => window.__demo!.arrived)).toEqual(['FRA', 'JPN', 'FJI']);
      expect(await page.evaluate(() => window.__globe!.backend)).toBe(backend);
      const c = await pixelAt(page, by('FJI'));
      console.log(backend, 'Fidji après bonne réponse', JSON.stringify(c));
      expect(c[1]!).toBeGreaterThan(c[0]! + 20); // vert
    });

    test('patch absent (404) : la manche continue et la balise prend le relais', async ({ page }) => {
      await page.route('**/data/patches/sdf/fra.png', (r) => r.fulfill({ status: 404 }));
      await page.goto(`/?demo=FRA${q}`);
      await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true);
      await page.waitForTimeout(300);
      const c = await pixelAt(page, by('FRA'));
      console.log(backend, 'balise de secours', JSON.stringify(c));
      expect(c.every((v) => v > 220)).toBe(true); // cœur blanc de la balise
    });

    test('perte du GPU : le renderer est recréé et la partie continue (même cadrage, même état)', async ({ page }) => {
      await page.goto(`/?demo=FRA${q}`);
      await page.waitForFunction(() => window.__demo?.done === true); // bonne réponse donnée
      const before = await page.evaluate((b) => window.__globe!.project(b), by('FRA').beacon);
      await page.evaluate(() => window.__globe!.simulateDeviceLost());
      await page.waitForFunction(() => window.__globe?.generation === 1 && window.__globe.frames > 10);
      const after = await page.evaluate((b) => window.__globe!.project(b), by('FRA').beacon);
      const c = await pixelAt(page, by('FRA'));
      console.log(backend, 'après recréation', JSON.stringify(c), 'projection avant', JSON.stringify(before), 'après', JSON.stringify(after));
      expect(Math.hypot(after![0] - before![0], after![1] - before![1])).toBeLessThan(1);
      expect(c[1]!).toBeGreaterThan(c[0]! + 20); // toujours vert : la révélation a survécu
    });
  });
}
