import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FOV_Y_DEG, FRAMING } from '../src/camera/config';
import type { CountryRecord } from '../src/data/types';
import { needsBeacon } from '../src/globe/beacon';
import { checkCountry, type BackendName } from './sdf-check';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const by = (cca3: string) => countries.find((c) => c.cca3 === cca3)!;

// `query` : cadrage forcé par l'URL de la sonde ; sinon, cadrage du jeu (config.ts).
const CASES: { cca3: string; width: number; height: number; query?: string; beacon?: true }[] = [
  { cca3: 'FRA', width: 960, height: 600 },
  { cca3: 'USA', width: 960, height: 600 },
  { cca3: 'RUS', width: 960, height: 600 }, // antiméridien, très grand
  { cca3: 'FJI', width: 960, height: 600 }, // antiméridien
  // Archipel d'atolls (îles Gilbert, calotte ancrée sur Tarawa le 09/10) : plus fins que le pixel au cadrage du jeu,
  // aucun pixel ne doit s'allumer à tort et c'est la balise qui le montre (même règle que countries.spec.ts).
  { cca3: 'KIR', width: 960, height: 600, beacon: true },
  // Plus petit pays, cadre de 0,02° : au cadrage du jeu il est sous le pixel (balise) ; cadrage serré pour éprouver
  // la précision du shader (point exact de la sphère, k par atan2) à cette échelle.
  { cca3: 'VAT', width: 960, height: 600, query: 'k=1&margin=1.6&ctx=0' },
  { cca3: 'FRA', width: 390, height: 844 }, // portrait
  { cca3: 'CHL', width: 390, height: 844 }, // pays en longueur, portrait
];

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  for (const c of CASES) {
    test(`${backend} ${c.cca3} ${c.width}×${c.height}${c.query ? ` (${c.query})` : ''} s'allume là où on l'attend`, async ({ page }) => {
      const r = await checkCountry(page, by(c.cca3), { backend, width: c.width, height: c.height, query: c.query });
      expect(r.mismatches).toEqual([]);
      if (c.beacon) expect(needsBeacon(by(c.cca3), { width: c.width, height: c.height, fovYDeg: FOV_Y_DEG }, FRAMING)).toBe(true);
      else expect(r.inside).toBeGreaterThan(0);
      expect(r.tested).toBeGreaterThan(50);
    });
  }
}
