import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MledozeCountry } from '../../lib/playable';
import { readJson } from '../../lib/io';
import { CACHE_DIR, OUT_DIR, OVERRIDES_PATH } from '../../paths';
import { AREA_RATIO } from '../../config';
import { beaconReadable, loadCountries, sample } from './helpers';

const all = loadCountries();

describe('countries.json', () => {
  it('197 pays, identifiants 1..197, cca3 uniques', () => {
    expect(all).toHaveLength(197);
    expect(all.map((c) => c.id)).toEqual(Array.from({ length: 197 }, (_, i) => i + 1));
    expect(new Set(all.map((c) => c.cca3)).size).toBe(197);
  });

  it('contient Vatican, Palestine, Kosovo, Taïwan ; pas le Groenland ni Porto Rico', () => {
    const codes = all.map((c) => c.cca3);
    for (const k of ['VAT', 'PSE', 'UNK', 'TWN']) expect(codes).toContain(k);
    for (const k of ['GRL', 'PRI']) expect(codes).not.toContain(k);
  });

  it('nom et capitale non vides (FR), capitale de jeu dans la liste', () => {
    for (const c of all) {
      expect(c.name.fr.trim(), c.cca3).not.toBe('');
      expect(c.capitals.fr, c.cca3).toContain(c.capital.fr);
    }
  });

  it('drapeau et patch présents pour chacun', () => {
    for (const c of all) {
      expect(existsSync(path.join(OUT_DIR, c.flag)), c.flag).toBe(true);
      expect(readFileSync(path.join(OUT_DIR, c.flag), 'utf8').slice(0, 200), c.flag).toMatch(/<svg|<\?xml/);
      expect(existsSync(path.join(OUT_DIR, c.patch.sdf)), c.patch.sdf).toBe(true);
    }
  });

  it('la balise tombe dans le pays selon son propre patch (pays lisibles au texel)', () => {
    const readable = all.filter(beaconReadable);
    // Garde-fou contre un test vide : la très grande majorité des pays est lisible au texel.
    expect(readable.length).toBeGreaterThan(170);
    for (const c of readable) expect(sample(c, c.beacon).r, c.cca3).toBeGreaterThan(128);
  });

  it('les pays sous-texel sont des atolls ou des micro-territoires (balise à moins de 2 km du bord)', () => {
    for (const c of all.filter((x) => !beaconReadable(x))) expect(c.beaconClearanceKm, c.cca3).toBeLessThan(2);
  });

  it('surface entre ×0,5 et ×2 de la référence, sauf exception motivée', () => {
    const mz = new Map(readJson<MledozeCountry[]>(path.join(CACHE_DIR, 'mledoze-countries.json')).map((m) => [m.cca3, m]));
    const whitelist = readJson<{ areaWhitelist: Record<string, string> }>(OVERRIDES_PATH).areaWhitelist;
    for (const c of all) {
      const r = c.areaKm2 / mz.get(c.cca3)!.area;
      if (whitelist[c.cca3]) { expect(whitelist[c.cca3]!.trim().length, c.cca3).toBeGreaterThan(10); continue; }
      expect(r, c.cca3).toBeGreaterThanOrEqual(AREA_RATIO.min);
      expect(r, c.cca3).toBeLessThanOrEqual(AREA_RATIO.max);
    }
  });

  it('voisins : uniquement des pays jouables', () => {
    const codes = new Set(all.map((c) => c.cca3));
    for (const c of all) for (const n of c.neighbors) expect(codes.has(n), `${c.cca3} → ${n}`).toBe(true);
  });
});
