import { describe, expect, it } from 'vitest';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { joinNaturalEarth, neCode, type NeProps } from '../../lib/join';

const sq = (x: number, y: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x, y + 1], [x + 1, y + 1], [x + 1, y], [x, y]]],
});
const f = (ISO_A3: string, ISO_A3_EH: string, ADM0_A3: string, x: number): Feature<Polygon, NeProps> => ({
  type: 'Feature', properties: { ISO_A3, ISO_A3_EH, ADM0_A3, NAME: ADM0_A3 }, geometry: sq(x, 0),
});

const ne: FeatureCollection<Polygon, NeProps> = {
  type: 'FeatureCollection',
  features: [
    f('-99', 'FRA', 'FRA', 0),   // France : ISO_A3 à -99
    f('-99', '-99', 'KOS', 2),   // Kosovo
    f('CYP', 'CYP', 'CYP', 4),
    f('-99', '-99', 'CYN', 5),   // Chypre du Nord
    f('GRL', 'GRL', 'GRL', 7),   // territoire neutre
  ],
};
const o = { neCode: { UNK: 'KOS' }, merge: { CYN: 'CYP' } };

describe('neCode', () => {
  it('prend ISO_A3_EH, sinon ADM0_A3', () => {
    expect(neCode(ne.features[0]!.properties)).toBe('FRA');
    expect(neCode(ne.features[1]!.properties)).toBe('KOS');
  });
});

describe('joinNaturalEarth', () => {
  const r = joinNaturalEarth(ne, ['CYP', 'FRA', 'UNK', 'MCO'], o);

  it('rattache le Kosovo par son code NE', () => {
    expect(r.byCountry.has('UNK')).toBe(true);
  });
  it('fusionne Chypre du Nord dans Chypre', () => {
    expect(r.byCountry.get('CYP')!.coordinates).toHaveLength(2);
  });
  it('classe le reste en neutre', () => {
    expect(r.neutral.map((x) => x.properties.ADM0_A3)).toEqual(['GRL']);
  });
  it('signale un pays jouable sans géométrie', () => {
    expect(r.unmatched).toEqual(['MCO']);
  });
  it('n’attribue aucune entité à deux pays', () => {
    const total = [...r.byCountry.values()].reduce((s, g) => s + g.coordinates.length, 0) + r.neutral.length;
    expect(total).toBe(ne.features.length);
  });
});
