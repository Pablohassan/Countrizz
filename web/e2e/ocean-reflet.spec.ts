import { expect, test, type Page } from '@playwright/test';
import { shoot } from './probe-page';

/**
 * Reflet de la mer (spec océan §1.2 bis et ter, 07/11), format du Pixel 9 à la densité 2,5 ; chaque mesure a son leurre
 * (l'ancien rendu, paramètres de la sonde) dans la même passe.
 */
// quatre à huit captures à 1030 × 2288 par test : 53 et 54 s dans la suite complète du 08/11, au ras des 60 s par défaut
test.slow();
const SIZE = { width: 1030, height: 2288 };
const lum = (d: Uint8Array, i: number) => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;

async function webgpu(page: Page) {
  await page.setViewportSize(SIZE);
  await page.goto(`/probe.html?w=${SIZE.width}&h=${SIZE.height}`);
  await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 60_000 });
  return (await page.evaluate(() => window.__probe!.backend)) === 'webgpu';
}

/**
 * Vent relevé : soleil et caméra à la verticale d'un point de mer, le reflet y culmine. Deux points à 28° S espacés de 120°
 * (le vent par latitude y est identique, son ondulation en longitude aussi) : au sud de Madagascar, 10,6 m/s dans le relevé du
 * 30/09/2026 ; au large du Chili, 1,7 m/s. Mer calme, reflet plus concentré. Relevés du 07/11 (GPU du Mac), luminance du
 * pic : 189,3 contre 105,0 (rapport 1,80) ; leurre `vent=bandes` : 130,4 et 130,4 (1,00).
 */
test('webgpu : le reflet du soleil suit le vent relevé (mer calme plus brillante que mer ventée, rapport ≥ 1,4)', async ({ page }) => {
  test.skip(!(await webgpu(page)), 'WebGPU indisponible');
  const peak = async (lng: number, extra = '') => {
    const { png } = await shoot(page, 'webgpu', `mode=game&tier=haute&at=${lng},-28&alt=1.6&sun=${lng},-28&post&ecran=2.625${extra}`, SIZE);
    const [c] = await page.evaluate((p) => window.__probe!.project(p), [[lng, -28]] as [number, number][]);
    let s = 0, n = 0;
    for (let dy = -15; dy <= 15; dy++) for (let dx = -15; dx <= 15; dx++) { s += lum(png.data, ((Math.round(c![1]) + dy) * png.width + Math.round(c![0]) + dx) * 4); n++; }
    return s / n;
  };
  const ratio = (await peak(-80)) / (await peak(40));
  const leurre = (await peak(-80, '&vent=bandes')) / (await peak(40, '&vent=bandes'));
  console.log('pic calme / venté', ratio.toFixed(3), '; leurre (vent par latitude)', leurre.toFixed(3));
  expect(ratio).toBeGreaterThanOrEqual(1.4);
  expect(leurre).toBeLessThan(1.4);
});

/**
 * Ciel reflété : la mer rasante, juste sous le limbe, reflète le ciel calculé par l'atmosphère et non plus un bleu fixe qui y
 * traçait un liseré clair. Bandes de 3 à 10 pixels sous le limbe, colonnes 450 à 750. Relevés du 07/11 (GPU du Mac), bleu
 * moyen, physique contre fixe : crépuscule 62,9 contre 69,7 ; jour 147,3 contre 154,2.
 */
test('webgpu : la mer au limbe reflète le ciel calculé, sans le liseré bleu clair du bleu fixe (bleu ≥ 4 niveaux plus bas)', async ({ page }) => {
  test.skip(!(await webgpu(page)), 'WebGPU indisponible');
  const limbBlue = async (query: string) => {
    const { png } = await shoot(page, 'webgpu', `${query}&mode=game&tier=haute&alt=1.6&post&ecran=2.625`, SIZE);
    const cols = Array.from({ length: 151 }, (_, k) => 450 + 2 * k);
    const limb = await page.evaluate((cs) => cs.map((x) => { for (let y = 20; y < 600; y++) if (window.__probe!.unproject([[x, y]])[0]) return y; return null; }), cols);
    let b = 0, n = 0;
    cols.forEach((x, k) => { const y0 = limb[k]; if (y0 == null) return; for (let y = y0 + 3; y <= y0 + 10; y++) { b += png.data[(y * png.width + x) * 4 + 2]!; n++; } });
    expect(n).toBeGreaterThan(500);
    return b / n;
  };
  for (const [scene, q] of [['crépuscule', 'at=-30,30&sun=-110,5'], ['jour', 'at=10,40']] as const) {
    const physique = await limbBlue(q), fixe = await limbBlue(`${q}&reflet=fixe`);
    console.log(scene, 'bleu au limbe : physique', physique.toFixed(1), '; fixe', fixe.toFixed(1));
    expect(fixe - physique).toBeGreaterThanOrEqual(4);
  }
});
