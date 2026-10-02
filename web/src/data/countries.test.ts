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
  it('refuse un pays sans patch', () => {
    const broken = real.map((c, i) => (i === 3 ? { ...(c as object), patch: undefined } : c));
    expect(() => parseCountries(broken)).toThrow(/patch/);
  });
});
