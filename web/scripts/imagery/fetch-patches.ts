import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ImageryIndex } from '../../src/data/imagery';
import { readJson } from '../geodata/lib/io';
import { IMAGE_PATCH } from './config';
import { checkPatches } from './lib/verify';
import { IMG_CACHE_DIR, IMG_INDEX_PATH, IMG_OUT_DIR } from './paths';

/**
 * Patchs image hors dépôt (décision du 02/10) publiés en archives sur une Release GitHub, sous la licence de l'imagerie
 * (CC BY-NC-SA 4.0, attribution EOX dans imagery.json et dans LICENCE-IMAGERIE.txt) ; chaque fichier est contrôlé contre
 * l'empreinte versionnée de `public/data/imagery.json`.
 *
 * - `npm run imagery:fetch [1024|2048 …]` : télécharge les tailles manquantes ou altérées (toutes par défaut).
 * - `npm run imagery:fetch -- --pack` : fabrique les archives à publier (scripts/imagery/.cache/release) depuis les patchs
 *   locaux, après contrôle.
 */
export const RELEASE = { repo: 'Pablohassan/Countrizz', tag: 'imagerie-2025' } as const;
export const assetName = (size: number) => `patchs-img-${size}.tar`;
const assetUrl = (size: number) => `https://github.com/${RELEASE.repo}/releases/download/${RELEASE.tag}/${assetName(size)}`;

function tar(args: string[]): void {
  const r = spawnSync('tar', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`tar ${args.join(' ')} : code ${r.status}`);
}

function report(size: number, r: ReturnType<typeof checkPatches>): string {
  return `${size} px : ${r.total - r.missing.length - r.corrupt.length}/${r.total} conformes` +
    (r.missing.length ? `, ${r.missing.length} absents` : '') + (r.corrupt.length ? `, altérés : ${r.corrupt.join(' ')}` : '');
}

function pack(index: ImageryIndex, sizes: number[], outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  for (const size of sizes) {
    const r = checkPatches(index, size, IMG_OUT_DIR);
    if (r.missing.length || r.corrupt.length) throw new Error(`patchs locaux non conformes, rien n'est empaqueté — ${report(size, r)}`);
    const names = Object.keys(index.countries).map((c) => `${c.toLowerCase()}-${size}.ktx2`);
    tar(['-cf', path.join(outDir, assetName(size)), '-C', IMG_OUT_DIR, ...names]);
    console.log(`${assetName(size)} : ${names.length} patchs`);
  }
  writeFileSync(path.join(outDir, 'LICENCE-IMAGERIE.txt'), [
    `Patchs image de Countrizz (${index.layer}), dérivés de l'imagerie EOxCloudless.`,
    `Attribution : ${index.attribution}`,
    `Licence : ${index.license} — https://creativecommons.org/licenses/by-nc-sa/4.0/ ; conditions EOX : https://cloudless.eox.at/license-non-commercial`,
    'Usage non commercial uniquement ; toute œuvre dérivée est partagée sous la même licence.', ''].join('\n'));
}

async function fetchSize(index: ImageryIndex, size: number): Promise<void> {
  const before = checkPatches(index, size, IMG_OUT_DIR);
  if (!before.missing.length && !before.corrupt.length) { console.log(`${report(size, before)} — rien à télécharger`); return; }
  const tmp = mkdtempSync(path.join(tmpdir(), 'patchs-'));
  try {
    const res = await fetch(assetUrl(size));
    if (!res.ok) throw new Error(`${assetUrl(size)} : HTTP ${res.status}`);
    const file = path.join(tmp, assetName(size));
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    mkdirSync(IMG_OUT_DIR, { recursive: true });
    tar(['-xf', file, '-C', IMG_OUT_DIR]);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  const after = checkPatches(index, size, IMG_OUT_DIR);
  if (after.missing.length || after.corrupt.length) throw new Error(`archive non conforme à imagery.json — ${report(size, after)}`);
  console.log(report(size, after));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const index = readJson<ImageryIndex>(IMG_INDEX_PATH);
  const asked = args.filter((a) => /^\d+$/.test(a)).map(Number);
  const sizes = asked.length ? asked : [...IMAGE_PATCH.sizes];
  if (args.includes('--pack')) return pack(index, sizes, path.join(IMG_CACHE_DIR, 'release'));
  for (const size of sizes) await fetchSize(index, size);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
