import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCountries } from './countries';

const real = JSON.parse(readFileSync(new URL('../../public/data/countries.json', import.meta.url), 'utf8')) as unknown[];

describe('countries.json côté jeu', () => {
  it('accepte les 197 pays générés', () => {
    const all = parseCountries(real);
    expect(all).toHaveLength(197);
    expect(all.find((c) => c.cca3 === 'FRA')?.patch.sdf).toBe('patches/sdf/fra.png');
  });
  it('refuse une liste incomplète', () => {
    expect(() => parseCountries(real.slice(1))).toThrow(/197/);
  });
  it('refuse un code en double', () => {
    expect(() => parseCountries([...real.slice(1), real[1]])).toThrow(/double/);
  });
  it('refuse un ancien countries.json à libellés simples (cache du navigateur)', () => {
    const old = real.map((c, i) => (i === 5 ? { ...(c as object), name: 'France', capital: 'Paris' } : c));
    expect(() => parseCountries(old)).toThrow(/libellés bilingues/);
  });
  it('refuse un pays sans position de capitale', () => {
    const broken = real.map((c, i) => (i === 7 ? { ...(c as object), capitalLngLat: undefined } : c));
    expect(() => parseCountries(broken)).toThrow(/capitale/);
  });
  it('refuse un pays sans patch', () => {
    const broken = real.map((c, i) => (i === 3 ? { ...(c as object), patch: undefined } : c));
    expect(() => parseCountries(broken)).toThrow(/patch/);
  });
});
