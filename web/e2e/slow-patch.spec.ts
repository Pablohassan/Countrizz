import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import type { CountryRecord } from '../src/data/types';

const fra = (JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[]).find((c) => c.cca3 === 'FRA')!;
test.use({ viewport: { width: 960, height: 600 } });

// Review Focus n°2 (partie « lent ») : à l'arrivée, si le patch n'est pas encore là, la balise montre le pays.
test('patch lent : à l’arrivée, la balise montre le pays en attendant le remplissage', async ({ page }) => {
  // Le patch reste en attente tant que la capture n'est pas faite : un délai fixe (8 s) ne suffisait pas en CI, où le vol
  // WebGL 2 dure plus longtemps en temps réel et où le patch était donc déjà là à l'arrivée (run 37049219647).
  let release!: () => void;
  const held = new Promise<void>((ok) => { release = ok; });
  await page.route('**/data/patches/sdf/fra.png', async (r) => { await held; await r.continue(); });
  await page.goto('/?demo=FRA&webgl');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 120_000 });
  await page.waitForTimeout(300);
  const p = await page.evaluate((b) => window.__globe!.project(b), fra.beacon);
  const png = PNG.sync.read(await page.screenshot());
  const i = (Math.floor(p![1]) * png.width + Math.floor(p![0])) * 4;
  const c = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
  console.log('pixel de la balise', JSON.stringify(c));
  release();
  expect(c.every((v) => v > 220)).toBe(true);
});
