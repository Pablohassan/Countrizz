import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { LngLat } from '../src/data/types';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

// Un sommet de frontière près de la jonction France / Luxembourg / Allemagne.
const lines = JSON.parse(readFileSync('public/data/borders.json', 'utf8')) as LngLat[][];
let vertex: LngLat = [0, 0], best = Infinity;
for (const l of lines) for (const p of l) { const d = (p[0] - 6.4) ** 2 + (p[1] - 49.2) ** 2; if (d < best) { best = d; vertex = p; } }
const sum = (c: number[]) => c[0]! + c[1]! + c[2]!;
const darkest = async (s: Awaited<ReturnType<typeof shoot>>, page: import('@playwright/test').Page) => {
  const [p] = await page.evaluate((v) => window.__probe!.project(v), [vertex]);
  let m = Infinity;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) m = Math.min(m, sum(s.px([p![0] + dx, p![1] + dy])));
  return m;
};

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test(`${backend} frontières : tracées en vue d'ensemble, effacées de près`, async ({ page }) => {
    const farWith = await darkest(await shoot(page, backend, 'mode=game&at=6.4,49.2&alt=1.4&borders'), page);
    const farWithout = await darkest(await shoot(page, backend, 'mode=game&at=6.4,49.2&alt=1.4'), page);
    const nearWith = await darkest(await shoot(page, backend, 'mode=game&at=6.4,49.2&alt=0.02&borders'), page);
    const nearWithout = await darkest(await shoot(page, backend, 'mode=game&at=6.4,49.2&alt=0.02'), page);
    console.log(backend, { farWith, farWithout, nearWith, nearWithout });
    expect(farWith).toBeLessThan(farWithout - 30);
    expect(nearWith).toBe(nearWithout);
  });
}
