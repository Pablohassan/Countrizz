import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import sharp from 'sharp';
import { FRAMING } from '../../src/camera/config';
import type { ImageryIndex } from '../../src/data/imagery';
import type { CountryRecord } from '../../src/data/types';
import { polygonsOf } from '../geodata/lib/geometry';
import { sha256 } from '../geodata/lib/http';
import { readJson, writeJson } from '../geodata/lib/io';
import { NE_COUNTRIES } from '../textures/paths';
import { EOX, IMAGE_PATCH } from './config';
import { snapGrid } from './lib/grid';
import { loadMosaic, sampleBilinear } from './lib/mosaic';
import { downsamplePatch, frameBox, imageExtentRad, rasterizeLandGrid, renderPatch, sampleMask } from './lib/patchImage';
import { IMG_CACHE_DIR, IMG_INDEX_PATH, IMG_OUT_DIR, IMG_REPORT_PATH } from './paths';

sharp.cache(false);
const TMP = path.join(IMG_CACHE_DIR, 'tmp');
const RAD = Math.PI / 180;

function toktx(out: string, png: string): void {
  // Pas de --lower_left_maps_to_s0t0 : le patch se lit en (u, v) calculés, ligne 0 = nord = v 0 (contrat de PatchMeta).
  const r = spawnSync('toktx', ['--t2', '--encode', 'etc1s', '--clevel', '2', '--qlevel', String(IMAGE_PATCH.qlevel), '--genmipmap', '--assign_oetf', 'srgb', out, png], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`toktx ${out} : code ${r.status}`);
}

/** `npm run imagery [CCA3 …]` : patchs image des pays nommés (tous par défaut) ; réseau seulement pour ce qui manque au cache. */
async function main(): Promise<void> {
  const countries = readJson<CountryRecord[]>(path.resolve(IMG_OUT_DIR, '../../countries.json'));
  const only = process.argv.slice(2).map((s) => s.toUpperCase());
  const ne = readJson<FeatureCollection<Polygon | MultiPolygon>>(NE_COUNTRIES);
  const polygons = ne.features.flatMap((f) => polygonsOf(f.geometry)) as number[][][][];
  const previous: ImageryIndex | null = existsSync(IMG_INDEX_PATH) ? readJson(IMG_INDEX_PATH) : null;
  const index: ImageryIndex = {
    layer: EOX.service.layer, year: EOX.year, license: EOX.license, attribution: EOX.attribution,
    framing: { margin: FRAMING.margin, minContextDeg: FRAMING.minContextDeg ?? 0 },
    viewFactor: IMAGE_PATCH.viewFactor, maxExtentDeg: IMAGE_PATCH.maxExtentDeg, sizes: [...IMAGE_PATCH.sizes],
    countries: { ...(previous?.countries ?? {}) },
  };
  mkdirSync(TMP, { recursive: true });
  mkdirSync(IMG_OUT_DIR, { recursive: true });
  const [big, small] = IMAGE_PATCH.sizes;
  for (const rec of countries) {
    if (only.length && !only.includes(rec.cca3)) continue;
    const extentRad = imageExtentRad(rec.cap.radiusDeg, FRAMING, IMAGE_PATCH);
    const frame = { center: rec.cap.center, extentRad, size: big };
    const texelDeg = (2 * extentRad) / big / RAD;
    const box = frameBox(frame);
    const pad = 2 * texelDeg;
    const grid = snapGrid({ west: box.west - pad, south: box.south - pad, east: box.east + pad, north: box.north + pad }, texelDeg);
    const { mosaic } = await loadMosaic(grid, { service: EOX.service, cacheDir: IMG_CACHE_DIR, maxPx: EOX.maxPx });
    const land = sampleMask(grid, rasterizeLandGrid(polygons, grid));
    const rgba = renderPatch(frame, (lon, lat) => sampleBilinear(mosaic, lon, lat), land);
    const id = rec.cca3.toLowerCase();
    const png = path.join(TMP, `${id}-${big}.png`), pngSmall = path.join(TMP, `${id}-${small}.png`);
    await sharp(rgba, { raw: { width: big, height: big, channels: 4 } }).png({ compressionLevel: 6 }).toFile(png);
    await sharp(await downsamplePatch(rgba, big, small), { raw: { width: small, height: small, channels: 4 } }).png({ compressionLevel: 6 }).toFile(pngSmall);
    const files: Record<string, { bytes: number; sha256: string }> = {};
    for (const [size, src] of [[big, png], [small, pngSmall]] as const) {
      const out = path.join(IMG_OUT_DIR, `${id}-${size}.ktx2`);
      toktx(out, src);
      const bytes = readFileSync(out);
      files[String(size)] = { bytes: bytes.length, sha256: sha256(bytes) };
    }
    index.countries[rec.cca3] = { center: rec.cap.center, extentRad, files };
    console.log(`${rec.cca3} : ±${(extentRad / RAD).toFixed(2)}°, grille ${grid.width} × ${grid.height}, ${files[String(big)]!.bytes} + ${files[String(small)]!.bytes} octets`);
  }
  // ordre stable des pays dans l'index versionné
  index.countries = Object.fromEntries(Object.entries(index.countries).sort(([a], [b]) => a.localeCompare(b)));
  writeJson(IMG_INDEX_PATH, index);
  const rows = Object.entries(index.countries).map(([k, v]) => `| ${k} | ${((v.extentRad / RAD)).toFixed(2)} | ${v.files[String(big)]?.bytes ?? ''} | ${v.files[String(small)]?.bytes ?? ''} |`);
  const total = (s: number) => Object.values(index.countries).reduce((t, v) => t + (v.files[String(s)]?.bytes ?? 0), 0);
  writeFileSync(IMG_REPORT_PATH, ['# Patchs image — rapport de génération', '', `${EOX.attribution} — ${EOX.license}`, '',
    `- ${Object.keys(index.countries).length} pays ; ${big} px : ${total(big)} octets ; ${small} px : ${total(small)} octets`, '',
    '| Pays | Demi-emprise (°) | Octets ' + big + ' | Octets ' + small + ' |', '|---|---:|---:|---:|', ...rows, ''].join('\n'));
  rmSync(TMP, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
