import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ImageryIndex } from '../../../../src/data/imagery';
import { sha256 } from '../../../geodata/lib/http';
import { checkPatches } from '../../lib/verify';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'verify-'));
  dirs.push(dir);
  const a = Buffer.from('patch fra'), b = Buffer.from('patch ita');
  const index = { countries: {
    FRA: { files: { '1024': { bytes: a.length, sha256: sha256(a) } } },
    ITA: { files: { '1024': { bytes: b.length, sha256: sha256(b) } } },
  } } as unknown as ImageryIndex;
  return { dir, index, a, b };
}

describe('checkPatches', () => {
  it('rien à signaler quand chaque fichier a la taille et l’empreinte de l’index', () => {
    const { dir, index, a, b } = fixture();
    writeFileSync(path.join(dir, 'fra-1024.ktx2'), a);
    writeFileSync(path.join(dir, 'ita-1024.ktx2'), b);
    expect(checkPatches(index, 1024, dir)).toEqual({ total: 2, missing: [], corrupt: [] });
  });

  it('distingue un fichier absent d’un fichier altéré, même à taille égale', () => {
    const { dir, index, a } = fixture();
    writeFileSync(path.join(dir, 'fra-1024.ktx2'), Buffer.from('patch FRA')); // même taille, autre contenu
    expect(checkPatches(index, 1024, dir)).toEqual({ total: 2, missing: ['ita-1024.ktx2'], corrupt: ['fra-1024.ktx2'] });
    writeFileSync(path.join(dir, 'fra-1024.ktx2'), a);
    expect(checkPatches(index, 1024, dir).corrupt).toEqual([]);
  });

  it('une taille absente de l’index pour un pays est une erreur, pas un fichier ignoré', () => {
    const { dir, index } = fixture();
    expect(() => checkPatches(index, 2048, dir)).toThrow(/2048 pour FRA/);
  });
});
