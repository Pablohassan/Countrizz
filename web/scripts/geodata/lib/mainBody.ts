import { geoCentroid, geoDistance } from 'd3-geo';
import { polygonAreaKm2, type PolygonCoords } from './geometry';

export interface MainBody { kept: PolygonCoords[]; excluded: PolygonCoords[] }

export function mainBody(polys: PolygonCoords[], opts: { maxDistanceDeg: number; areaShare: number }): MainBody {
  if (polys.length === 0) throw new Error('mainBody : aucun polygone');
  const items = polys
    .map((p) => ({ p, area: polygonAreaKm2(p), c: geoCentroid({ type: 'Polygon', coordinates: p }) }))
    .sort((a, b) => b.area - a.area);
  const ref = items[0]!.c;
  const near = items.filter((i) => (geoDistance(ref, i.c) * 180) / Math.PI <= opts.maxDistanceDeg);
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
