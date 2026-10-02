import { describe, expect, it } from 'vitest';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { applyDisputed, type DisputedProps } from '../../lib/disputed';
import { areaKm2, forD3 } from '../../lib/geometry';

const box = (x: number, y: number, w: number, h: number): MultiPolygon =>
  forD3({ type: 'Polygon', coordinates: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]] });
const zone = (name: string, admin: string, g: MultiPolygon): Feature<Polygon | MultiPolygon, DisputedProps> => ({
  type: 'Feature', properties: { BRK_NAME: name, ADM0_A3: admin, NAME: name }, geometry: g,
});

const countries = () => new Map<string, MultiPolygon>([
  ['XXX', box(0, 0, 4, 4)],   // contient la zone disputée [1,2]²
  ['YYY', box(4, 0, 2, 4)],   // voisin
  ['ZZZ', box(20, 20, 1, 1)], // loin de tout
]);
const D = zone('Zone', 'XXX', box(1, 1, 1, 1));

describe('applyDisputed', () => {
  it('rattache une zone à un autre pays : l’un la perd, l’autre la gagne', () => {
    const r = applyDisputed(countries(), [D], { 'Zone|XXX': 'YYY' });
    expect(areaKm2(r.byCountry.get('XXX')!)).toBeCloseTo(areaKm2(box(0, 0, 4, 4)) - areaKm2(box(1, 1, 1, 1)), -1);
    expect(areaKm2(r.byCountry.get('YYY')!)).toBeCloseTo(areaKm2(box(4, 0, 2, 4)) + areaKm2(box(1, 1, 1, 1)), -1);
    expect([...r.touched].sort()).toEqual(['XXX', 'YYY']);
    expect(r.neutral).toHaveLength(0);
  });

  it('neutralise une zone : découpée du pays, ajoutée aux neutres', () => {
    const r = applyDisputed(countries(), [D], { 'Zone|XXX': 'neutral' });
    expect(areaKm2(r.byCountry.get('XXX')!)).toBeCloseTo(areaKm2(box(0, 0, 4, 4)) - areaKm2(box(1, 1, 1, 1)), -1);
    expect(r.neutral.map((n) => n.code)).toEqual(['DSP:Zone|XXX']);
    expect([...r.touched]).toEqual(['XXX']);
  });

  it('laisse intacts les pays non concernés', () => {
    const before = countries();
    const r = applyDisputed(before, [D], { 'Zone|XXX': 'neutral' });
    expect(r.byCountry.get('ZZZ')).toBe(before.get('ZZZ'));
    expect(r.byCountry.get('YYY')).toBe(before.get('YYY'));
  });

  it('refuse une règle vers une zone inconnue ou un pays non jouable', () => {
    expect(() => applyDisputed(countries(), [D], { 'Absente|XXX': 'neutral' })).toThrow(/zone disputée inconnue/);
    expect(() => applyDisputed(countries(), [D], { 'Zone|XXX': 'QQQ' })).toThrow(/non jouable/);
  });
});
