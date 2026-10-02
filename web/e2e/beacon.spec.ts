import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

const bright = (c: number[]) => c[0]! > 220 && c[1]! > 200;

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test(`${backend} balise : cœur au point, trait vers le haut, rien sans balise`, async ({ page }) => {
    const tuvalu: [number, number] = [179.2, -8.5];
    const s = await shoot(page, backend, `mode=game&at=179.2,-8.5&alt=0.25&beacon=${tuvalu.join(',')}`);
    const [p] = await page.evaluate((v) => window.__probe!.project(v), [tuvalu]);
    const [x, y] = [Math.round(p![0]), Math.round(p![1])];
    const core = s.px([x, y]), above = s.px([x, y - 15]), below = s.px([x, y + 15]);
    const none = (await shoot(page, backend, 'mode=game&at=179.2,-8.5&alt=0.25')).px([x, y]);
    console.log(backend, JSON.stringify({ core, above, below, none }));
    expect(bright(core)).toBe(true);
    expect(above[0]!).toBeGreaterThan(below[0]! + 60);
    expect(bright(none)).toBe(false);
  });
}
