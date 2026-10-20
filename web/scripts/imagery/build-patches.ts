import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import sharp from 'sharp';
import { FRAMING } from '../../src/camera/config';
import { imagePatchName, type ImageLevel, type ImageryIndex } from '../../src/data/imagery';
import type { CountryRecord } from '../../src/data/types';
import { polygonsOf } from '../geodata/lib/geometry';
import { sha256 } from '../geodata/lib/http';
import { readJson, writeJson } from '../geodata/lib/io';
import { TEXTURE_SOURCES } from '../textures/config';
import { NE_COUNTRIES, TEX_CACHE_DIR } from '../textures/paths';
import { equirectSampler, seaColor } from './lib/seaColor';
import { EOX, IMAGE_PATCH } from './config';
import { snapGrid } from './lib/grid';
import { loadMosaic, sampleBilinear } from './lib/mosaic';
import { downsamplePatch, frameBox, imageLevels, rasterizeLandGrid, renderPatch, sampleMask } from './lib/patchImage';
import { IMG_CACHE_DIR, IMG_INDEX_PATH, IMG_OUT_DIR, IMG_REPORT_PATH } from './paths';

sharp.cache(false);
const TMP = path.join(IMG_CACHE_DIR, 'tmp');
const RAD = Math.PI / 180;

function toktx(out: string, png: string): void {
  // Pas de --lower_left_maps_to_s0t0 : le patch se lit en (u, v) calculés, ligne 0 = nord = v 0 (contrat de PatchMeta).
  const r = spawnSync('toktx', ['--t2', '--encode', 'etc1s', '--clevel', '2', '--qlevel', String(IMAGE_PATCH.qlevel), '--genmipmap', '--assign_oetf', 'srgb', out, png], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`toktx ${out} : code ${r.status}`);
}

/** `npm run imagery [CCA3 …]` : chaîne de photos des pays nommés (tous par défaut, spec zoom §4) ; réseau seulement pour ce qui manque au cache. */
async function main(): Promise<void> {
  const countries = readJson<CountryRecord[]>(path.resolve(IMG_OUT_DIR, '../../countries.json'));
  const only = process.argv.slice(2).map((s) => s.toUpperCase());
  const ne = readJson<FeatureCollection<Polygon | MultiPolygon>>(NE_COUNTRIES);
  const polygons = ne.features.flatMap((f) => polygonsOf(f.geometry)) as number[][][][];
  const previous: ImageryIndex | null = existsSync(IMG_INDEX_PATH) ? readJson(IMG_INDEX_PATH) : null;
  const index: ImageryIndex = {
    layer: EOX.service.layer, year: EOX.year, license: EOX.license, attribution: EOX.attribution,
    framing: { margin: FRAMING.margin, minContextDeg: FRAMING.minContextDeg ?? 0, arrival: FRAMING.arrival! },
    viewFactor: IMAGE_PATCH.viewFactor, levelRatio: IMAGE_PATCH.levelRatio, maxExtentDeg: IMAGE_PATCH.maxExtentDeg,
    viewports: IMAGE_PATCH.viewports.map((v) => ({ ...v })), sizes: [...IMAGE_PATCH.sizes],
    // l'index précédent n'est repris que s'il est déjà au modèle des niveaux (spec zoom §4.2)
    countries: { ...(previous && 'levelRatio' in previous ? previous.countries : {}) },
  };
  mkdirSync(TMP, { recursive: true });
  mkdirSync(IMG_OUT_DIR, { recursive: true });
  const [big, small] = IMAGE_PATCH.sizes;
  // mer de Blue Marble (spec océan §1.1) : l'océan d'EOxCloudless est un bleu uniforme ombré, sans lagons
  const bmFile = path.join(TEX_CACHE_DIR, TEXTURE_SOURCES.day.file);
  const bm = await sharp(bmFile, { limitInputPixels: false }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (bm.info.channels !== 3) throw new Error(`Blue Marble : ${bm.info.channels} canaux`);
  const sea = equirectSampler(bm.data, bm.info.width, bm.info.height);
  for (const rec of countries) {
    if (only.length && !only.includes(rec.cca3)) continue;
    const extents = imageLevels(rec, FRAMING, IMAGE_PATCH);
    const levels: ImageLevel[] = [];
    for (const [level, extentRad] of extents.entries()) {
      const frame = { center: rec.cap.center, extentRad, size: big };
      const texelDeg = (2 * extentRad) / big / RAD;
      const box = frameBox(frame);
      const pad = 2 * texelDeg;
      const grid = snapGrid({ west: box.west - pad, south: box.south - pad, east: box.east + pad, north: box.north + pad }, texelDeg);
      const { mosaic } = await loadMosaic(grid, { service: EOX.service, cacheDir: IMG_CACHE_DIR, maxPx: EOX.maxPx });
      const land = sampleMask(grid, rasterizeLandGrid(polygons, grid));
      const rgba = renderPatch(frame, (lon, lat) => {
        const l = land(lon, lat);
        return l >= 1 ? sampleBilinear(mosaic, lon, lat) : seaColor(sampleBilinear(mosaic, lon, lat), sea(lon, lat), l);
      }, land);
      const png = path.join(TMP, `${level}-${big}.png`), pngSmall = path.join(TMP, `${level}-${small}.png`);
      await sharp(rgba, { raw: { width: big, height: big, channels: 4 } }).png({ compressionLevel: 6 }).toFile(png);
      await sharp(await downsamplePatch(rgba, big, small), { raw: { width: small, height: small, channels: 4 } }).png({ compressionLevel: 6 }).toFile(pngSmall);
      const files: Record<string, { bytes: number; sha256: string }> = {};
      for (const [size, src] of [[big, png], [small, pngSmall]] as const) {
        const out = path.join(IMG_OUT_DIR, imagePatchName(rec.cca3, level, size));
        toktx(out, src);
        const bytes = readFileSync(out);
        files[String(size)] = { bytes: bytes.length, sha256: sha256(bytes) };
      }
      levels.push({ extentRad, files });
      console.log(`${rec.cca3} niveau ${level} : ±${(extentRad / RAD).toFixed(4)}°, grille ${grid.width} × ${grid.height}, ${files[String(big)]!.bytes} + ${files[String(small)]!.bytes} octets`);
    }
    index.countries[rec.cca3] = { center: rec.cap.center, levels };
  }
  // ordre stable des pays dans l'index versionné
  index.countries = Object.fromEntries(Object.entries(index.countries).sort(([a], [b]) => a.localeCompare(b)));
  writeJson(IMG_INDEX_PATH, index);
  // passe complète : les photos qui ne sont plus dans l'index (anciens noms sans niveau) sont retirées
  if (!only.length) {
    const want = new Set(Object.entries(index.countries).flatMap(([c, m]) => m.levels.flatMap((_, i) => IMAGE_PATCH.sizes.map((s) => imagePatchName(c, i, s)))));
    for (const f of readdirSync(IMG_OUT_DIR)) if (f.endsWith('.ktx2') && !want.has(f)) rmSync(path.join(IMG_OUT_DIR, f));
  }
  const rows = Object.entries(index.countries).flatMap(([k, v]) => v.levels.map((l, i) => `| ${k} | ${i} | ${(l.extentRad / RAD).toFixed(4)} | ${l.files[String(big)]?.bytes ?? ''} | ${l.files[String(small)]?.bytes ?? ''} |`));
  const total = (s: number) => Object.values(index.countries).reduce((t, v) => t + v.levels.reduce((u, l) => u + (l.files[String(s)]?.bytes ?? 0), 0), 0);
  writeFileSync(IMG_REPORT_PATH, ['# Photos emboîtées — rapport de génération', '', `${EOX.attribution} — ${EOX.license}`, '',
    `- ${Object.keys(index.countries).length} pays, ${rows.length} niveaux ; ${big} px : ${total(big)} octets ; ${small} px : ${total(small)} octets`, '',
    '| Pays | Niveau | Demi-emprise (°) | Octets ' + big + ' | Octets ' + small + ' |', '|---|---:|---:|---:|---:|', ...rows, ''].join('\n'));
  rmSync(TMP, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
