import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import sharp from 'sharp';
import { polygonsOf } from '../geodata/lib/geometry';
import { readJson, writeJson } from '../geodata/lib/io';
import { EOX } from '../imagery/config';
import { snapGrid } from '../imagery/lib/grid';
import { loadMosaic } from '../imagery/lib/mosaic';
import { IMG_CACHE_DIR } from '../imagery/paths';
import { BUDGET_BYTES, CLOUDS_SIZE, COLOR_SIZES, CREDITS, DAY_S2, ELEVATION_MAX_M, GEBCO_2026, GMGSI, gmgsiFile, POLAR_TOP_KM, SURFACE_SIZE, TEXTURE_SOURCES, WAVES } from './config';
import { CLOUD_TOP_MAX_KM, cloudCover, cloudTop, modeAKelvin, polarWeight, toEquirect } from './lib/cloudsIr';
import { encodeElevation } from './lib/elevation';
import { seaFill } from './lib/seaFill';
import { waveSet, waveTexture } from './lib/waves';
import { polarFill } from './lib/polarFill';
import { seamless } from './lib/seamless';
import { rasterizeLandMask } from './lib/landMask';
import { NE_COUNTRIES, TEX_CACHE_DIR, TEX_OUT_DIR, TEX_REPORT_PATH } from './paths';

sharp.cache(false);
const TMP = path.join(TEX_CACHE_DIR, 'tmp');
const source = (k: keyof typeof TEXTURE_SOURCES) => path.join(TEX_CACHE_DIR, TEXTURE_SOURCES[k].file);
const outName = (name: string, size: number) => `${name}-${size / 1024}k.ktx2`;

function toktx(args: string[]): void {
  const r = spawnSync('toktx', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`toktx ${args.join(' ')} : code ${r.status}`);
}

function checkToktx(): void {
  const r = spawnSync('toktx', ['--version'], { encoding: 'utf8' });
  if (r.status !== 0 || !`${r.stdout}${r.stderr}`.includes('v4.')) {
    throw new Error('toktx 4.x introuvable : installer KTX-Software 4.4 (https://github.com/KhronosGroup/KTX-Software/releases)');
  }
}

/** Masque terre (1) / mer (0) de Natural Earth, `w × h`, ligne 0 au nord. */
function landMask(w: number, h: number): Uint8Array {
  const ne = readJson<FeatureCollection<Polygon | MultiPolygon>>(NE_COUNTRIES);
  return rasterizeLandMask(ne.features.flatMap((f) => polygonsOf(f.geometry)) as number[][][][], w, h);
}

/** Jour pleine résolution (8192 × 4096) : mosaïque Sentinel-2 2025 du cache ; mer et glaces polaires de Blue Marble. */
async function daySource(): Promise<string> {
  const png = path.join(TMP, 'day-source.png');
  const { mosaic } = await loadMosaic(snapGrid(DAY_S2.box, DAY_S2.maxStepDeg), { service: EOX.service, cacheDir: IMG_CACHE_DIR, maxPx: EOX.maxPx, offline: true });
  const { width, height } = mosaic.grid;
  const { data: bm } = await sharp(source('day'), { limitInputPixels: false }).resize(width, height, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  // mer de Blue Marble (spec océan §1.1) : masque de mer adouci d'un pixel environ, la côte se mêle
  const land = landMask(width, height);
  const seaHard = Buffer.alloc(width * height);
  for (let i = 0; i < seaHard.length; i++) seaHard[i] = land[i] ? 0 : 255;
  const { data: sea, info } = await sharp(seaHard, { raw: { width, height, channels: 1 } }).blur(1.2).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  // un masque à plusieurs canaux décalerait les lignes de la mer (rayures constatées le 20/10)
  if (info.channels !== 1 || sea.length !== width * height) throw new Error(`masque de mer : ${info.channels} canaux, ${sea.length} octets`);
  const rgb = seaFill(polarFill(mosaic.rgb, bm, width, height), bm, sea);
  await sharp(rgb, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 6 }).toFile(png);
  return png;
}

/** Couleur (jour, nuit) : ETC1S sRGB, mipmaps, origine en bas à gauche (sinon le globe sort retourné nord-sud). */
async function colorTexture(key: 'day' | 'night', size: number, qlevel: number, from: string): Promise<string> {
  const png = path.join(TMP, `${key}-${size}.png`);
  await sharp(from, { limitInputPixels: false }).resize(size, size / 2, { kernel: 'lanczos3' }).removeAlpha().png({ compressionLevel: 6 }).toFile(png);
  const name = outName(key, size);
  toktx(['--t2', '--encode', 'etc1s', '--clevel', '2', '--qlevel', String(qlevel), '--genmipmap', '--assign_oetf', 'srgb', '--lower_left_maps_to_s0t0', path.join(TEX_OUT_DIR, name), png]);
  return name;
}

/** Surface : R = altitude (GEBCO_2026, 0 → ELEVATION_MAX_M, 0 en mer), G = mer (255) / terre (0) d'après Natural Earth ; UASTC linéaire. */
async function surfaceTexture(size: number): Promise<string> {
  const w = size, h = size / 2;
  const raw = readFileSync(path.join(TEX_CACHE_DIR, GEBCO_2026.file));
  const gebco = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
  const land = landMask(w, h);
  const elevation = encodeElevation(gebco, GEBCO_2026.width, GEBCO_2026.height, w, h, ELEVATION_MAX_M, land);
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = elevation[i]!;
    rgb[i * 3 + 1] = land[i] ? 0 : 255;
  }
  const png = path.join(TMP, `surface-${size}.png`);
  await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png({ compressionLevel: 6 }).toFile(png);
  // grille du relief soulevé pour les frontières (src/globe/relief.ts) : moyenne 8 × 8 = le niveau 3 de la mipmap
  const g = 8, gw = w / g, gh = h / g, grid = Buffer.alloc(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let sum = 0;
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) sum += elevation[(y * g + j) * w + x * g + i]!;
    grid[y * gw + x] = Math.round(sum / (g * g));
  }
  await sharp(grid, { raw: { width: gw, height: gh, channels: 1 } }).png({ compressionLevel: 9 }).toFile(path.join(TEX_OUT_DIR, `relief-${gw}.png`));
  const name = outName('surface', size);
  toktx(['--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18', '--genmipmap', '--assign_oetf', 'linear', '--lower_left_maps_to_s0t0', path.join(TEX_OUT_DIR, name), png]);
  return name;
}

/** Grille GMGSI d'un jour : comptes mode A (Float32) et latitudes des lignes (décroissantes, pas Mercator). */
async function readGmgsi(day: string): Promise<{ counts: Float32Array; lat: Float32Array }> {
  const h5wasm = (await import('h5wasm/node')).default;
  await h5wasm.ready;
  const file = new h5wasm.File(path.join(TEX_CACHE_DIR, gmgsiFile(day)), 'r');
  try {
    const data = file.get('data') as InstanceType<typeof h5wasm.Dataset>, latDs = file.get('lat') as InstanceType<typeof h5wasm.Dataset>;
    if (String(data.shape) !== String([1, GMGSI.height, GMGSI.width])) throw new Error(`gmgsi ${day} : grille ${String(data.shape)}`);
    return { counts: Float32Array.from(data.value as Float32Array), lat: Float32Array.from(latDs.slice([[0, GMGSI.height], [0, 1]]) as Float32Array) };
  } finally { file.close(); }
}

/**
 * Nuages (spec nuages §1–2) : RVB = couverture, alpha = hauteur du sommet (0 → CLOUD_TOP_MAX_KM), d'après l'infrarouge
 * GMGSI du dernier jour contre le sol le plus chaud des 14 ; au-delà de ±72°, nuages de Blue Marble à hauteur fixe.
 * ETC1S linéaire (deux tranches, couleur et alpha), mipmaps, origine en bas à gauche.
 */
async function cloudsTexture(size: number): Promise<string> {
  const w = size, h = size / 2, n = GMGSI.width * GMGSI.height;
  const clear = new Float32Array(n).fill(-Infinity);
  let now: Float32Array | null = null, lat: Float32Array | null = null;
  for (const day of GMGSI.days) {
    const g = await readGmgsi(day);
    for (let i = 0; i < n; i++) if (g.counts[i]! >= 0) clear[i] = Math.max(clear[i]!, modeAKelvin(g.counts[i]!));
    now = g.counts; lat = g.lat;
  }
  // températures ramenées à la grille de sortie, où le masque terre/mer est connu ; un pixel sans mesure reste clair
  const tNow = Float32Array.from(now!, (c, i) => (c >= 0 ? modeAKelvin(c) : clear[i]!));
  const clearEq = toEquirect(clear, GMGSI.width, GMGSI.height, lat!, w, h), nowEq = toEquirect(tNow, GMGSI.width, GMGSI.height, lat!, w, h);
  const land = landMask(w, h), coverEq = new Float32Array(w * h), topEq = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (Number.isNaN(clearEq[i]!)) { coverEq[i] = NaN; continue; }
    coverEq[i] = cloudCover(nowEq[i]!, clearEq[i]!, !land[i]);
    topEq[i] = cloudTop(clearEq[i]! - nowEq[i]!);
  }
  const bm = await sharp(source('clouds'), { limitInputPixels: false }).extractChannel(0).resize(w, h, { kernel: 'lanczos3' }).raw().toBuffer();
  const c8 = Buffer.alloc(w * h), a8 = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) {
    const p = polarWeight(90 - ((y + 0.5) * 180) / h);
    for (let x = 0; x < w; x++) {
      const i = y * w + x, inside = !Number.isNaN(coverEq[i]!), q = inside ? p : 1;
      c8[i] = Math.round(255 * ((inside ? coverEq[i]! : 0) * (1 - q) + (bm[i]! / 255) * q));
      a8[i] = Math.round(255 * ((inside ? topEq[i]! : 0) * (1 - q) + (POLAR_TOP_KM / CLOUD_TOP_MAX_KM) * q));
    }
  }
  const seam = Math.round(w / 96), cs = seamless(c8, w, h, seam), as = seamless(a8, w, h, seam);
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = cs[i]!; rgba[i * 4 + 3] = as[i]!; }
  const png = path.join(TMP, `clouds-${size}.png`);
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 6 }).toFile(png);
  const name = outName('clouds', size);
  toktx(['--t2', '--encode', 'etc1s', '--clevel', '2', '--qlevel', '128', '--genmipmap', '--assign_oetf', 'linear', '--lower_left_maps_to_s0t0', path.join(TEX_OUT_DIR, name), png]);
  return name;
}

/** Vagues (spec océan §1.3) : pentes répétables en R, G (128 = plat) ; UASTC linéaire, mipmaps. */
async function wavesTexture(): Promise<string> {
  const { size, count } = WAVES;
  const { rg } = waveTexture(size, waveSet(count));
  const rgb = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) { rgb[i * 3] = rg[i * 2]!; rgb[i * 3 + 1] = rg[i * 2 + 1]!; rgb[i * 3 + 2] = 128; }
  const png = path.join(TMP, `waves-${size}.png`);
  await sharp(rgb, { raw: { width: size, height: size, channels: 3 } }).png().toFile(png);
  const name = `waves-${size}.ktx2`;
  toktx(['--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18', '--genmipmap', '--assign_oetf', 'linear', path.join(TEX_OUT_DIR, name), png]);
  return name;
}

async function main(): Promise<void> {
  checkToktx();
  mkdirSync(TMP, { recursive: true });
  mkdirSync(TEX_OUT_DIR, { recursive: true });
  // `npm run textures -- --seulement clouds` : une seule texture refaite, les autres reprises telles qu'elles sont sur le disque
  const seulement = process.argv.includes('--seulement') ? process.argv[process.argv.indexOf('--seulement') + 1] : null;
  const faire = (k: string) => seulement === null || seulement === k;
  const names: string[] = [];
  const day = faire('day') ? await daySource() : null;
  for (const size of COLOR_SIZES) {
    names.push(day ? await colorTexture('day', size, 192, day) : outName('day', size));
    names.push(faire('night') ? await colorTexture('night', size, 128, source('night')) : outName('night', size));
  }
  names.push(faire('surface') ? await surfaceTexture(SURFACE_SIZE) : outName('surface', SURFACE_SIZE));
  names.push(faire('clouds') ? await cloudsTexture(CLOUDS_SIZE) : outName('clouds', CLOUDS_SIZE));
  names.push(faire('waves') ? await wavesTexture() : `waves-${WAVES.size}.ktx2`);
  writeJson(path.join(TEX_OUT_DIR, 'credits.json'), CREDITS);

  const bytes = Object.fromEntries(names.map((n) => [n, statSync(path.join(TEX_OUT_DIR, n)).size]));
  const tier = (s: string) => bytes[`day-${s}.ktx2`]! + bytes[`night-${s}.ktx2`]! + bytes['surface-4k.ktx2']! + bytes['clouds-4k.ktx2']! + bytes[`waves-${WAVES.size}.ktx2`]!;
  const lines = [
    '# Textures globales — rapport de génération', '',
    '| Fichier | Octets |', '|---|---:|',
    ...names.map((n) => `| ${n} | ${bytes[n]} |`), '',
    `- Niveau « standard » (day-4k + night-4k + surface-4k + clouds-4k + vagues) : ${tier('4k')} octets (budget ${BUDGET_BYTES.standard})`,
    `- Niveau « haute » (day-8k + night-8k + surface-4k + clouds-4k + vagues) : ${tier('8k')} octets (budget ${BUDGET_BYTES.haute})`, '',
  ];
  writeFileSync(TEX_REPORT_PATH, lines.join('\n'));
  rmSync(TMP, { recursive: true, force: true });
  console.log(lines.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
