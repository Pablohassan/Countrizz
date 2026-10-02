import { describe, expect, it } from 'vitest';
import { byCca3, loadCountries, sample } from './helpers';

const all = loadCountries();

describe('entités fusionnées', () => {
  it('Chypre du Nord s’allume avec Chypre', () => {
    expect(sample(byCca3(all, 'CYP'), [33.5, 35.25]).r).toBeGreaterThan(128);
  });
  it('Hargeisa (Somaliland) s’allume avec la Somalie', () => {
    expect(sample(byCca3(all, 'SOM'), [44.06, 9.56]).r).toBeGreaterThan(128);
  });
});
