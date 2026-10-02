import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { samplePatchPng } from '../scripts/geodata/lib/patch';
import type { CountryRecord, LngLat } from '../src/data/types';

export type BackendName = 'webgpu' | 'webgl2';
export interface SdfCheck {
  /** Points comparés (hors bande d'incertitude autour du bord). */
  tested: number;
  /** Dont points attendus dans le pays. */
  inside: number;
  mismatches: { px: [number, number]; lngLat: LngLat; expected: boolean; red: number }[];
}

/** Bande ignorée autour du bord : 12 niveaux sur 127 ≈ 3 texels pour rangeTexels = 32 (anticrénelage + interpolation). */
const MARGIN_LEVELS = 12;

/**
 * Rend le pays en mode masque sur la page de sonde, puis compare chaque point d'une grille de l'écran (plus la balise)
 * au patch PNG lu côté CPU (samplePatchPng, même projection que le pipeline) : allumé ⇔ R > 128.
 */
export async function checkCountry(page: Page, rec: CountryRecord, o: { backend: BackendName; width: number; height: number; grid?: number }): Promise<SdfCheck> {
  await page.setViewportSize({ width: o.width, height: o.height });
  await page.goto(`/probe.html?cca3=${rec.cca3}&w=${o.width}&h=${o.height}${o.backend === 'webgl2' ? '&webgl' : ''}`);
  await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 30_000 });
  const backend = await page.evaluate(() => window.__probe!.backend);
  if (backend !== o.backend) throw new Error(`${rec.cca3} : backend ${backend} obtenu au lieu de ${o.backend}`);

  const shot = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: o.width, height: o.height } }));
  const png = PNG.sync.read(readFileSync(`public/data/${rec.patch.sdf}`));
  const n = o.grid ?? 32;
  const pixels: [number, number][] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pixels.push([Math.floor(((i + 0.5) / n) * o.width), Math.floor(((j + 0.5) / n) * o.height)]);
  const [beacon] = await page.evaluate((p) => window.__probe!.project(p), [rec.beacon]);
  if (beacon) pixels.push([Math.floor(beacon[0]), Math.floor(beacon[1])]);
  const lngLats = await page.evaluate((p) => window.__probe!.unproject(p), pixels.map(([x, y]) => [x + 0.5, y + 0.5] as [number, number]));

  const result: SdfCheck = { tested: 0, inside: 0, mismatches: [] };
  pixels.forEach((px, k) => {
    const ll = lngLats[k];
    if (!ll) return; // hors du globe
    const s = samplePatchPng(png, rec.patch, ll);
    if (s && Math.abs(s.r - 128) < MARGIN_LEVELS) return;
    const expected = s !== null && s.r > 128;
    const red = shot.data[(px[1] * shot.width + px[0]) * 4]!;
    result.tested++;
    if (expected) result.inside++;
    if ((red > 127) !== expected) result.mismatches.push({ px, lngLat: ll, expected, red });
  });
  return result;
}
