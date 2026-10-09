import type { MultiPolygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { capitalPoint, foldName, offshoreKm, type Place } from '../../lib/capitalPoint';
import { forD3 } from '../../lib/geometry';

const place = (name: string, adm0: string, featurecla: string, lng: number, lat: number, extra: Partial<Place['properties']> = {}): Place => ({
  properties: { name, nameascii: name, namealt: null, ls_name: null, featurecla, adm0_a3: adm0, ...extra },
  geometry: { type: 'Point', coordinates: [lng, lat] },
});
const places: Place[] = [
  place('Niamey', 'NER', 'Admin-1 capital', 7.096404, 13.491643),
  place('Niamey', 'NER', 'Admin-0 capital', 2.11471, 13.518652),
  place("Saint George's", 'GRD', 'Admin-0 capital', -61.7417, 12.0526),
  place('Ulaanbaatar', 'MNG', 'Admin-0 capital', 106.9147, 47.9187),
  place('Paris', 'FRA', 'Admin-0 capital', 2.3522, 48.8566),
  place('Paris', 'USA', 'Populated place', -95.5555, 33.6609),
  place('Twin', 'XXX', 'Admin-0 capital', 1, 1),
  place('Twin', 'XXX', 'Admin-0 capital alt', 2, 2),
];

describe('foldName', () => {
  it('replie accents, apostrophes, tirets et casse', () => {
    expect(foldName("Sana'a")).toBe(foldName('Sanaa'));
    expect(foldName('Bogotá')).toBe('bogota');
    expect(foldName('Porto-Novo')).toBe(foldName('porto novo'));
    expect(foldName(null)).toBe('');
  });
});

describe('capitalPoint', () => {
  it('apparie par pays et par nom anglais', () => {
    expect(capitalPoint('FRA', 'FRA', 'Paris', places)).toEqual([2.3522, 48.8566]);
  });
  it('homonymes dans le pays : la capitale nationale (Niamey)', () => {
    expect(capitalPoint('NER', 'NER', 'Niamey', places)).toEqual([2.11471, 13.518652]);
  });
  it('alias vers le nom Natural Earth', () => {
    expect(capitalPoint('MNG', 'MNG', 'Ulan Bator', places, { alias: 'Ulaanbaatar', why: 'translittération' })).toEqual([106.9147, 47.9187]);
    expect(capitalPoint('GRD', 'GRD', "St. George's", places, { alias: "Saint George's", why: 'abréviation' })).toEqual([-61.7417, 12.0526]);
  });
  it('point imposé : rendu tel quel', () => {
    expect(capitalPoint('NRU', 'NRU', 'Yaren', places, { lngLat: [166.925, -0.54556], source: 'Wikipedia' })).toEqual([166.925, -0.54556]);
  });
  it('introuvable : erreur qui nomme la clé à remplir', () => {
    expect(() => capitalPoint('AND', 'AND', 'Andorra la Vella', places)).toThrow(/overrides\.capitalPoints\.AND/);
  });
  it('deux candidats de même rang : erreur au lieu d\'un choix arbitraire', () => {
    expect(() => capitalPoint('XXX', 'XXX', 'Twin', places)).toThrow(/2 lieux/);
  });
});

describe('offshoreKm', () => {
  const square = forD3({ type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] }) as MultiPolygon;
  it('0 pour un point dans le pays', () => {
    expect(offshoreKm(square, [0.5, 0.5])).toBe(0);
  });
  it('distance au contour pour un point en mer (0,1° ≈ 11 km)', () => {
    expect(offshoreKm(square, [1.1, 0])).toBeGreaterThan(10);
    expect(offshoreKm(square, [1.1, 0])).toBeLessThan(12);
  });
});
