import { makeProjector, type PatchFrame } from '../../geodata/lib/patch';
import type { GeoBox, Grid } from './grid';

const RAD = Math.PI / 180;

/**
 * Emprise (demi-côté, rad) du patch image : la vue à l'arrivée, pas le pays. Le cadrage montre la calotte
 * max(θ, θ_min) sur 1/m du demi-champ limitant ; `viewFactor` étend au grand côté de l'écran (paysage 16:9 et portrait de
 * téléphone, ≈ 2,2). Au-delà de `maxExtentDeg`, 2048 texels ne seraient plus plus fins que la texture globale 8K.
 */
export function imageExtentRad(capRadiusDeg: number, framing: { margin: number; minContextDeg?: number }, o: { viewFactor: number; maxExtentDeg: number }): number {
  return Math.min(Math.max(capRadiusDeg, framing.minContextDeg ?? 0) * framing.margin * o.viewFactor, o.maxExtentDeg) * RAD;
}

/** Boîte géographique d'un cadre : bord et intérieur échantillonnés (65 × 65), longitudes déroulées autour du centre ; un pôle dans le cadre ouvre toutes les longitudes. */
export function frameBox(frame: PatchFrame): GeoBox {
  const proj = makeProjector(frame), n = 64, lon0 = frame.center[0];
  const wrap = (d: number) => ((d + 540) % 360) - 180;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const [lon, lat] = proj.toLngLat((i / n) * frame.size, (j / n) * frame.size);
    const d = wrap(lon - lon0);
    west = Math.min(west, lon0 + d); east = Math.max(east, lon0 + d); south = Math.min(south, lat); north = Math.max(north, lat);
  }
  for (const pole of [90, -90]) {
    const [x, y] = proj.toPixel([lon0, pole]);
    if (x >= 0 && x <= frame.size && y >= 0 && y <= frame.size) {
      west = lon0 - 180; east = lon0 + 180;
      if (pole > 0) north = 90; else south = -90;
    }
  }
  return { west, south, east, north };
}

/** Masque terre (1) sur une grille plate carrée, en pair-impair aux centres de pixels ; chaque polygone est aussi posé à ±360° pour une grille déroulée. */
export function rasterizeLandGrid(polygons: number[][][][], g: Grid): Uint8Array {
  const mask = new Uint8Array(g.width * g.height);
  const xs: number[] = [];
  for (const poly of polygons) {
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
    for (const ring of poly) for (const p of ring) {
      minLon = Math.min(minLon, p[0]!); maxLon = Math.max(maxLon, p[0]!); minLat = Math.min(minLat, p[1]!); maxLat = Math.max(maxLat, p[1]!);
    }
    for (const shift of [-360, 0, 360]) {
      if (maxLon + shift < g.west || minLon + shift > g.east || maxLat < g.south || minLat > g.north) continue;
      const rowFrom = Math.max(0, Math.floor((g.north - maxLat) / g.step)), rowTo = Math.min(g.height - 1, Math.ceil((g.north - minLat) / g.step));
      for (let y = rowFrom; y <= rowTo; y++) {
        const lat = g.north - (y + 0.5) * g.step;
        xs.length = 0;
        for (const ring of poly) {
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [lonA, latA] = ring[i]!, [lonB, latB] = ring[j]!;
            if (latA! > lat !== latB! > lat) xs.push(lonA! + shift + ((lat - latA!) * (lonB! - lonA!)) / (latB! - latA!));
          }
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const from = Math.max(0, Math.ceil((xs[k]! - g.west) / g.step - 0.5)), to = Math.min(g.width - 1, Math.floor((xs[k + 1]! - g.west) / g.step - 0.5));
          for (let x = from; x <= to; x++) mask[y * g.width + x] = 1;
        }
      }
    }
  }
  return mask;
}

/** Fraction de terre (bilinéaire) d'un masque de grille, longitude déroulée comme la grille. */
export function sampleMask(g: Grid, mask: Uint8Array) {
  return (lon: number, lat: number): number => {
    let l = lon;
    while (l < g.west) l += 360;
    while (l >= g.west + 360) l -= 360;
    const fx = Math.min(g.width - 1, Math.max(0, (l - g.west) / g.step - 0.5)), fy = Math.min(g.height - 1, Math.max(0, (g.north - lat) / g.step - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(g.width - 1, x0 + 1), y1 = Math.min(g.height - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    const m = (x: number, y: number) => mask[y * g.width + x]!;
    return (m(x0, y0) * (1 - tx) + m(x1, y0) * tx) * (1 - ty) + (m(x0, y1) * (1 - tx) + m(x1, y1) * tx) * ty;
  };
}

/**
 * Patch image RVBA dans le cadre du contrat (PatchMeta : azimutale équidistante, ligne 0 au nord) : chaque texel prend
 * la couleur de son centre ; alpha = mer (255) / terre (0), comme le canal G de la texture de surface.
 */
export function renderPatch(frame: PatchFrame, color: (lon: number, lat: number) => [number, number, number], land: (lon: number, lat: number) => number): Uint8Array {
  const proj = makeProjector(frame), n = frame.size;
  const out = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const [lon, lat] = proj.toLngLat(i + 0.5, j + 0.5);
    const [r, g, b] = color(lon, lat);
    const k = (j * n + i) * 4;
    out[k] = r; out[k + 1] = g; out[k + 2] = b; out[k + 3] = Math.round(255 * (1 - land(lon, lat)));
  }
  return out;
}
