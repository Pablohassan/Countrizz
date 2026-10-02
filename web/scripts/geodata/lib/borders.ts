import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { mesh } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { LngLat } from '../../../src/data/types';

export interface CodedFeature { code: string; geometry: Polygon | MultiPolygon }
type Topo = Topology<{ countries: GeometryCollection<{ code: string }> }>;

export function buildTopology(features: CodedFeature[]): Topo {
  const fc: FeatureCollection<Polygon | MultiPolygon, { code: string }> = {
    type: 'FeatureCollection',
    features: features.map((f) => ({ type: 'Feature', properties: { code: f.code }, geometry: f.geometry })),
  };
  return topology({ countries: fc }, 1e6) as unknown as Topo;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Segment de couture : le long de l'antiméridien (|lon| = 180) ou d'un pôle (|lat| = 90), pas une frontière réelle. */
const isSeam = (a: LngLat, b: LngLat) =>
  (Math.abs(a[0]) > 179.9999 && Math.abs(b[0]) > 179.9999) || (Math.abs(a[1]) > 89.9999 && Math.abs(b[1]) > 89.9999);

/** Coupe chaque ligne à ses segments de couture ; ne garde que les morceaux d'au moins deux points. */
export function dropSeams(lines: LngLat[][]): LngLat[][] {
  const out: LngLat[][] = [];
  for (const line of lines) {
    let current: LngLat[] = [line[0]!];
    for (let i = 1; i < line.length; i++) {
      if (isSeam(line[i - 1]!, line[i]!)) {
        if (current.length > 1) out.push(current);
        current = [line[i]!];
      } else current.push(line[i]!);
    }
    if (current.length > 1) out.push(current);
  }
  return out;
}

export function overviewBorders(topo: Topo, keep: number): LngLat[][] {
  const pre = presimplify(topo);
  // quantile trie les poids par ordre DÉCROISSANT : quantile(pre, keep) est le seuil qui garde la part `keep` des points.
  const simp = keep >= 1 ? pre : simplify(pre, quantile(pre, keep));
  const m = mesh(simp, simp.objects.countries);
  return dropSeams(m.coordinates.map((line) => line.map(([x, y]) => [round3(x!), round3(y!)] as LngLat)));
}

export function neighborLines(topo: Topo, target: string): LngLat[][] {
  const code = (g: { properties?: unknown }) => (g.properties as { code: string }).code;
  const m = mesh(topo, topo.objects.countries, (a, b) => code(a) !== target && code(b) !== target);
  return dropSeams(m.coordinates.map((line) => line.map(([x, y]) => [x!, y!] as LngLat)));
}
