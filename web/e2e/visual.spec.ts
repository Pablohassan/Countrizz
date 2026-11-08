import { expect, test } from '@playwright/test';
import type { BackendName } from './sdf-check';

/**
 * Non-régression visuelle (spec §8) : sept plans de référence rendus par la sonde (déterministes : pas d'horloge, 16 images),
 * WebGPU et WebGL 2, téléphone et bureau. Régénérées le 06/11 (nuages et TRAA retirés, atmosphère et bloom au quart). Références macOS (`-darwin`) : la
 * suite complète tourne sur le Mac, CI de référence (03/10) ; les runners Linux de GitHub ne suivent plus le rendu.
 * Tolérance de 20 pixels : le rendu est déterministe sur une plateforme, et un trait d'un pixel sur 100 (liseré tracé le
 * long du bord du cadre du patch, 03/10) doit se voir.
 */
const PLANS = {
  accueil: 'mode=game&at=10,20&alt=1.4',
  nuit: 'mode=game&at=10,45&alt=1.4&sun=-170,-45',
  question: 'mode=game&cca3=FRA',
  'bonne-reponse': 'mode=game&cca3=JPN&state=correct&t=1',
  // Tuvalu et sa balise (08/11) : depuis le plancher à 30 %, le Vatican arrive sous la hauteur de l'épingle et n'a plus de balise
  'micro-etat': 'mode=game&cca3=TUV&beacon=178.6744,-7.4726',
  'lever-de-soleil': 'mode=game&at=0,0&alt=4&sun=180,16.86',
  // avion A2 de l'accueil figé entre Paris et Athènes (plan 2A-6) : papier toon, contours, perles, ombre portée
  'accueil-avion': 'mode=game&home&avion=0.0814',
} as const;
const SCREENS = { bureau: { width: 800, height: 450 }, telephone: { width: 360, height: 640 } } as const;

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  for (const [screen, size] of Object.entries(SCREENS)) {
    // Niveau de qualité réel : « haute » pour tout WebGPU, téléphone compris (spec zoom §5, 15/10).
    const tier = backend === 'webgpu' ? 'haute' : 'standard';
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
