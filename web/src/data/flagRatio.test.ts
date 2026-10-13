import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ratios from './flagRatios.json';
import { svgRatio } from './flagRatio';
import type { CountryRecord } from './types';

describe('proportions des drapeaux (D3)', () => {
  it('width/height de la balise <svg> priment ; sinon le viewBox', () => {
    expect(svgRatio('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="550" viewBox="0 0 75 18" preserveAspectRatio="none">')).toBeCloseTo(2.5455, 4);
    expect(svgRatio('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2">')).toBe(1.5);
    expect(svgRatio('<svg version="1.1" width="726" height="885" viewBox="-17.582 -4.664 71.571 87.246">')).toBeCloseTo(0.8203, 4);
    expect(svgRatio('<svg width="100%" height="100%" viewBox="0 0 32 32">')).toBe(1);
    expect(svgRatio('<svg stroke-width="2" viewBox="0 0 2 1">')).toBe(2);
    expect(() => svgRatio('<g/>')).toThrow();
  });

  it('flagRatios.json suit les 197 fichiers de public/data (npm run flags:ratios)', () => {
    const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
    const table = ratios as Record<string, number>;
    expect(Object.keys(table).sort()).toEqual(countries.map((c) => c.cca3).sort());
    for (const c of countries) {
      const r = Math.round(svgRatio(readFileSync(`public/data/${c.flag}`, 'utf8')) * 10_000) / 10_000;
      expect(table[c.cca3], c.cca3).toBe(r);
    }
  });
});
