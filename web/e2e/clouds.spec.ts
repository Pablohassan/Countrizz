import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

const meanLuma = (s: Awaited<ReturnType<typeof shoot>>) => {
  let sum = 0, n = 0;
  for (let y = 150; y < 450; y += 2) for (let x = 330; x < 630; x += 2) { const p = s.px([x, y]); sum += (p[0] + p[1] + p[2]) / 3; n++; }
  return sum / n;
};

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test(`${backend} nuages : une couche blanche, éclairée, sur la Terre`, async ({ page }) => {
    const clear = meanLuma(await shoot(page, backend, 'mode=game&at=-20,5&alt=1.4'));
    const cloudy = meanLuma(await shoot(page, backend, 'mode=game&at=-20,5&alt=1.4&clouds=1'));
    console.log(backend, 'luminance sans nuages', clear.toFixed(1), 'avec', cloudy.toFixed(1));
    expect(cloudy).toBeGreaterThan(clear + 8);
  });
}

// Gros plan (texel de nuages agrandi ≈ 6 fois : la fin de la descente vers un petit pays) : les blocs de la compression
// ETC1S se voyaient en carrés nets pendant la dernière seconde du vol (03/10, revue finale). Ils s'effacent avant.
for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test(`${backend} nuages : effacés quand un texel couvre plusieurs pixels (gros plan)`, async ({ page }) => {
    const clear = meanLuma(await shoot(page, backend, 'mode=game&at=-20,5&alt=0.15'));
    const cloudy = meanLuma(await shoot(page, backend, 'mode=game&at=-20,5&alt=0.15&clouds=1'));
    console.log(backend, 'gros plan : luminance sans nuages', clear.toFixed(1), 'avec', cloudy.toFixed(1));
    expect(Math.abs(cloudy - clear)).toBeLessThan(1);
  });
}

test.describe('en jeu', () => {
  test.use({ viewport: { width: 960, height: 600 } });
  test('les nuages s’effacent à l’arrivée sur le pays (spec §4.2)', async ({ page }) => {
    await page.goto('/?demo=FRA&webgl');
    await page.waitForFunction(() => (window.__globe?.frames ?? 0) > 0);
    expect(await page.evaluate(() => window.__globe!.cloudOpacity)).toBeGreaterThan(0.99); // pendant le vol
    await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true);
    await page.waitForFunction(() => window.__globe!.cloudOpacity === 0);
  });
});
