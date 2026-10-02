import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { buildTopology, neighborLines, overviewBorders } from '../../lib/borders';

const sq = (x: number): Polygon => ({ type: 'Polygon', coordinates: [[[x, 0], [x, 1], [x + 1, 1], [x + 1, 0], [x, 0]]] });
const topo = buildTopology([
  { code: 'AAA', geometry: sq(0) },
  { code: 'BBB', geometry: sq(1) },
  { code: 'CCC', geometry: sq(5) },
]);
// Tolérance 1e-4 : la quantification topojson (1e6 pas sur l'emprise) déplace les sommets intérieurs de quelques 1e-6.
const hasPoint = (lines: number[][][], x: number, y: number) =>
  lines.some((l) => l.some(([px, py]) => Math.abs(px! - x) < 1e-4 && Math.abs(py! - y) < 1e-4));

describe('frontières', () => {
  it('la vue d’ensemble contient le côté partagé A|B une seule fois', () => {
    // mesh raccorde les arcs en lignes continues : on compte le SEGMENT (1,0)–(1,1), dans un sens ou l'autre.
    const near = (p: number[], x: number, y: number) => Math.abs(p[0]! - x) < 1e-4 && Math.abs(p[1]! - y) < 1e-4;
    let count = 0;
    for (const l of overviewBorders(topo, 1)) {
      for (let i = 1; i < l.length; i++) {
        const [p, q] = [l[i - 1]!, l[i]!];
        if ((near(p, 1, 0) && near(q, 1, 1)) || (near(p, 1, 1) && near(q, 1, 0))) count++;
      }
    }
    expect(count).toBe(1);
  });

  it('les lignes voisines de A ne touchent jamais A', () => {
    const lines = neighborLines(topo, 'AAA');
    expect(hasPoint(lines, 0, 0)).toBe(false);   // coin propre à A
    expect(hasPoint(lines, 0, 1)).toBe(false);
    expect(hasPoint(lines, 6, 1)).toBe(true);    // C reste présent
  });

  it('la simplification réduit le nombre de points', () => {
    const fine = buildTopology([{ code: 'ZZZ', geometry: {
      type: 'Polygon',
      coordinates: [[...Array.from({ length: 200 }, (_, i) => [i / 100, Math.sin(i / 10) / 50]), [2, 1], [0, 1], [0, 0]]],
    } }]);
    const count = (ls: number[][][]) => ls.reduce((s, l) => s + l.length, 0);
    expect(count(overviewBorders(fine, 0.12))).toBeLessThan(count(overviewBorders(fine, 1)));
  });

  it('keep est la PART GARDÉE : 12 % des points intérieurs, pas 88 %', () => {
    const fine = buildTopology([{ code: 'ZZZ', geometry: {
      type: 'Polygon',
      coordinates: [[...Array.from({ length: 200 }, (_, i) => [i / 100, Math.sin(i / 10) / 50]), [2, 1], [0, 1], [0, 0]]],
    } }]);
    const count = (ls: number[][][]) => ls.reduce((s, l) => s + l.length, 0);
    expect(count(overviewBorders(fine, 0.12))).toBeLessThan(0.3 * count(overviewBorders(fine, 1)));
  });
});
