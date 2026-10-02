import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

const sum = (c: number[]) => c[0]! + c[1]! + c[2]!;

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  // Soleil du jeu (à 55° du point visé) : un soleil forcé derrière la caméra ferait tomber son reflet sur la mer visée.
  test(`${backend} jour : Sahara sableux, Pacifique bleu`, async ({ page }) => {
    const sahara = await shoot(page, backend, 'mode=game&at=10,23&alt=1.4');
    const [sand] = await sahara.at([[10, 23]]);
    const pacific = await shoot(page, backend, 'mode=game&at=-150,-10&alt=1.4');
    const [sea] = await pacific.at([[-150, -10]]);
    console.log(backend, 'sahara', JSON.stringify(sand), 'pacifique', JSON.stringify(sea));
    expect(sand![0]).toBeGreaterThan(120);
    expect(sand![0]).toBeGreaterThan(sand![2]! + 30);
    expect(sea![2]).toBeGreaterThan(sea![0]! + 20);
  });

  test(`${backend} nuit : les villes s'allument, la mer reste noire`, async ({ page }) => {
    const s = await shoot(page, backend, 'mode=game&at=2.35,48.85&alt=1.4&sun=-177.65,-48.85');
    const [paris, atlantic] = await s.at([[2.35, 48.85], [-30, 45]]);
    console.log(backend, 'paris', JSON.stringify(paris), 'atlantique', JSON.stringify(atlantic));
    expect(sum(paris!)).toBeGreaterThan(150);
    expect(sum(atlantic!)).toBeLessThan(40);
  });

  test(`${backend} halo bleu côté jour, faible côté nuit ; étoiles`, async ({ page }) => {
    const s = await shoot(page, backend, 'mode=game&at=0,0&alt=2&sun=-60,0');
    // disque terrestre : rayon écran = 300 · tan(asin(1/3)) / tan(25°) px autour de (480, 300)
    const r = Math.round((300 * Math.tan(Math.asin(1 / 3))) / Math.tan((25 * Math.PI) / 180));
    const day = s.px([480 - r - 4, 300]), night = s.px([480 + r + 4, 300]);
    let stars = 0;
    for (let y = 0; y < 120; y++) for (let x = 0; x < 160; x++) if (sum(s.px([x, y])) > 60) stars++;
    console.log(backend, 'halo jour', JSON.stringify(day), 'halo nuit', JSON.stringify(night), 'étoiles', stars);
    expect(day[2]).toBeGreaterThan(80);
    expect(sum(night)).toBeLessThan(sum(day) / 3);
    expect(stars).toBeGreaterThan(0);
  });
}
