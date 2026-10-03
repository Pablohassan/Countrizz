import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import sharp from 'sharp';
import { polygonsOf } from '../geodata/lib/geometry';
import { readJson, writeJson } from '../geodata/lib/io';
import { EOX } from '../imagery/config';
import { snapGrid } from '../imagery/lib/grid';
import { loadMosaic } from '../imagery/lib/mosaic';
import { IMG_CACHE_DIR } from '../imagery/paths';
import { BUDGET_BYTES, COLOR_SIZES, CREDITS, DAY_S2, SURFACE_SIZE, TEXTURE_SOURCES } from './config';
import { polarFill } from './lib/polarFill';
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

/** Jour pleine résolution (8192 × 4096) : mosaïque Sentinel-2 2025 du cache, glaces polaires de Blue Marble. */
async function daySource(): Promise<string> {
  const png = path.join(TMP, 'day-source.png');
  const { mosaic } = await loadMosaic(snapGrid(DAY_S2.box, DAY_S2.maxStepDeg), { service: EOX.service, cacheDir: IMG_CACHE_DIR, maxPx: EOX.maxPx, offline: true });
  const { width, height } = mosaic.grid;
  const { data: bm } = await sharp(source('day'), { limitInputPixels: false }).resize(width, height, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgb = polarFill(mosaic.rgb, bm, width, height);
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

/** Surface : R = altitude (GEBCO_08, 0 en mer), G = mer (255) / terre (0) d'après Natural Earth ; UASTC linéaire. */
async function surfaceTexture(size: number): Promise<string> {
  const w = size, h = size / 2;
  const { data: elevation } = await sharp(source('elevation'), { limitInputPixels: false })
    .resize(w, h, { kernel: 'lanczos3' }).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  const ne = readJson<FeatureCollection<Polygon | MultiPolygon>>(NE_COUNTRIES);
  const land = rasterizeLandMask(ne.features.flatMap((f) => polygonsOf(f.geometry)) as number[][][][], w, h);
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = land[i] ? elevation[i]! : 0;
    rgb[i * 3 + 1] = land[i] ? 0 : 255;
  }
  const png = path.join(TMP, `surface-${size}.png`);
  await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png({ compressionLevel: 6 }).toFile(png);
  const name = outName('surface', size);
  toktx(['--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18', '--genmipmap', '--assign_oetf', 'linear', '--lower_left_maps_to_s0t0', path.join(TEX_OUT_DIR, name), png]);
  return name;
}

async function main(): Promise<void> {
  checkToktx();
  mkdirSync(TMP, { recursive: true });
  mkdirSync(TEX_OUT_DIR, { recursive: true });
  const names: string[] = [];
  const day = await daySource();
  for (const size of COLOR_SIZES) {
    names.push(await colorTexture('day', size, 192, day));
    names.push(await colorTexture('night', size, 128, source('night')));
  }
  names.push(await surfaceTexture(SURFACE_SIZE));
  writeJson(path.join(TEX_OUT_DIR, 'credits.json'), CREDITS);

  const bytes = Object.fromEntries(names.map((n) => [n, statSync(path.join(TEX_OUT_DIR, n)).size]));
  const tier = (s: string) => bytes[`day-${s}.ktx2`]! + bytes[`night-${s}.ktx2`]! + bytes['surface-4k.ktx2']!;
  const lines = [
    '# Textures globales — rapport de génération', '',
    '| Fichier | Octets |', '|---|---:|',
    ...names.map((n) => `| ${n} | ${bytes[n]} |`), '',
    `- Niveau « standard » (day-4k + night-4k + surface-4k) : ${tier('4k')} octets (budget ${BUDGET_BYTES.standard})`,
    `- Niveau « haute » (day-8k + night-8k + surface-4k) : ${tier('8k')} octets (budget ${BUDGET_BYTES.haute})`, '',
  ];
  writeFileSync(TEX_REPORT_PATH, lines.join('\n'));
  rmSync(TMP, { recursive: true, force: true });
  console.log(lines.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
