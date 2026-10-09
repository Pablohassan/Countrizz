import { geoContains, geoDistance } from 'd3-geo';
import type { MultiPolygon } from 'geojson';
import type { LngLat } from '../../../src/data/types';
import { EARTH_RADIUS_KM } from '../config';

/** Lieu de Natural Earth `ne_10m_populated_places_simple` (champs utilisés seulement). */
export interface Place {
  properties: { name: string | null; nameascii: string | null; namealt: string | null; ls_name: string | null; featurecla: string; adm0_a3: string };
  geometry: { type: 'Point'; coordinates: number[] };
}

/** Arbitrage de position : nom tel qu'écrit dans Natural Earth, ou point imposé avec sa source. */
export type CapitalPointRule = { alias: string; why: string } | { lngLat: LngLat; source: string };

/** Comparaison de noms sans accents, apostrophes, tirets ni casse (« Sana'a » = « Sanaa »). */
export const foldName = (s: string | null | undefined): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

/**
 * Position de la capitale de jeu : le lieu Natural Earth du pays (`adm0_a3` = code NE) dont un des noms est la capitale
 * anglaise (ou l'alias) ; à homonymie, la capitale nationale (« Admin-0 capital… ») ; un point imposé passe tel quel.
 */
export function capitalPoint(cca3: string, neCode: string, capitalEn: string, places: Place[], rule?: CapitalPointRule): LngLat {
  if (rule && 'lngLat' in rule) return rule.lngLat;
  const wanted = rule?.alias ?? capitalEn;
  const key = foldName(wanted);
  const found = places.filter((f) => f.properties.adm0_a3 === neCode
    && [f.properties.name, f.properties.nameascii, f.properties.namealt, f.properties.ls_name].some((n) => foldName(n) === key));
  const national = found.filter((f) => f.properties.featurecla.startsWith('Admin-0 capital'));
  const pick = national.length > 0 ? national : found;
  if (pick.length === 0) {
    throw new Error(`${cca3} : « ${wanted} » introuvable dans Natural Earth (${neCode}) — alias ou point dans overrides.capitalPoints.${cca3}`);
  }
  if (pick.length > 1) {
    throw new Error(`${cca3} : ${pick.length} lieux « ${wanted} » de même rang dans Natural Earth — trancher dans overrides.capitalPoints.${cca3}`);
  }
  const [lng, lat] = pick[0]!.geometry.coordinates;
  return [lng!, lat!];
}

/** 0 si `p` est dans le pays ; sinon distance en km au sommet de contour le plus proche (majorant, contours denses). */
export function offshoreKm(geometry: MultiPolygon, p: LngLat): number {
  if (geoContains(geometry, p)) return 0;
  let best = Infinity;
  for (const poly of geometry.coordinates) for (const ring of poly) for (const q of ring) {
    best = Math.min(best, geoDistance(p, [q[0]!, q[1]!]));
  }
  return best * EARTH_RADIUS_KM;
}
