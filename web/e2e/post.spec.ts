import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

// Nuit sur Paris (même pose que earth.spec) : le bloom fait déborder la lumière des villes autour d'elles.
const NIGHT = 'mode=game&at=2.35,48.85&alt=1.4&sun=-177.65,-48.85';

// Le renderer du jeu est antialiasé (4 échantillons) : en « haute », une passe sans `samples` en héritait, et la copie de la
// profondeur multi-échantillonnée vers l'historique du TRAA était refusée à chaque image (03/10, revue finale de la 1B).
for (const [backend, tier] of [['webgpu', 'haute'], ['webgpu', 'standard'], ['webgl2', 'standard']] as [BackendName, string][]) {
  test(`${backend} ${tier} : post-traitement sans erreur du GPU (renderer antialiasé, comme le jeu)`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
    await page.setViewportSize({ width: 800, height: 450 });
    await page.goto(`/probe.html?${NIGHT}&tier=${tier}&post&w=800&h=450${backend === 'webgl2' ? '&webgl' : ''}`);
    await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 60_000 });
    expect(await page.evaluate(() => window.__probe!.backend)).toBe(backend);
    expect(errors).toEqual([]);
  });
}

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
