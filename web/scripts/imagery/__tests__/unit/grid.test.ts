import { describe, expect, it } from 'vitest';
import { planRequests, snapGrid } from '../../lib/grid';

describe('grille plate carrée calée sur la grille mondiale', () => {
  it('le pas divise 90° : ±90° et ±180° tombent sur des bords de pixels', () => {
    const g = snapGrid({ west: -10.3, south: 40.2, east: 15.7, north: 52.9 }, 0.031);
    expect(90 / g.step).toBe(Math.round(90 / g.step));
    expect(g.step).toBeLessThanOrEqual(0.031);
    expect(g.west).toBeLessThanOrEqual(-10.3);
    expect(g.east).toBeGreaterThanOrEqual(15.7);
    expect(g.width).toBe(Math.round((g.east - g.west) / g.step));
    expect(g.height).toBe(Math.round((g.north - g.south) / g.step));
  });
  it('borne la latitude à ±90°', () => {
    const g = snapGrid({ west: -180, south: -95, east: 180, north: 95 }, 360 / 8192);
    expect([g.south, g.north, g.width, g.height]).toEqual([-90, 90, 8192, 4096]);
  });
});

describe('requêtes WMS ≤ 4096 px', () => {
  it('le monde en 8192 × 4096 : deux requêtes côte à côte, sans coupe à l’antiméridien', () => {
    const r = planRequests(snapGrid({ west: -180, south: -90, east: 180, north: 90 }, 360 / 8192));
    expect(r.map((q) => [q.bbox, q.width, q.height, q.x, q.y])).toEqual([
      [[-180, -90, 0, 90], 4096, 4096, 0, 0],
      [[0, -90, 180, 90], 4096, 4096, 4096, 0],
    ]);
  });
  it('une petite emprise : une seule requête, la boîte calée', () => {
    const g = snapGrid({ west: 5.7, south: 49.4, east: 6.6, north: 50.2 }, 0.01);
    const [q, ...rest] = planRequests(g);
    expect(rest).toEqual([]);
    expect(q).toEqual({ bbox: [g.west, g.south, g.east, g.north], width: g.width, height: g.height, x: 0, y: 0 });
  });
  it('coupe à l’antiméridien et ramène les longitudes dans [−180, 180]', () => {
    const g = snapGrid({ west: 170, south: -20, east: 190, north: -10 }, 0.5);
    const r = planRequests(g);
    expect(r.map((q) => [q.bbox, q.x, q.width])).toEqual([
      [[170, -20, 180, -10], 0, 20],
      [[-180, -20, -170, -10], 20, 20],
    ]);
  });
  it('coupe aussi à −180° (emprise déroulée vers l’ouest)', () => {
    const r = planRequests(snapGrid({ west: -190, south: 0, east: -170, north: 10 }, 0.5));
    expect(r.map((q) => q.bbox)).toEqual([[170, 0, 180, 10], [-180, 0, -170, 10]]);
  });
  it('découpe en colonnes et en lignes de taille égale au plus près, sans trou ni recouvrement', () => {
    const g = snapGrid({ west: -100, south: -60, east: 100, north: 60 }, 0.02);
    const r = planRequests(g);
    expect(r.every((q) => q.width <= 4096 && q.height <= 4096)).toBe(true);
    const cells = new Set<string>();
    let area = 0;
    for (const q of r) { area += q.width * q.height; cells.add(`${q.x},${q.y}`); }
    expect(area).toBe(g.width * g.height);
    expect(cells.size).toBe(r.length);
  });
});
