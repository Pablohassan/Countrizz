import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fetchBytes, sha256 } from '../../geodata/lib/http';
import { writeBytes } from '../../geodata/lib/io';
import { planRequests, type Grid, type WmsRequest } from './grid';
import { getMapUrl, isImage, type WmsService } from './wms';

/** Image RVB d'une grille plate carrée : pixel (x, y) = colonne x depuis `west`, ligne y depuis `north`. */
export interface Mosaic { grid: Grid; rgb: Uint8Array }

export function assemble(grid: Grid, tiles: { request: WmsRequest; rgb: Uint8Array }[]): Mosaic {
  const rgb = new Uint8Array(grid.width * grid.height * 3);
  for (const { request: r, rgb: t } of tiles) {
    if (t.length !== r.width * r.height * 3) throw new Error(`image de ${t.length / 3} pixels au lieu de ${r.width} × ${r.height} : taille inattendue`);
    for (let y = 0; y < r.height; y++) rgb.set(t.subarray(y * r.width * 3, (y + 1) * r.width * 3), ((r.y + y) * grid.width + r.x) * 3);
  }
  return { grid, rgb };
}

/** Bilinéaire aux centres de pixels ; la longitude est déroulée dans [west, west + 360[, les bords sont prolongés. */
export function sampleBilinear(m: Mosaic, lon: number, lat: number): [number, number, number] {
  const g = m.grid;
  let l = lon;
  while (l < g.west) l += 360;
  while (l >= g.west + 360) l -= 360;
  const fx = Math.min(g.width - 1, Math.max(0, (l - g.west) / g.step - 0.5));
  const fy = Math.min(g.height - 1, Math.max(0, (g.north - lat) / g.step - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(g.width - 1, x0 + 1), y1 = Math.min(g.height - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const at = (x: number, y: number, k: number) => m.rgb[(y * g.width + x) * 3 + k]!;
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] = Math.round((at(x0, y0, k) * (1 - tx) + at(x1, y0, k) * tx) * (1 - ty) + (at(x0, y1, k) * (1 - tx) + at(x1, y1, k) * tx) * ty);
  }
  return out;
}

export interface FetchedTile { url: string; file: string; sha256: string; bytes: number }

/**
 * Mosaïque d'une grille : une requête GetMap par morceau (≤ 4096 px, coupée à l'antiméridien), chacune mise en cache
 * sous l'empreinte de son URL. `offline` interdit le réseau (construction : tout doit déjà être en cache).
 */
export async function loadMosaic(grid: Grid, o: { service: WmsService; cacheDir: string; maxPx?: number; offline?: boolean }): Promise<{ mosaic: Mosaic; tiles: FetchedTile[] }> {
  const tiles: { request: WmsRequest; rgb: Uint8Array }[] = [];
  const fetched: FetchedTile[] = [];
  for (const request of planRequests(grid, o.maxPx ?? 4096)) {
    const url = getMapUrl(o.service, request);
    const file = path.join(o.cacheDir, `${sha256(new TextEncoder().encode(url)).slice(0, 24)}.img`);
    let bytes: Uint8Array;
    if (existsSync(file)) bytes = readFileSync(file);
    else {
      if (o.offline) throw new Error(`absent du cache (lancer d'abord la récupération) : ${url}`);
      bytes = await fetchBytes(url);
      if (!isImage(bytes)) throw new Error(`réponse qui n'est pas une image pour ${url} : ${new TextDecoder().decode(bytes.subarray(0, 300))}`);
      writeBytes(file, bytes);
    }
    const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== request.width || info.height !== request.height) throw new Error(`${url} : ${info.width} × ${info.height} reçu`);
    tiles.push({ request, rgb: new Uint8Array(data.buffer, data.byteOffset, data.length) });
    fetched.push({ url, file: path.basename(file), sha256: sha256(bytes), bytes: bytes.length });
  }
  return { mosaic: assemble(grid, tiles), tiles: fetched };
}
