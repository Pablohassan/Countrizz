import { describe, expect, it } from 'vitest';
import { geoDistance } from 'd3-geo';
import type { LngLat } from '../../../../src/data/types';
import { boundingCap, capContains } from '../../lib/cap';

const deg = (a: LngLat, b: LngLat) => (geoDistance(a, b) * 180) / Math.PI;

describe('boundingCap', () => {
  it('centre une calotte sur des points symétriques', () => {
    const pts: LngLat[] = [[9, 19], [11, 19], [9, 21], [11, 21]];
    const cap = boundingCap(pts);
    expect(deg(cap.center, [10, 20])).toBeLessThan(0.1);
    expect(cap.radiusDeg).toBeCloseTo(deg([10, 20], [11, 21]), 1);
  });

  it('traverse l’antiméridien sans faire le tour du monde', () => {
    const pts: LngLat[] = [[179, -16], [-179, -16], [179, -18], [-179, -18]];
    const cap = boundingCap(pts);
    expect(Math.abs(cap.center[0])).toBeGreaterThan(178);
    expect(cap.radiusDeg).toBeLessThan(2);
  });

  it('contient toujours tous les points', () => {
    const pts: LngLat[] = [[-73, -55], [-70, -18], [-75, -40], [-68, -22], [-109, -27]];
    const cap = boundingCap(pts);
    for (const p of pts) expect(capContains(cap, p, 1e-6)).toBe(true);
  });

  it('refuse une liste vide', () => {
    expect(() => boundingCap([])).toThrow();
  });
});
