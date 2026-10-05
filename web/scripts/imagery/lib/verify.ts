import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ImageryIndex } from '../../../src/data/imagery';
import { sha256 } from '../../geodata/lib/http';

/** Patchs d'une taille comparés à l'index versionné : absents, ou présents mais d'une autre taille ou empreinte. */
export function checkPatches(index: ImageryIndex, size: number, dir: string): { total: number; missing: string[]; corrupt: string[] } {
  const missing: string[] = [], corrupt: string[] = [];
  const entries = Object.entries(index.countries);
  for (const [cca3, meta] of entries) {
    const want = meta.files[String(size)];
    if (!want) throw new Error(`imagery.json : pas de fichier ${size} pour ${cca3}`);
    const name = `${cca3.toLowerCase()}-${size}.ktx2`;
    const file = path.join(dir, name);
    if (!existsSync(file)) { missing.push(name); continue; }
    const bytes = readFileSync(file);
    if (bytes.length !== want.bytes || sha256(bytes) !== want.sha256) corrupt.push(name);
  }
  return { total: entries.length, missing, corrupt };
}
