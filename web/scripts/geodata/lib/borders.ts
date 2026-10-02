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

export function overviewBorders(topo: Topo, keep: number): LngLat[][] {
  const pre = presimplify(topo);
  // quantile trie les poids par ordre DÉCROISSANT : quantile(pre, keep) est le seuil qui garde la part `keep` des points.
  const simp = keep >= 1 ? pre : simplify(pre, quantile(pre, keep));
  const m = mesh(simp, simp.objects.countries);
  return m.coordinates.map((line) => line.map(([x, y]) => [round3(x!), round3(y!)] as LngLat));
}

export function neighborLines(topo: Topo, target: string): LngLat[][] {
  const code = (g: { properties?: unknown }) => (g.properties as { code: string }).code;
  const m = mesh(topo, topo.objects.countries, (a, b) => code(a) !== target && code(b) !== target);
  return m.coordinates.map((line) => line.map(([x, y]) => [x!, y!] as LngLat));
}
