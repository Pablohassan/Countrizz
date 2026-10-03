import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

// Caméra en (5, 0, 0), regard vers l'origine, 960 × 600, champ vertical 50° : la Terre couvre asin(1/5) = 11,5° autour du
// centre (limbe haut à y ≈ 169). Soleil à 40 rayons dans la direction (−0,957 ; 0,290 ; 0), soit lng 180°, lat 16,86° :
// vu de la caméra, 15° au-dessus du centre → y = 300 − tan 15° / tan 25° × 300 ≈ 128, juste au-dessus du limbe.
const SUNRISE = 'mode=game&at=0,0&alt=4&sun=180,16.86';
const sum = (p: number[]) => p[0]! + p[1]! + p[2]!;

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test(`${backend} soleil : un disque éclatant au-dessus du limbe, un halo que le bloom élargit`, async ({ page }) => {
    const plain = await shoot(page, backend, SUNRISE);
    const bloomed = await shoot(page, backend, `${SUNRISE}&post`);
    const disc = plain.px([480, 128]), haloPlain = plain.px([480 + 30, 128]), haloBloom = bloomed.px([480 + 30, 128]);
    console.log(backend, 'disque', JSON.stringify(disc), 'halo sans bloom', JSON.stringify(haloPlain), 'avec', JSON.stringify(haloBloom));
    expect(sum(disc)).toBeGreaterThan(700);
    expect(sum(haloBloom)).toBeGreaterThan(sum(haloPlain) + 30);
  });

  test(`${backend} soleil derrière la Terre : caché par elle`, async ({ page }) => {
    const s = await shoot(page, backend, 'mode=game&at=0,0&alt=4&sun=180,0');
    const center = s.px([480, 300]);
    console.log(backend, 'centre (face de nuit)', JSON.stringify(center));
    expect(sum(center)).toBeLessThan(150);
  });
}
