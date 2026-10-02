import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import { difference, union, type Geom } from 'polyclip-ts';
import { areaKm2, forD3, polygonsOf, toMultiPolygon } from './geometry';

export interface DisputedProps { BRK_NAME: string; ADM0_A3: string; NAME: string }

/** Clé stable d'une zone disputée Natural Earth : « BRK_NAME|ADM0_A3 » (unique sur les 99 zones de la v5.1.1). */
export const disputedKey = (p: DisputedProps): string => `${p.BRK_NAME}|${p.ADM0_A3}`;

export interface DisputedResult {
  byCountry: Map<string, MultiPolygon>;
  /** Zones neutralisées, à tracer comme entités neutres (jamais allumées). */
  neutral: { code: string; geometry: MultiPolygon }[];
  /** Pays dont la géométrie a changé : leur contour doit rester celui de Natural Earth ainsi modifié. */
  touched: Set<string>;
}

type BBox = [number, number, number, number];

function bbox(g: MultiPolygon): BBox {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of g.coordinates) for (const [x, y] of poly[0]!) {
    x0 = Math.min(x0, x!); y0 = Math.min(y0, y!); x1 = Math.max(x1, x!); y1 = Math.max(y1, y!);
  }
  return [x0, y0, x1, y1];
}

const overlaps = (a: BBox, b: BBox) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const asGeom = (g: MultiPolygon) => g.coordinates as unknown as Geom;
const fromGeom = (g: unknown): MultiPolygon => forD3(toMultiPolygon(g as Position[][][]));

/**
 * Réattribue des zones disputées selon les frontières internationalement reconnues :
 * `rules[clé] = cca3` rattache la zone à ce pays jouable, `'neutral'` la découpe de tous les pays.
 * polyclip-ts rend des anneaux extérieurs anti-horaires (RFC 7946) : tout résultat repasse par forD3.
 */
export function applyDisputed(
  byCountry: Map<string, MultiPolygon>,
  areas: Feature<Polygon | MultiPolygon, DisputedProps>[],
  rules: Record<string, string>,
): DisputedResult {
  const out = new Map(byCountry);
  const neutral: DisputedResult['neutral'] = [];
  const touched = new Set<string>();
  const index = new Map(areas.map((f) => [disputedKey(f.properties), f] as const));

  for (const [key, target] of Object.entries(rules)) {
    const feature = index.get(key);
    if (!feature) throw new Error(`zone disputée inconnue : ${key}`);
    if (target !== 'neutral' && !out.has(target)) throw new Error(`${key} → ${target} : pays non jouable`);
    const zone = forD3(toMultiPolygon(polygonsOf(feature.geometry)));
    const zoneBox = bbox(zone);

    for (const [cca3, g] of out) {
      if (cca3 === target || !overlaps(bbox(g), zoneBox)) continue;
      const cut = fromGeom(difference(asGeom(g), asGeom(zone)));
      if (areaKm2(cut) < areaKm2(g) - 1e-3) {
        out.set(cca3, cut);
        touched.add(cca3);
      }
    }
    if (target === 'neutral') {
      neutral.push({ code: `DSP:${key}`, geometry: zone });
    } else {
      out.set(target, fromGeom(union(asGeom(out.get(target)!), asGeom(zone))));
      touched.add(target);
    }
  }
  return { byCountry: out, neutral, touched };
}
