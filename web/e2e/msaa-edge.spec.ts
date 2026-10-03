import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { samplePatchPng } from '../scripts/geodata/lib/patch';
import type { CountryRecord, LngLat } from '../src/data/types';
import type { BackendName } from './sdf-check';

const fra = (JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[]).find((c) => c.cca3 === 'FRA')!;
const sdf = PNG.sync.read(readFileSync(`public/data/${fra.patch.sdf}`));

// Un trait de la couleur du pays traversait l'Irlande, au bord nord du cadre de la France (03/10, jeu 1A compris), vu
// d'abord sous MSAA en WebGL 2. Cause réelle : fwidth et la lecture du patch calculés dans un `if (dans le cadre)`, donc
// indéfinis sur les blocs de 2×2 pixels coupés par le bord du cadre (voir shader-uniformity.spec.ts).
for (const backend of ['webgl2', 'webgpu'] as BackendName[]) {
  test(`${backend} MSAA : aucun pixel de la couleur du pays hors du pays`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(`/probe.html?mode=game&cca3=FRA&post&tier=standard&w=360&h=640${backend === 'webgl2' ? '&webgl' : ''}`);
    await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 60_000 });
    const shot = PNG.sync.read(await page.screenshot());
    const pixels: [number, number][] = [];
    for (let y = 0; y < 640; y += 1) for (let x = 0; x < 360; x += 2) pixels.push([x, y]);
    const ll = await page.evaluate((p) => window.__probe!.unproject(p.map(([x, y]) => [x + 0.5, y + 0.5] as [number, number])), pixels);
    const leaks: [number, number][] = [];
    pixels.forEach(([x, y], k) => {
      const p = ll[k] as LngLat | null;
      if (!p) return;
      const s = samplePatchPng(sdf, fra.patch, p);
      // à plus de 16 texels du bord (le liseré du pays déborde légitimement d'environ 1,5 pixel, soit quelques texels)
      if (!s || s.r > 128 - 64) return;
      const i = (y * shot.width + x) * 4;
      if (shot.data[i]! > 200 && shot.data[i + 1]! > 190 && shot.data[i + 2]! < 80) leaks.push([x, y]);
    });
    console.log(backend, 'pixels jaunes hors de France', leaks.length, JSON.stringify(leaks.slice(0, 5)));
    expect(leaks).toEqual([]);
  });
}
