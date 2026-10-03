import { expect, test } from '@playwright/test';
import type { BackendName } from './sdf-check';

/**
 * Non-régression visuelle (spec §8) : six plans de référence rendus par la sonde (déterministes : pas d'horloge, nuages
 * sans dérive, TRAA convergé sur 16 images), WebGPU et WebGL 2, téléphone et bureau. Références macOS (`-darwin`) : la
 * suite complète tourne sur le Mac, CI de référence (03/10) ; les runners Linux de GitHub ne suivent plus le rendu.
 * Tolérance de 20 pixels : le rendu est déterministe sur une plateforme, et un trait d'un pixel sur 100 (liseré tracé le
 * long du bord du cadre du patch, 03/10) doit se voir.
 */
const PLANS = {
  accueil: 'mode=game&at=10,20&alt=1.4&clouds=1',
  nuit: 'mode=game&at=10,45&alt=1.4&sun=-170,-45',
  question: 'mode=game&cca3=FRA',
  'bonne-reponse': 'mode=game&cca3=JPN&state=correct&t=1',
  'micro-etat': 'mode=game&cca3=VAT&beacon=12.4533,41.9029',
  'lever-de-soleil': 'mode=game&at=0,0&alt=4&sun=180,16.86',
} as const;
const SCREENS = { bureau: { width: 800, height: 450 }, telephone: { width: 360, height: 640 } } as const;

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  for (const [screen, size] of Object.entries(SCREENS)) {
    // Niveau de qualité réel : « haute » seulement pour WebGPU sur bureau (spec §4.1).
    const tier = backend === 'webgpu' && screen === 'bureau' ? 'haute' : 'standard';
    test.describe(`${backend} ${screen}`, () => {
      test.use({ viewport: size });
      for (const [plan, query] of Object.entries(PLANS)) {
        test(plan, async ({ page }) => {
          await page.goto(`/probe.html?${query}&post&tier=${tier}&w=${size.width}&h=${size.height}${backend === 'webgl2' ? '&webgl' : ''}`);
          await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 60_000 });
          expect(await page.evaluate(() => window.__probe!.backend)).toBe(backend);
          await expect(page).toHaveScreenshot(`${plan}-${backend}-${screen}.png`, { maxDiffPixels: 20, threshold: 0.1 });
        });
      }
    });
  }
}
