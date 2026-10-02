import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fetchBytes, sha256 } from '../geodata/lib/http';
import { readJson, writeBytes, writeJson } from '../geodata/lib/io';
import { TEXTURE_SOURCES } from './config';
import { TEX_CACHE_DIR, TEX_LOCK_PATH } from './paths';

interface LockEntry { url: string; sha256: string; bytes: number }

async function main(): Promise<void> {
  const lock: Record<string, LockEntry> = existsSync(TEX_LOCK_PATH) ? readJson(TEX_LOCK_PATH) : {};
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
  writeJson(TEX_LOCK_PATH, lock);
}

main().catch((e) => { console.error(e); process.exit(1); });
