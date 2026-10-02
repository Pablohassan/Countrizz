import { geoAzimuthalEquidistant, geoCentroid } from 'd3-geo';
import polylabel from 'polylabel';
import type { LngLat } from '../../../src/data/types';
import { EARTH_RADIUS_KM } from '../config';
import { polygonAreaKm2, type PolygonCoords } from './geometry';

export function beaconPoint(mainBodyPolys: PolygonCoords[]): { point: LngLat; clearanceKm: number } {
  const largest = [...mainBodyPolys].sort((a, b) => polygonAreaKm2(b) - polygonAreaKm2(a))[0];
  if (!largest) throw new Error('beaconPoint : corps principal vide');
  const c = geoCentroid({ type: 'Polygon', coordinates: largest });
  // Échelle 1 : les coordonnées projetées sont des radians d'arc, donc distance × R = km.
  const proj = geoAzimuthalEquidistant().rotate([-c[0], -c[1]]).scale(1).translate([0, 0]);
  const projected = largest.map((ring) => ring.map((p) => proj([p[0]!, p[1]!])!));
  const pole = polylabel(projected, 1e-7);
  const ll = proj.invert!([pole[0]!, pole[1]!])!;
  return { point: [ll[0], ll[1]], clearanceKm: pole.distance * EARTH_RADIUS_KM };
}
