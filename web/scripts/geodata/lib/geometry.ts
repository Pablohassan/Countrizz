import rewind from '@mapbox/geojson-rewind';
import { geoArea } from 'd3-geo';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import { EARTH_RADIUS_KM } from '../config';

export type PolygonCoords = Position[][];

export function polygonsOf(g: Polygon | MultiPolygon): PolygonCoords[] {
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

export function toMultiPolygon(polys: PolygonCoords[]): MultiPolygon {
  return { type: 'MultiPolygon', coordinates: polys };
}

/** Anneaux extérieurs dans le sens horaire, intérieurs anti-horaire : la convention de d3-geo. */
export function forD3(g: Polygon | MultiPolygon): MultiPolygon {
  return rewind(toMultiPolygon(polygonsOf(g)), true);
}

export function areaKm2(g: Polygon | MultiPolygon): number {
  return geoArea(g) * EARTH_RADIUS_KM ** 2;
}

export function polygonAreaKm2(p: PolygonCoords): number {
  return geoArea({ type: 'Polygon', coordinates: p }) * EARTH_RADIUS_KM ** 2;
}
