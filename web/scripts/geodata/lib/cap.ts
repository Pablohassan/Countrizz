import type { Cap, LngLat } from '../../../src/data/types';

type V = [number, number, number];
const D = Math.PI / 180;
const MAX_SAMPLE = 4000;

const toV = ([lng, lat]: LngLat): V => [
  Math.cos(lat * D) * Math.cos(lng * D),
  Math.cos(lat * D) * Math.sin(lng * D),
  Math.sin(lat * D),
];
const angle = (a: V, b: V): number => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
const toLngLat = (v: V): LngLat => [Math.atan2(v[1], v[0]) / D, Math.asin(Math.max(-1, Math.min(1, v[2]))) / D];
const normalize = (v: V, fallback: V): V => {
  const n = Math.hypot(v[0], v[1], v[2]);
  return n < 1e-12 ? fallback : [v[0] / n, v[1] / n, v[2] / n];
};

/** Bădoiu–Clarkson sur la sphère ; le rayon final est exact sur tous les points. */
export function boundingCap(points: LngLat[], iterations = 2000): Cap {
  if (points.length === 0) throw new Error('boundingCap : aucun point');
  const vs = points.map(toV);
  const stride = Math.ceil(vs.length / MAX_SAMPLE);
  const sample = stride > 1 ? vs.filter((_, i) => i % stride === 0) : vs;
  let c = normalize(sample.reduce<V>((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]), sample[0]!);
  for (let k = 1; k <= iterations; k++) {
    let far = sample[0]!;
    let best = -1;
    for (const v of sample) {
      const d = angle(c, v);
      if (d > best) { best = d; far = v; }
    }
    const t = 1 / (k + 1);
    c = normalize([c[0] + (far[0] - c[0]) * t, c[1] + (far[1] - c[1]) * t, c[2] + (far[2] - c[2]) * t], c);
  }
  let r = 0;
  for (const v of vs) r = Math.max(r, angle(c, v));
  return { center: toLngLat(c), radiusDeg: r / D };
}

export function capContains(cap: Cap, p: LngLat, epsDeg = 1e-9): boolean {
  return angle(toV(cap.center), toV(p)) / D <= cap.radiusDeg + epsDeg;
}
