import { describe, expect, it } from 'vitest';
import type { CapitalOverride } from '../../lib/capitals';
import { readJson } from '../../lib/io';
import { OVERRIDES_PATH } from '../../paths';
import { byCca3, loadCountries } from './helpers';

const all = loadCountries();
const langs = ['fr', 'en'] as const;

describe('libellés bilingues (spec 2A §6)', () => {
  it('nom et capitale complets dans les deux langues', () => {
    for (const c of all) for (const l of langs) {
      expect(c.name[l]?.trim(), `${c.cca3} name.${l}`).toBeTruthy();
      expect(c.capital[l]?.trim(), `${c.cca3} capital.${l}`).toBeTruthy();
    }
  });
  it('aucun nom ni aucune capitale en double dans une langue', () => {
    for (const l of langs) for (const field of ['name', 'capital'] as const) {
      const seen = new Map<string, string>();
      for (const c of all) {
        const v = c[field][l];
        expect(seen.get(v), `${field}.${l} « ${v} » : ${seen.get(v)} et ${c.cca3}`).toBeUndefined();
        seen.set(v, c.cca3);
      }
    }
  });
  it('capitale de jeu dans la liste de chaque langue', () => {
    for (const c of all) for (const l of langs) expect(c.capitals[l], `${c.cca3} capitals.${l}`).toContain(c.capital[l]);
  });
  it('arbitrages de l\'utilisateur du 05/10 appliqués', () => {
    expect(byCca3(all, 'COD').name).toEqual({ fr: 'RD Congo', en: 'DR Congo' });
    expect(byCca3(all, 'CPV').name.fr).toBe('Cap-Vert');
    expect(byCca3(all, 'VAT').name.fr).toBe('Vatican');
    expect(byCca3(all, 'CIV').name.en).toBe('Ivory Coast');
    expect(byCca3(all, 'UKR').capital).toEqual({ fr: 'Kiev', en: 'Kyiv' });
    expect(byCca3(all, 'GNQ').capital).toEqual({ fr: 'Ciudad de la Paz', en: 'Ciudad de la Paz' });
    expect(byCca3(all, 'PSE').capital).toEqual({ fr: 'Jérusalem-Est', en: 'East Jerusalem' });
  });
  it('chaque arbitrage { fr, en } est complet', () => {
    const o = readJson<{ capitals: Record<string, CapitalOverride> }>(OVERRIDES_PATH).capitals;
    expect(Object.keys(o).sort()).toEqual(['BEN', 'BOL', 'GNQ', 'LKA', 'MYS', 'PAK', 'PSE', 'SWZ', 'YEM', 'ZAF']);
    for (const [k, v] of Object.entries(o)) for (const l of langs) expect(v[l]?.trim(), `${k}.${l}`).toBeTruthy();
  });
});
