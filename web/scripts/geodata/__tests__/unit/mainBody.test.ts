import { describe, expect, it } from 'vitest';
import { forD3, polygonsOf, type PolygonCoords } from '../../lib/geometry';
import { mainBody } from '../../lib/mainBody';

const box = (x: number, y: number, w: number, h: number): PolygonCoords =>
  polygonsOf(forD3({ type: 'Polygon', coordinates: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]] }))[0]!;
const opts = { maxDistanceDeg: 25, areaShare: 0.9 };

describe('mainBody', () => {
  it('écarte un territoire lointain (France / Guyane)', () => {
    const metropole = box(-4, 42, 12, 9);
    const guyane = box(-54, 2, 2, 3);
    const r = mainBody([guyane, metropole], opts);
    expect(r.kept).toEqual([metropole]);
    expect(r.excluded).toEqual([guyane]);
  });

  it('garde les îles proches d’un archipel équilibré', () => {
    const r = mainBody([box(0, 0, 1, 1), box(2, 0, 1, 1), box(4, 0, 1, 1)], opts);
    expect(r.kept).toHaveLength(3);
  });

  it('laisse tomber un îlot négligeable une fois 90 % atteints', () => {
    const big = Array.from({ length: 9 }, (_, i) => box(i * 2, 0, 1, 1));
    const islet = box(0, 3, 0.1, 0.1);
    const r = mainBody([...big, islet], opts);
    expect(r.kept).toHaveLength(9);
    expect(r.excluded).toEqual([islet]);
  });

  it('refuse une liste vide', () => {
    expect(() => mainBody([], opts)).toThrow();
  });

  it('ancre : le corps principal suit la capitale, même loin du plus grand polygone (Kiribati)', () => {
    const line = box(-158, 1.5, 0.6, 0.4);    // Kiritimati, la plus grande terre, îles de la Ligne
    const gilbert = box(172.9, 1.3, 0.2, 0.2); // Tarawa, de l'autre côté de l'antiméridien
    expect(mainBody([line, gilbert], opts).kept).toEqual([line]);
    const r = mainBody([line, gilbert], opts, [173.0176, 1.3382]);
    expect(r.kept).toEqual([gilbert]);
    expect(r.excluded).toEqual([line]);
  });

  it('ancre : le polygone de l\'ancre est gardé même s\'il est petit', () => {
    const big = box(0, 0, 2, 2);
    const small = box(3, 0, 0.1, 0.1);
    expect(mainBody([big, small], opts, [3.05, 0.05]).kept).toContain(small);
  });
});
