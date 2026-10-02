import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { areaKm2, forD3, polygonsOf, toMultiPolygon } from '../../lib/geometry';

// Carré de 1° à l'équateur, anneau extérieur ANTI-horaire (convention RFC 7946)
const ccwSquare: Polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
const EXPECTED_KM2 = 12364; // R² · Δλ · (sin φ2 − sin φ1), R = 6371,0088 km

describe('géométrie sphérique', () => {
  it('un anneau anti-horaire est lu par d3 comme le globe moins le carré', () => {
    expect(areaKm2(ccwSquare)).toBeGreaterThan(5e8);
  });

  it('forD3 remet l’anneau dans le sens attendu par d3', () => {
    expect(areaKm2(forD3(ccwSquare))).toBeCloseTo(EXPECTED_KM2, -2);
  });

  it('forD3 est idempotent', () => {
    expect(areaKm2(forD3(forD3(ccwSquare)))).toBeCloseTo(EXPECTED_KM2, -2);
  });

  it('polygonsOf et toMultiPolygon font l’aller-retour', () => {
    expect(polygonsOf(toMultiPolygon(polygonsOf(ccwSquare)))).toEqual(polygonsOf(ccwSquare));
  });
});
