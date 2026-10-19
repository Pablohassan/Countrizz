import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { FRAMING } from '../src/camera/config';
import { arrivalShare } from '../src/camera/framing';
import { imagePatchName, type ImageryIndex } from '../src/data/imagery';
import type { CountryRecord, LngLat } from '../src/data/types';
import { shoot } from './probe-page';

test.slow(true, 'SwiftShader : vols de 6 s et photos');
const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const imagery = JSON.parse(readFileSync('public/data/imagery.json', 'utf8')) as ImageryIndex;
const by = (cca3: string) => countries.find((c) => c.cca3 === cca3)!;
const quadrants = readFileSync('e2e/fixtures/quadrants.ktx2');

/** Point à `deg` degrés du centre, vers l'est (azimut 90°) ou l'ouest (270°), sur la sphère. */
function destination([lng, lat]: LngLat, deg: number, bearingDeg: number): LngLat {
  const R = Math.PI / 180, d = deg * R, b = bearingDeg * R, p1 = lat * R, l1 = lng * R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [l2 / R, p2 / R];
}

/** Part du petit côté (la largeur, en portrait) qu'occupe la calotte projetée par la caméra de la page. */
async function measuredShare(page: Page, rec: CountryRecord): Promise<number> {
  const [e, w] = await page.evaluate((pts) => pts.map((p) => window.__globe!.project(p)), [destination(rec.cap.center, rec.cap.radiusDeg, 90), destination(rec.cap.center, rec.cap.radiusDeg, 270)]);
  return Math.abs(e![0] - w![0]) / PHONE.width;
}

/** Photos remplacées par la mire des quadrants (les vraies sont hors dépôt, absentes en CI). */
const routeQuadrants = (page: Page) => page.route('**/data/patches/img/*.ktx2', (r) => r.fulfill({ body: quadrants, contentType: 'image/ktx2' }));
async function goAndWait(page: Page, cca3: string, extra = '') {
  await page.goto(`/demo.html?demo=${cca3}${extra}`);
  await page.waitForFunction((c) => window.__demo?.arrived.includes(c) === true, cca3, { timeout: 180_000 });
}
async function arrive(page: Page, cca3: string) {
  await routeQuadrants(page);
  await goAndWait(page, cca3);
}

for (const cca3 of ['VAT', 'MCO', 'FRA', 'RUS']) {
  test(`${cca3} à l’arrivée sur téléphone : entre 10 % et 80 % de la largeur, à la part visée`, async ({ page }) => {
    await arrive(page, cca3);
    const s = await measuredShare(page, by(cca3));
    console.log(cca3, 'part mesurée', s.toFixed(4), 'visée', arrivalShare(by(cca3), { ...PHONE, fovYDeg: 50 }, FRAMING).toFixed(4));
    expect(s).toBeGreaterThanOrEqual(0.09);
    expect(s).toBeLessThanOrEqual(0.81);
    expect(Math.abs(s - arrivalShare(by(cca3), { ...PHONE, fovYDeg: 50 }, FRAMING))).toBeLessThan(0.01);
    expect(await page.evaluate(() => window.__globe!.beacon())).toBe(cca3 === 'MCO');   // spec zoom §2 : Monaco garde la sienne
  });
}

test('le Vatican : tous ses niveaux demandés en 2048, le plus fin entièrement posé à l’arrivée', async ({ page }) => {
  const n = imagery.countries.VAT!.levels.length;
  const requested: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/patches/img/')) requested.push(r.url().split('/').pop()!); });
  await arrive(page, 'VAT');
  expect([...requested].sort()).toEqual(Array.from({ length: n }, (_, i) => imagePatchName('VAT', i, 2048)).sort());
  const s = (await page.evaluate(() => window.__globe!.imageSlots()))!;
  expect(s.coarse === n - 1 || (s.fine === n - 1 && s.fineOpacity === 1), JSON.stringify(s)).toBe(true);
});

test('le niveau le plus fin du Vatican en 404 : la manche continue sur le niveau plus large', async ({ page }) => {
  const n = imagery.countries.VAT!.levels.length;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await routeQuadrants(page);
  // déclarée après la mire : Playwright essaie les routes de la dernière déclarée à la première
  await page.route(`**/data/patches/img/${imagePatchName('VAT', n - 1, 2048)}`, (r) => r.fulfill({ status: 404 }));
  await goAndWait(page, 'VAT');
  expect(await page.evaluate(() => window.__globe!.imageSlots())).toEqual({ coarse: n - 2, fine: null, fineOpacity: 0 });
  expect(errors).toEqual([]);
});

test('en zone libre (bandes du jeu), le Vatican arrive sur son niveau le plus fin (Review Focus 1)', async ({ page }) => {
  const n = imagery.countries.VAT!.levels.length;
  await routeQuadrants(page);
  await goAndWait(page, 'VAT', '&safe=80,300');
  const s = (await page.evaluate(() => window.__globe!.imageSlots()))!;
  expect(s.coarse === n - 1 || (s.fine === n - 1 && s.fineOpacity === 1), JSON.stringify(s)).toBe(true);
});

test.describe('sonde (sans émulation mobile : la page de sonde n’a pas de balise viewport)', () => {
  test.use({ isMobile: false, hasTouch: false });
  test('de près, le relief 4K ne pose plus d’ombre en bloc (Monaco, sans photo : 19/10, un quart de la vue assombri)', async ({ page }) => {
    // le relief se lit sur une texture 4K (≈ 10 km par texel) : à l'arrivée sur Monaco, un texel couvre une bonne part de
    // l'écran, et sa pente exagérée assombrissait la moitié droite du haut de la vue de 26 % (38,0 contre 51,6 de luminance)
    const s = await shoot(page, 'webgpu', 'mode=game&cca3=MCO&tier=haute', PHONE);
    const L = (x: number, y: number) => { const i = (y * s.png.width + x) * 4; return 0.2126 * s.png.data[i]! + 0.7152 * s.png.data[i + 1]! + 0.0722 * s.png.data[i + 2]!; };
    const band = (x0: number, x1: number) => { let t = 0, n = 0; for (let x = x0; x < x1; x++) for (let y = 20; y < 300; y++) { t += L(x, y); n++; } return t / n; };
    const [left, right] = [band(40, 160), band(220, 340)];
    console.log('Monaco, haut de la vue : gauche', left.toFixed(1), 'droite', right.toFixed(1));
    expect(right / left).toBeGreaterThan(0.9);
  });
});
