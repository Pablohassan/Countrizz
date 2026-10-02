import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FOV_Y_DEG, FRAMING } from '../src/camera/config';
import type { CountryRecord } from '../src/data/types';
import { needsBeacon } from '../src/globe/beacon';
import { checkCountry, type BackendName } from './sdf-check';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const VIEWPORT = { width: 960, height: 600 };

// Spec §8 : « chaque pays s'allume là où on l'attend », pour les 197, sur les deux backends.
for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test.describe(backend, () => {
    for (const rec of countries) {
      test(`${rec.cca3} s'allume là où on l'attend`, async ({ page }) => {
        const r = await checkCountry(page, rec, { backend, ...VIEWPORT });
        expect(r.mismatches).toEqual([]);
        // Un archipel d'îlots peut ne couvrir aucun point de la grille : c'est alors la balise qui le montre.
        expect(r.inside > 0 || needsBeacon(rec, { ...VIEWPORT, fovYDeg: FOV_Y_DEG }, FRAMING)).toBe(true);
      });
    }
  });
}
