import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUDGET_BYTES } from '../../config';
import { readKtx2Header } from '../../lib/ktx2';
import { TEX_OUT_DIR } from '../../paths';

const FILES = [
  { name: 'day-8k.ktx2', width: 8192, supercompression: 1 },
  { name: 'day-4k.ktx2', width: 4096, supercompression: 1 },
  { name: 'night-8k.ktx2', width: 8192, supercompression: 1 },
  { name: 'night-4k.ktx2', width: 4096, supercompression: 1 },
  { name: 'surface-4k.ktx2', width: 4096, supercompression: 2 },
];
const size = (n: string) => statSync(path.join(TEX_OUT_DIR, n)).size;

describe('textures globales générées', () => {
  for (const f of FILES) {
    it(`${f.name} : dimensions, mipmaps complets, origine en bas à gauche`, () => {
      const p = path.join(TEX_OUT_DIR, f.name);
      if (!existsSync(p)) throw new Error(`${f.name} absent : lancer \`npm run textures:fetch && npm run textures\``);
      const h = readKtx2Header(readFileSync(p));
      expect([h.width, h.height]).toEqual([f.width, f.width / 2]);
      expect(h.levels).toBe(Math.log2(f.width) + 1);
      expect(h.supercompression).toBe(f.supercompression);
      expect(h.kv.KTXorientation).toBe('ru');
    });
  }
  it('tient dans le budget de chaque niveau de qualité', () => {
    expect(size('day-4k.ktx2') + size('night-4k.ktx2') + size('surface-4k.ktx2')).toBeLessThanOrEqual(BUDGET_BYTES.standard);
    expect(size('day-8k.ktx2') + size('night-8k.ktx2') + size('surface-4k.ktx2')).toBeLessThanOrEqual(BUDGET_BYTES.haute);
  });
  it('publie les crédits des quatre couches', () => {
    expect(JSON.parse(readFileSync(path.join(TEX_OUT_DIR, 'credits.json'), 'utf8'))).toHaveLength(4);
  });
  it('le jour crédite EOxCloudless 2025 avec l’attribution exacte (spec §9)', () => {
    const credits = JSON.parse(readFileSync(path.join(TEX_OUT_DIR, 'credits.json'), 'utf8')) as { layer: string; text: string }[];
    expect(credits.find((c) => c.layer === 'jour')!.text).toContain('EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)');
  });
});
