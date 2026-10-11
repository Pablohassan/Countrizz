import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import type { BackendName } from './sdf-check';

/** API du globe (plan 2A-4) sur la page de démo. */
test.use({ viewport: { width: 390, height: 844 } });

const view = (page: Page) => page.evaluate(() => window.__globe!.view());
// SwiftShader rend quelques images par seconde et le pas de la rotation est plafonné à 100 ms (director.ts) : 6 °/s n'y
// avance que de 0,7° en 1,5 s (11/10) ; 30 °/s et un seuil de 0,5°.
const lngGap = (a: [number, number], b: [number, number]) => Math.abs(((b[0] - a[0] + 540) % 360) - 180);

test('mouvement réduit relu à chaud : la rotation s’arrête puis reprend', async ({ page }) => {
  await page.goto('/demo.html?spin=30');
  await page.waitForFunction(() => (window.__demo?.ready ?? 0) > 0 && (window.__globe?.frames ?? 0) > 5, null, { timeout: 120_000 });
  const a = (await view(page))!;
  await page.waitForTimeout(1500);
  expect(lngGap(a, (await view(page))!)).toBeGreaterThan(0.5);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(300);
  const b = (await view(page))!;
  await page.waitForTimeout(1500);
  expect(lngGap(b, (await view(page))!)).toBeLessThan(0.01);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(1500);
  expect(lngGap(b, (await view(page))!)).toBeGreaterThan(0.5);
});

type Rgb = (r: number, g: number, b: number) => boolean;
/** Jaune de la question (#d3cd0f) ; le sable a b > 60. */
const YELLOW: Rgb = (r, g, b) => r > 170 && g > 160 && b < 60;
/** Vert de la bonne réponse (≈ [88, 186, 139] relevé le 11/10) ; la neige a r > 200, la terre g < 120. */
const GREEN: Rgb = (r, g, b) => r < 130 && g > 160 && b > 100 && b < 170;

/** Centre (moyenne) des pixels du remplissage du pays visé ; `null` s'il n'y en a pas. */
function fillCentroid(png: PNG, match: Rgb = YELLOW): [number, number] | null {
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4, r = png.data[i]!, g = png.data[i + 1]!, b = png.data[i + 2]!;
    if (match(r, g, b)) { n++; sx += x; sy += y; }
  }
  return n > 200 ? [sx / n, sy / n] : null;
}

// HUD 80 px, grille 300 px sur 390 × 844 : zone libre de 464 px, milieu à y = 312.
for (const [backend, tier] of [['webgpu', 'haute'], ['webgpu', 'standard'], ['webgl2', 'standard']] as [BackendName, string][]) {
  test(`${backend} ${tier} : la France se centre dans la zone libre (TRAA compris en haute)`, async ({ page }) => {
    await page.goto(`/probe.html?mode=game&cca3=FRA&safe=80,300&tier=${tier}&post&w=390&h=844${backend === 'webgl2' ? '&webgl' : ''}`);
    await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 60_000 });
    const c = fillCentroid(PNG.sync.read(await page.screenshot()));
    console.log(backend, tier, 'centre du jaune', c);
    expect(c).not.toBeNull();
    expect(Math.abs(c![0] - 195)).toBeLessThan(15);
    expect(Math.abs(c![1] - 312)).toBeLessThan(15);
    const [fra] = await page.evaluate(() => window.__probe!.project([[2.35, 46.6]]));
    expect(Math.abs(fra![1] - 312)).toBeLessThan(25);
  });
}

test('jeu : setSafeArea recentre le pays visé dans la zone libre', async ({ page }) => {
  await page.goto('/demo.html?demo=FRA&safe=80,300');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 120_000 });
  // la démo répond « bonne réponse » 700 ms après l'arrivée : sous SwiftShader, la capture voit déjà le vert
  await page.waitForTimeout(800);
  const png = PNG.sync.read(await page.screenshot());
  const c = fillCentroid(png, GREEN) ?? fillCentroid(png, YELLOW);
  console.log('jeu : centre du remplissage', c);
  expect(c).not.toBeNull();
  expect(Math.abs(c![1] - 312)).toBeLessThan(15);
});
