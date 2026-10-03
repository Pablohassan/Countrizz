import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { makeProjector } from '../scripts/geodata/lib/patch';
import type { ImageryIndex } from '../src/data/imagery';
import type { LngLat } from '../src/data/types';
import type { BackendName } from './sdf-check';

const fra = (JSON.parse(readFileSync('public/data/imagery.json', 'utf8')) as ImageryIndex).countries.FRA!;
const quadrants = readFileSync('e2e/fixtures/quadrants.ktx2');
const nw = makeProjector({ center: fra.center, extentRad: fra.extentRad, size: 4 }).toLngLat(1.5, 1.5) as LngLat;

for (const [backend, size] of [['webgpu', 2048], ['webgl2', 1024]] as [BackendName, number][]) {
  test.describe(backend, () => {
    test.use({ viewport: { width: 960, height: 600 } });
    test.slow(() => backend === 'webgl2' && !!process.env.CI, 'SwiftShader WebGL 2 lent en CI');

    test(`en jeu : le patch image du niveau (${size} texels) se fond à l’arrivée`, async ({ page }) => {
      const requested: string[] = [];
      await page.route('**/data/patches/img/*.ktx2', (r) => {
        requested.push(r.request().url().split('/').pop()!);
        return r.fulfill({ body: quadrants, contentType: 'image/ktx2' });
      });
      await page.goto(`/?demo=FRA${backend === 'webgl2' ? '&webgl' : ''}`);
      await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true);
      await page.waitForTimeout(800); // fondu de 0,4 s
      expect(requested).toEqual([`fra-${size}.ktx2`]);
      const p = await page.evaluate((b) => window.__globe!.project(b), nw);
      const png = PNG.sync.read(await page.screenshot());
      const i = (Math.floor(p![1]) * png.width + Math.floor(p![0])) * 4;
      const c = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
      console.log(backend, 'quadrant nord-ouest', JSON.stringify(c));
      expect(c[0]!).toBeGreaterThan(Math.max(c[1]!, c[2]!) + 40);
    });
  });
}
