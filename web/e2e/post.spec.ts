import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

// Nuit sur Paris (même pose que earth.spec) : le bloom fait déborder la lumière des villes autour d'elles.
const NIGHT = 'mode=game&at=2.35,48.85&alt=1.4&sun=-177.65,-48.85';

for (const [backend, tier] of [['webgpu', 'haute'], ['webgpu', 'standard'], ['webgl2', 'standard']] as [BackendName, string][]) {
  test(`${backend} ${tier} : le bloom auréole les lumières des villes`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const halo = async (q: string) => {
      const s = await shoot(page, backend, q);
      const [paris] = await page.evaluate(() => window.__probe!.project([[2.35, 48.85]]));
      // couronne de 6 à 14 px autour de Paris : sombre sans bloom
      let sum = 0;
      for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
        const r = Math.hypot(dx, dy);
        if (r >= 6 && r <= 14) { const p = s.px([paris![0] + dx, paris![1] + dy]); sum += p[0] + p[1] + p[2]; }
      }
      return sum;
    };
    const plain = await halo(`${NIGHT}&tier=${tier}`);
    const bloomed = await halo(`${NIGHT}&tier=${tier}&post`);
    console.log(backend, tier, 'couronne sans bloom', plain, 'avec', bloomed);
    expect(errors).toEqual([]);
    expect(bloomed).toBeGreaterThan(plain * 1.15);
  });
}
