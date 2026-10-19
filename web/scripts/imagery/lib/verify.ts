import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { imagePatchName, type ImageryIndex } from '../../../src/data/imagery';
import { sha256 } from '../../geodata/lib/http';

/** Photos d'une taille comparées à l'index versionné, tous niveaux : absentes, ou présentes mais d'une autre taille ou empreinte. */
export function checkPatches(index: ImageryIndex, size: number, dir: string): { total: number; missing: string[]; corrupt: string[] } {
  const missing: string[] = [], corrupt: string[] = [];
  let total = 0;
  for (const [cca3, meta] of Object.entries(index.countries)) {
    for (const [level, l] of meta.levels.entries()) {
      const want = l.files[String(size)];
      if (!want) throw new Error(`imagery.json : pas de fichier ${size} pour ${cca3} niveau ${level}`);
      total++;
      const name = imagePatchName(cca3, level, size);
      const file = path.join(dir, name);
      if (!existsSync(file)) { missing.push(name); continue; }
      const bytes = readFileSync(file);
      if (bytes.length !== want.bytes || sha256(bytes) !== want.sha256) corrupt.push(name);
    }
  }
  return { total, missing, corrupt };
}
