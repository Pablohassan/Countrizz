import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUT_DIR } from '../../paths';
import { beaconReadable, byCca3, loadCountries, sample } from './helpers';

describe('Kosovo à travers mledoze, Natural Earth, geoBoundaries et Wikidata', () => {
  const k = byCca3(loadCountries(), 'UNK');
  it('a une capitale, un drapeau et une balise dans son patch', () => {
    expect(k.capital.fr.trim()).not.toBe('');
    expect(existsSync(path.join(OUT_DIR, k.flag))).toBe(true);
    expect(beaconReadable(k)).toBe(true);
    expect(sample(k, k.beacon).r).toBeGreaterThan(128);
  });
});
