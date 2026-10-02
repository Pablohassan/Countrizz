import { geoAzimuthalEquidistant } from 'd3-geo';
import { PNG } from 'pngjs';
import type { LngLat, PatchMeta } from '../../../src/data/types';
import type { PolygonCoords } from './geometry';

export interface PatchFrame { center: LngLat; extentRad: number; size: number }

export function patchExtentRad(capRadiusDeg: number, cfg: { extentFactor: number; minExtentDeg: number }): number {
  return (Math.max(capRadiusDeg * cfg.extentFactor, cfg.minExtentDeg) * Math.PI) / 180;
}

export function makeProjector(f: PatchFrame) {
  const proj = geoAzimuthalEquidistant().rotate([-f.center[0], -f.center[1]]).scale(1).translate([0, 0]);
  const half = f.size / 2;
  return {
    toPixel(p: LngLat): [number, number] {
      const xy = proj(p);
      return xy ? [(xy[0] / f.extentRad + 1) * half, (xy[1] / f.extentRad + 1) * half] : [NaN, NaN];
    },
    toLngLat(px: number, py: number): LngLat {
      const ll = proj.invert!([(px / half - 1) * f.extentRad, (py / half - 1) * f.extentRad])!;
      return [ll[0], ll[1]];
    },
  };
}

/** Remplissage pair-impair aux centres de pixels ; les anneaux sont en coordonnées pixel. */
export function rasterizePolygons(rings: [number, number][][], size: number): Uint8Array {
  const mask = new Uint8Array(size * size);
  const xs: number[] = [];
  for (let y = 0; y < size; y++) {
    const sy = y + 0.5;
    xs.length = 0;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[i]!;
        const [x2, y2] = ring[j]!;
        if (y1 > sy !== y2 > sy) xs.push(x1 + ((sy - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k]! - 0.5));
      const to = Math.min(size - 1, Math.floor(xs[k + 1]! - 0.5));
      for (let x = from; x <= to; x++) mask[y * size + x] = 1;
    }
  }
  return mask;
}

const INF = 1e20;

function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    d[q] = (q - v[k]!) ** 2 + f[v[k]!]!;
  }
}

/** Distance euclidienne au carré (texels²) au plus proche pixel où seed vaut 1 (Felzenszwalb & Huttenlocher). */
export function squaredDistanceTo(seed: Uint8Array, size: number): Float64Array {
  const grid = new Float64Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = seed[i] ? 0 : INF;
  const f = new Float64Array(size), d = new Float64Array(size), v = new Int32Array(size), z = new Float64Array(size + 1);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) f[y] = grid[y * size + x]!;
    edt1d(f, size, d, v, z);
    for (let y = 0; y < size; y++) grid[y * size + x] = d[y]!;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) f[x] = grid[y * size + x]!;
    edt1d(f, size, d, v, z);
    for (let x = 0; x < size; x++) grid[y * size + x] = d[x]!;
  }
  return grid;
}

/** > 0 dedans, < 0 dehors ; le bord passe entre deux pixels (±0,5). */
export function signedDistance(inside: Uint8Array, size: number): Float32Array {
  const outside = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i++) outside[i] = inside[i] ? 0 : 1;
  const toOutside = squaredDistanceTo(outside, size);
  const toInside = squaredDistanceTo(inside, size);
  const sd = new Float32Array(inside.length);
  for (let i = 0; i < sd.length; i++) {
    sd[i] = inside[i] ? Math.sqrt(toOutside[i]!) - 0.5 : -(Math.sqrt(toInside[i]!) - 0.5);
  }
  return sd;
}

/** Tracé des segments (échantillonnage à ½ texel), découpé au cadre par Liang–Barsky. */
export function rasterizeLines(lines: [number, number][][], size: number): Uint8Array {
  const mask = new Uint8Array(size * size);
  const lo = -1, hi = size + 1;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      let [x0, y0] = line[i - 1]!;
      let [x1, y1] = line[i]!;
      if (!Number.isFinite(x0 + y0 + x1 + y1)) continue;
      const dx = x1 - x0, dy = y1 - y0;
      let t0 = 0, t1 = 1;
      let visible = true;
      for (const [p, q] of [[-dx, x0 - lo], [dx, hi - x0], [-dy, y0 - lo], [dy, hi - y0]] as const) {
        if (p === 0) { if (q < 0) { visible = false; break; } continue; }
        const r = q / p;
        if (p < 0) { if (r > t1) { visible = false; break; } if (r > t0) t0 = r; }
        else { if (r < t0) { visible = false; break; } if (r < t1) t1 = r; }
      }
      if (!visible) continue;
      [x0, y0, x1, y1] = [x0 + dx * t0, y0 + dy * t0, x0 + dx * t1, y0 + dy * t1];
      const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
      for (let s = 0; s <= steps; s++) {
        const x = Math.floor(x0 + ((x1 - x0) * s) / steps);
        const y = Math.floor(y0 + ((y1 - y0) * s) / steps);
        if (x >= 0 && y >= 0 && x < size && y < size) mask[y * size + x] = 1;
      }
    }
  }
  return mask;
}

export function buildPatch(
  outline: PolygonCoords[],
  neighbors: LngLat[][],
  frame: PatchFrame,
  rangeTexels: number,
): { png: Buffer; insidePixels: number } {
  const { size } = frame;
  const proj = makeProjector(frame);
  const rings = outline.flatMap((poly) => poly.map((ring) => ring.map((p) => proj.toPixel([p[0]!, p[1]!]))));
  const inside = rasterizePolygons(rings, size);
  const sd = signedDistance(inside, size);
  const lines = rasterizeLines(neighbors.map((l) => l.map((p) => proj.toPixel(p))), size);
  const hasLines = lines.some((v) => v === 1);
  const border = hasLines ? squaredDistanceTo(lines, size) : null;

  const png = new PNG({ width: size, height: size });
  let insidePixels = 0;
  for (let i = 0; i < size * size; i++) {
    if (inside[i]) insidePixels++;
    const r = Math.round(128 + (Math.max(-rangeTexels, Math.min(rangeTexels, sd[i]!)) / rangeTexels) * 127);
    const g = border ? Math.round((Math.min(Math.sqrt(border[i]!), rangeTexels) / rangeTexels) * 255) : 255;
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = 0;
    png.data[i * 4 + 3] = 255;
  }
  return { png: PNG.sync.write(png), insidePixels };
}

export function samplePatchPng(png: PNG, meta: PatchMeta, p: LngLat): { r: number; g: number } | null {
  const [x, y] = makeProjector(meta).toPixel(p);
  const xi = Math.floor(x), yi = Math.floor(y);
  if (!(xi >= 0 && yi >= 0 && xi < png.width && yi < png.height)) return null;
  const i = (yi * png.width + xi) * 4;
  return { r: png.data[i]!, g: png.data[i + 1]! };
}
