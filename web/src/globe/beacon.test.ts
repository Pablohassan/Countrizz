import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FRAMING } from '../camera/config';
import type { CountryRecord } from '../data/types';
import { needsBeacon, screenAreaPx } from './beacon';

const landscape = { width: 960, height: 600, fovYDeg: 50 };
const framing = { k: 1, margin: 1.6, floor: 0.0003, overview: { landscape: 1.4, portrait: 2.2 } };
const rec = (areaKm2: number, radiusDeg: number) => ({ areaKm2, cap: { center: [0, 0] as [number, number], radiusDeg } });

describe('balise des micro-États et des archipels', () => {
  it('surface à l’écran au centre de l’image', () => {
    // à 0,1 rayon, la hauteur de l'image couvre 2·tan 25° · 0,1 · 6371,0088 km = 594,2 km sur 600 px
    const kmPerPx = (2 * Math.tan((25 * Math.PI) / 180) * 0.1 * 6371.0088) / 600;
    expect(screenAreaPx(1000, 0.1, landscape)).toBeCloseTo(1000 / kmPerPx ** 2, 9);
  });
  it('Tuvalu (26 km² sur une calotte de 4,1°) a sa balise, la France non', () => {
    expect(needsBeacon(rec(26, 4.1), landscape, framing)).toBe(true);
    expect(needsBeacon(rec(551695, 4.87), landscape, framing)).toBe(false);
  });
  it('un pays cadré au plancher a sa balise', () => {
    expect(needsBeacon(rec(0.49, 0.001), landscape, framing)).toBe(true);
  });
});

describe('balise au cadrage serré (spec zoom §2, listes du 19/10)', () => {
  const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
  const list = (v: { width: number; height: number; fovYDeg: number }) => countries.filter((c) => needsBeacon(c, v, FRAMING)).map((c) => c.cca3).sort();
  it('téléphone 390 × 844 : 19 pays (archipels et quelques petits États), sans le Vatican', () => {
    expect(list({ width: 390, height: 844, fovYDeg: 50 })).toEqual(['ATG', 'BHR', 'COM', 'FSM', 'GRD', 'KIR', 'KNA', 'LIE', 'MCO', 'MDV', 'MHL', 'MLT', 'PLW', 'SGP', 'STP', 'SYC', 'TON', 'TUV', 'VCT']);
  });
  it('bureau 1440 × 900 : 5 archipels', () => {
    expect(list({ width: 1440, height: 900, fovYDeg: 50 })).toEqual(['FSM', 'MDV', 'MHL', 'SYC', 'TUV']);
  });
});
