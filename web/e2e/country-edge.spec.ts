import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import type { CountryRecord } from '../src/data/types';
import type { BackendName } from './sdf-check';

// Petits pays à l'arrivée : plus de 32 texels du patch par pixel. Une garde (Task 7, sur un diagnostic MSAA invalidé le
// 03/10) y coupait le liseré et rendait un bord en escalier. Au flash de la bonne réponse (t = 0), le liseré est blanc et
// le remplissage vert : le liseré se compte en pixels blancs autour du pays.
const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];

for (const [backend, cca3, w, h] of [['webgpu', 'LUX', 800, 450], ['webgl2', 'SWZ', 360, 640]] as [BackendName, string, number, number][]) {
  test(`${backend} ${cca3} à l'arrivée : le liseré du pays est tracé`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`/probe.html?mode=game&cca3=${cca3}&state=correct&t=0&w=${w}&h=${h}${backend === 'webgl2' ? '&webgl' : ''}`);
    await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 60_000 });
    const shot = PNG.sync.read(await page.screenshot());
    const [c] = await page.evaluate((p) => window.__probe!.project([p]), countries.find((r) => r.cca3 === cca3)!.cap.center);
    let white = 0;
    for (let y = Math.max(0, Math.round(c![1]) - 60); y < Math.min(h, Math.round(c![1]) + 60); y++) {
      for (let x = Math.max(0, Math.round(c![0]) - 60); x < Math.min(w, Math.round(c![0]) + 60); x++) {
        const i = (y * w + x) * 4;
        if (shot.data[i]! > 200 && shot.data[i + 1]! > 200 && shot.data[i + 2]! > 200) white++;
      }
    }
    console.log(backend, cca3, 'pixels du liseré blanc', white);
    // mesuré le 03/10 : LUX 18 avec la garde, 69 sans ; SWZ 146 et 148
    expect(white).toBeGreaterThan(40);
  });
}
