import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { makeProjector } from '../scripts/geodata/lib/patch';
import type { ImageryIndex } from '../src/data/imagery';
import type { LngLat } from '../src/data/types';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

const fra = (JSON.parse(readFileSync('public/data/imagery.json', 'utf8')) as ImageryIndex).countries.FRA!;
const quadrants = readFileSync('e2e/fixtures/quadrants.ktx2');
// Cadre de 4 × 4 « pixels » : (1,5 ; 1,5) est au cœur du quadrant nord-ouest, etc. (à ±¼ de demi-côté du centre, à l'écran)
const proj = makeProjector({ center: fra.center, extentRad: fra.extentRad, size: 4 });
const [nw, ne, sw, se] = [[1.5, 1.5], [2.5, 1.5], [1.5, 2.5], [2.5, 2.5]].map(([x, y]) => proj.toLngLat(x!, y!) as LngLat);

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test(`${backend} patch image : nord en haut, ouest à gauche (contrat de PatchMeta, sans retournement)`, async ({ page }) => {
    await page.route('**/data/patches/img/fra-*.ktx2', (r) => r.fulfill({ body: quadrants, contentType: 'image/ktx2' }));
    const s = await shoot(page, backend, 'mode=game&cca3=FRA&img=2048');
    const [a, b, c, d] = await s.at([nw!, ne!, sw!, se!]);
    console.log(backend, 'NO', JSON.stringify(a), 'NE', JSON.stringify(b), 'SO', JSON.stringify(c), 'SE', JSON.stringify(d));
    expect(a![0]).toBeGreaterThan(Math.max(a![1], a![2]) + 40); // rouge
    expect(b![1]).toBeGreaterThan(Math.max(b![0], b![2]) + 40); // vert
    expect(c![2]).toBeGreaterThan(Math.max(c![0], c![1]) + 40); // bleu
    expect(Math.min(d![0], d![1])).toBeGreaterThan(d![2] + 40); // jaune
  });

  test(`${backend} patch image absent (404) : la texture globale, sans erreur`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route('**/data/patches/img/**', (r) => r.fulfill({ status: 404 }));
    const withImg = await shoot(page, backend, 'mode=game&cca3=FRA&img=2048');
    const [p] = await withImg.at([nw!]);
    const plain = await shoot(page, backend, 'mode=game&cca3=FRA');
    const [q] = await plain.at([nw!]);
    expect(errors).toEqual([]);
    expect(p).toEqual(q);
  });
}
