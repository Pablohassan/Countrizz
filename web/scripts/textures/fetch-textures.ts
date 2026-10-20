import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fetchBytes, sha256 } from '../geodata/lib/http';
import { readJson, writeBytes, writeJson } from '../geodata/lib/io';
import { EOX } from '../imagery/config';
import { snapGrid } from '../imagery/lib/grid';
import { loadMosaic, type FetchedTile } from '../imagery/lib/mosaic';
import { IMG_CACHE_DIR } from '../imagery/paths';
import { DAY_S2, GEBCO_2026, GMGSI, gmgsiFile, TEXTURE_SOURCES } from './config';
import { TEX_CACHE_DIR, TEX_LOCK_PATH } from './paths';

interface LockEntry { url: string; sha256: string; bytes: number }
type Lock = Record<string, LockEntry> & { s2day?: FetchedTile[]; gmgsi?: Record<string, LockEntry> };

async function main(): Promise<void> {
  const lock: Lock = existsSync(TEX_LOCK_PATH) ? readJson(TEX_LOCK_PATH) : {};
  for (const [key, src] of Object.entries(TEXTURE_SOURCES)) {
    const dest = path.join(TEX_CACHE_DIR, src.file);
    const previous = lock[key];
    if (previous && existsSync(dest) && sha256(readFileSync(dest)) === previous.sha256) {
      console.log(`${key} : déjà en cache (${previous.bytes} octets)`);
      continue;
    }
    const url = previous?.url ?? src.url;
    const bytes = await fetchBytes(url);
    if (bytes.length !== src.bytes) throw new Error(`${key} : ${bytes.length} octets au lieu de ${src.bytes} — ${url}`);
    const hash = sha256(bytes);
    if (previous && previous.sha256 !== hash) throw new Error(`${key} : empreinte différente du verrou (${previous.sha256} attendu, ${hash} reçu)`);
    writeBytes(dest, bytes);
    lock[key] = { url, sha256: hash, bytes: bytes.length };
    console.log(`${key} : ${bytes.length} octets`);
  }
  // Altitude GEBCO_2026 : aperçu réduit du COG, lu par plages d'octets, rangé brut (Int16, petit-boutiste)
  const gebco = path.join(TEX_CACHE_DIR, GEBCO_2026.file);
  if (lock.gebco2026 && existsSync(gebco) && sha256(readFileSync(gebco)) === lock.gebco2026.sha256) {
    console.log(`gebco2026 : déjà en cache (${lock.gebco2026.bytes} octets)`);
  } else {
    const { fromUrl } = await import('geotiff');
    const image = await (await fromUrl(GEBCO_2026.url)).getImage(GEBCO_2026.overview);
    if (image.getWidth() !== GEBCO_2026.width || image.getHeight() !== GEBCO_2026.height) throw new Error(`gebco2026 : aperçu ${image.getWidth()} × ${image.getHeight()}`);
    // une rangée de tuiles à la fois : tout l'aperçu d'un coup ouvre des centaines de connexions (ETIMEDOUT constaté)
    const { width: w, height: h } = GEBCO_2026, rows = image.getTileHeight(), band = new Int16Array(w * h);
    for (let y0 = 0; y0 < h; y0 += rows) {
      const y1 = Math.min(h, y0 + rows);
      const [part] = (await image.readRasters({ window: [0, y0, w, y1], interleave: false })) as unknown as Int16Array[];
      band.set(part!, y0 * w);
      process.stdout.write(`\rgebco2026 : ligne ${y1} / ${h}`);
    }
    process.stdout.write('\n');
    const bytes = Buffer.from(band.buffer, band.byteOffset, band.byteLength);
    const hash = sha256(bytes);
    if (lock.gebco2026 && lock.gebco2026.sha256 !== hash) throw new Error(`gebco2026 : empreinte différente du verrou (${lock.gebco2026.sha256} attendu, ${hash} reçu)`);
    writeBytes(gebco, bytes);
    lock.gebco2026 = { url: GEBCO_2026.url, sha256: hash, bytes: bytes.length };
    console.log(`gebco2026 : ${bytes.length} octets`);
  }
  // Nuages GMGSI (spec nuages §1) : une image par jour à la même heure ; la clé du seau (date de création incluse) est
  // listée une fois, puis reprise du verrou.
  lock.gmgsi ??= {};
  for (const day of GMGSI.days) {
    const dest = path.join(TEX_CACHE_DIR, gmgsiFile(day)), prev = lock.gmgsi[day];
    if (prev && existsSync(dest) && sha256(readFileSync(dest)) === prev.sha256) continue;
    let url = prev?.url;
    if (!url) {
      const prefix = `${GMGSI.product}/${day.replaceAll('-', '/')}/${String(GMGSI.hour).padStart(2, '0')}/`;
      const list = await (await fetch(`${GMGSI.bucket}/?list-type=2&prefix=${prefix}`)).text();
      const key = /<Key>([^<]+_s\d{8}\d{2}00000_[^<]+\.nc)<\/Key>/.exec(list)?.[1];
      if (!key) throw new Error(`gmgsi ${day} : aucune image sous ${prefix}`);
      url = `${GMGSI.bucket}/${key}`;
    }
    const bytes = await fetchBytes(url);
    const hash = sha256(bytes);
    if (prev && prev.sha256 !== hash) throw new Error(`gmgsi ${day} : empreinte différente du verrou (${prev.sha256} attendu, ${hash} reçu)`);
    writeBytes(dest, bytes);
    lock.gmgsi[day] = { url, sha256: hash, bytes: bytes.length };
    console.log(`gmgsi ${day} : ${bytes.length} octets`);
  }
  console.log(`gmgsi : ${GMGSI.days.length} images en cache`);
  // Jour Sentinel-2 : réponses WMS en cache ; une empreinte qui change (EOX a refait ses tuiles) arrête tout — retirer
  // l'entrée « s2day » du verrou pour accepter le nouveau rendu après l'avoir regardé.
  const { tiles } = await loadMosaic(snapGrid(DAY_S2.box, DAY_S2.maxStepDeg), { service: EOX.service, cacheDir: IMG_CACHE_DIR, maxPx: EOX.maxPx });
  if (lock.s2day) {
    for (const t of tiles) {
      const prev = lock.s2day.find((p) => p.url === t.url);
      if (prev && prev.sha256 !== t.sha256) throw new Error(`s2day : empreinte différente du verrou pour ${t.url}`);
    }
  }
  lock.s2day = tiles;
  console.log(`s2day : ${tiles.length} requêtes, ${tiles.reduce((s, t) => s + t.bytes, 0)} octets`);
  writeJson(TEX_LOCK_PATH, lock);
}

main().catch((e) => { console.error(e); process.exit(1); });
