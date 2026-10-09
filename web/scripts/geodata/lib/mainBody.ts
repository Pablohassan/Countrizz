import { geoCentroid, geoDistance } from 'd3-geo';
import { polygonAreaKm2, type PolygonCoords } from './geometry';

export interface MainBody { kept: PolygonCoords[]; excluded: PolygonCoords[] }

/**
 * Corps principal : les polygones à moins de `maxDistanceDeg` d'une référence, gardés par surface décroissante jusqu'à
 * `areaShare` de leur total. Référence : le plus grand polygone ; ou, avec `anchor` (overrides.mainBodyAnchor), le
 * polygone le plus proche de l'ancre (la capitale), toujours gardé.
 */
export function mainBody(polys: PolygonCoords[], opts: { maxDistanceDeg: number; areaShare: number }, anchor?: [number, number]): MainBody {
  if (polys.length === 0) throw new Error('mainBody : aucun polygone');
  const items = polys
    .map((p) => ({ p, area: polygonAreaKm2(p), c: geoCentroid({ type: 'Polygon', coordinates: p }) }))
    .sort((a, b) => b.area - a.area);
  const ref = anchor
    ? items.reduce((best, i) => (geoDistance(anchor, i.c) < geoDistance(anchor, best.c) ? i : best))
    : items[0]!;
  const near = [ref, ...items.filter((i) => i !== ref && (geoDistance(ref.c, i.c) * 180) / Math.PI <= opts.maxDistanceDeg)];
  const total = near.reduce((s, i) => s + i.area, 0);
  const kept: PolygonCoords[] = [];
  let acc = 0;
  for (const i of near) {
    kept.push(i.p);
    acc += i.area;
    if (acc >= opts.areaShare * total) break;
  }
  const keptSet = new Set(kept);
  return { kept, excluded: items.map((i) => i.p).filter((p) => !keptSet.has(p)) };
}
