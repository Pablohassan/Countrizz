import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fetchBytes, sha256 } from '../geodata/lib/http';
import { readJson, writeBytes, writeJson } from '../geodata/lib/io';
import { EOX } from '../imagery/config';
import { snapGrid } from '../imagery/lib/grid';
import { loadMosaic, type FetchedTile } from '../imagery/lib/mosaic';
import { IMG_CACHE_DIR } from '../imagery/paths';
import { DAY_S2, TEXTURE_SOURCES } from './config';
import { TEX_CACHE_DIR, TEX_LOCK_PATH } from './paths';

interface LockEntry { url: string; sha256: string; bytes: number }
type Lock = Record<string, LockEntry> & { s2day?: FetchedTile[] };

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
