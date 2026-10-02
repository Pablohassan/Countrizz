import { describe, expect, it } from 'vitest';
import { geoCentroid, geoContains } from 'd3-geo';
import { beaconPoint } from '../../lib/beacon';
import { forD3, polygonsOf } from '../../lib/geometry';

const cShape = polygonsOf(forD3({
  type: 'Polygon',
  coordinates: [[[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [4, 3], [4, 4], [0, 4], [0, 0]]],
}))[0]!;

describe('beaconPoint', () => {
  it('le centroïde d’un C tombe dehors, la balise dedans', () => {
    const poly = { type: 'Polygon' as const, coordinates: cShape };
    expect(geoContains(poly, geoCentroid(poly))).toBe(false);
    expect(geoContains(poly, beaconPoint([cShape]).point)).toBe(true);
  });

  it('donne la distance au bord du plus grand cercle inscrit', () => {
    // Le cercle se loge dans l'angle intérieur bras/montant : t = √2·(1 − t) ⇒ t = √2/(1+√2) ≈ 0,5858°,
    // soit ≈ 65,1 km à l'équateur (111,195 km par degré).
    const { clearanceKm } = beaconPoint([cShape]);
    expect(clearanceKm).toBeCloseTo((Math.SQRT2 / (1 + Math.SQRT2)) * 111.195, 0);
  });

  it('choisit le plus grand polygone du corps principal', () => {
    const small = polygonsOf(forD3({ type: 'Polygon', coordinates: [[[10, 0], [10.2, 0], [10.2, 0.2], [10, 0.2], [10, 0]]] }))[0]!;
    const [lng] = beaconPoint([small, cShape]).point;
    expect(lng).toBeLessThan(5);
  });
});
