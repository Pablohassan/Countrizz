import { describe, expect, it } from 'vitest';
import { byCca3, loadCountries, sample, texelKm } from './helpers';

const all = loadCountries();
const widthPx = (outer: string, enclave: string) =>
  Math.sqrt(byCca3(all, enclave).areaKm2) / texelKm(byCca3(all, outer));

describe('enclaves', () => {
  it.each([['VAT'], ['SMR'], ['MCO'], ['LSO']] as const)('%s : sa balise est dedans selon son propre patch', (e) => {
    const c = byCca3(all, e);
    expect(sample(c, c.beacon).r).toBeGreaterThan(128);
  });

  it.each([['ITA', 'VAT'], ['ITA', 'SMR'], ['FRA', 'MCO'], ['ZAF', 'LSO']] as const)(
    '%s exclut %s dès qu’elle fait au moins 3 texels', (outer, enclave) => {
      if (widthPx(outer, enclave) < 3) return;
      expect(sample(byCca3(all, outer), byCca3(all, enclave).beacon).r).toBeLessThan(128);
    },
  );

  it('Saint-Marin et le Lesotho sont assez grands pour être exigés', () => {
    expect(widthPx('ITA', 'SMR')).toBeGreaterThanOrEqual(3);
    expect(widthPx('ZAF', 'LSO')).toBeGreaterThanOrEqual(3);
  });
});
