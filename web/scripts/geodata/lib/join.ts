import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { CapitalOverride } from './capitals';
import { forD3, polygonsOf, toMultiPolygon, type PolygonCoords } from './geometry';

export interface NeProps { ISO_A3: string; ISO_A3_EH: string; ADM0_A3: string; NAME: string }

export interface Overrides {
  /** cca3 → code Natural Earth (ex. UNK → KOS) */
  neCode: Record<string, string>;
  /** code Natural Earth → cca3 jouable qui l'absorbe (ex. CYN → CYP) */
  merge: Record<string, string>;
  /** cca3 → code ISO chez geoBoundaries (ex. UNK → XKX) */
  gbIso: Record<string, string>;
  /** cca3 → capitale de jeu imposée, dans les deux langues (le FR doit figurer dans la liste Wikidata) */
  capitals: Record<string, CapitalOverride>;
  /** noms de jeu imposés par langue (FR raccourcis, décision du 05/10) */
  names: { fr: Record<string, string> };
  /** cca3 → raison d'accepter une surface hors de ×0,5–×2 */
  areaWhitelist: Record<string, string>;
  /** zone disputée Natural Earth (« BRK_NAME|ADM0_A3 ») → cca3 auquel la rattacher, ou 'neutral' (frontières reconnues) */
  disputed: Record<string, string>;
}

export interface JoinResult {
  byCountry: Map<string, MultiPolygon>;
  neutral: Feature<Polygon | MultiPolygon, NeProps>[];
  unmatched: string[];
}

export function neCode(p: NeProps): string {
  return p.ISO_A3_EH && p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ADM0_A3;
}

export function joinNaturalEarth(
  ne: FeatureCollection<Polygon | MultiPolygon, NeProps>,
  playable: string[],
  o: Pick<Overrides, 'neCode' | 'merge'>,
): JoinResult {
  const playableSet = new Set(playable);
  const owner = new Map<string, string>();
  for (const cca3 of playable) owner.set(o.neCode[cca3] ?? cca3, cca3);
  for (const [code, cca3] of Object.entries(o.merge)) if (playableSet.has(cca3)) owner.set(code, cca3);

  const polys = new Map<string, PolygonCoords[]>();
  const neutral: JoinResult['neutral'] = [];
  for (const feature of ne.features) {
    const cca3 = owner.get(neCode(feature.properties));
    if (!cca3) { neutral.push(feature); continue; }
    const list = polys.get(cca3) ?? [];
    list.push(...polygonsOf(forD3(feature.geometry)));
    polys.set(cca3, list);
  }
  const byCountry = new Map([...polys].map(([k, v]) => [k, toMultiPolygon(v)] as const));
  return { byCountry, neutral, unmatched: playable.filter((c) => !byCountry.has(c)) };
}
