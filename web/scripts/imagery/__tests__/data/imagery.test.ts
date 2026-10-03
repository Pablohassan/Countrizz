import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { FRAMING } from '../../../../src/camera/config';
import type { ImageryIndex } from '../../../../src/data/imagery';
import type { CountryRecord } from '../../../../src/data/types';
import { sha256 } from '../../../geodata/lib/http';
import { readKtx2Header } from '../../../textures/lib/ktx2';
import { EOX, IMAGE_PATCH } from '../../config';
import { imageExtentRad } from '../../lib/patchImage';
import { IMG_INDEX_PATH, IMG_OUT_DIR } from '../../paths';

const countries = JSON.parse(readFileSync(path.resolve(IMG_OUT_DIR, '../../countries.json'), 'utf8')) as CountryRecord[];
const index = (): ImageryIndex => {
  if (!existsSync(IMG_INDEX_PATH)) throw new Error('imagery.json absent : lancer `npm run imagery`');
  return JSON.parse(readFileSync(IMG_INDEX_PATH, 'utf8')) as ImageryIndex;
};

describe('index des patchs image (public/data/imagery.json, versionné)', () => {
  it('attribution et licence EOX 2025 exactes (spec §9)', () => {
    const i = index();
    expect([i.layer, i.year, i.license, i.attribution]).toEqual([EOX.service.layer, EOX.year, EOX.license, EOX.attribution]);
  });
  it('généré au cadrage du jeu (sinon : `npm run imagery` après tout changement de FRAMING)', () => {
    expect(index().framing).toEqual({ margin: FRAMING.margin, minContextDeg: FRAMING.minContextDeg ?? 0 });
  });
  it('les 197 pays, centrés sur leur calotte, à l’emprise de la vue d’arrivée', () => {
    const i = index();
    expect(Object.keys(i.countries).sort()).toEqual(countries.map((c) => c.cca3).sort());
    for (const c of countries) {
      const m = i.countries[c.cca3]!;
      expect(m.center).toEqual(c.cap.center);
      expect(m.extentRad).toBeCloseTo(imageExtentRad(c.cap.radiusDeg, FRAMING, IMAGE_PATCH), 12);
    }
  });
});

describe('fichiers des patchs image (hors dépôt : web/public/data/patches/img)', () => {
  it('chaque fichier de l’index est présent, à sa taille et à son empreinte, sans retournement (KTXorientation rd)', () => {
    const i = index();
    const missing: string[] = [];
    for (const [cca3, m] of Object.entries(i.countries)) {
      for (const [size, f] of Object.entries(m.files)) {
        const p = path.join(IMG_OUT_DIR, `${cca3.toLowerCase()}-${size}.ktx2`);
        if (!existsSync(p)) { missing.push(path.basename(p)); continue; }
        const bytes = readFileSync(p);
        expect([bytes.length, sha256(bytes)]).toEqual([f.bytes, f.sha256]);
        const h = readKtx2Header(bytes);
        expect([h.width, h.height, h.supercompression, h.kv.KTXorientation]).toEqual([Number(size), Number(size), 1, 'rd']);
      }
    }
    expect(missing, 'patchs absents : lancer `npm run imagery`').toEqual([]);
  });

  it('le petit niveau garde la couleur de la terre du grand (réduction sans prémultiplier le masque)', () => {
    // 03/10 : la terre des 1024 sortait noire (alpha = masque mer/terre, prémultiplié par sharp). Décodage par `ktx extract`.
    const tmp = mkdtempSync(path.join(tmpdir(), 'patch-'));
    const landMean = (cca3: string, size: number) => {
      const out = path.join(tmp, `${cca3}-${size}.png`);
      const r = spawnSync('ktx', ['extract', '--transcode', 'rgba8', path.join(IMG_OUT_DIR, `${cca3.toLowerCase()}-${size}.ktx2`), out]);
      if (r.status !== 0) throw new Error(`ktx extract ${cca3}-${size} : ${r.stderr}`);
      const png = PNG.sync.read(readFileSync(out));
      let sum = 0, n = 0;
      for (let i = 0; i < png.width * png.height; i++) {
        if (png.data[i * 4 + 3]! > 8) continue; // terre : alpha ≈ 0
        sum += (png.data[i * 4]! + png.data[i * 4 + 1]! + png.data[i * 4 + 2]!) / 3; n++;
      }
      return sum / n;
    };
    const rows = ['ITA', 'FRA', 'JPN', 'EGY', 'BRA', 'NOR'].map((c) => ({ c, big: landMean(c, 2048), small: landMean(c, 1024) }));
    rmSync(tmp, { recursive: true, force: true });
    for (const { c, big, small } of rows) {
      expect(big, `${c} 2048 : terre`).toBeGreaterThan(20);
      expect(Math.abs(small - big) / big, `${c} : terre 1024 ${small.toFixed(1)} contre 2048 ${big.toFixed(1)}`).toBeLessThan(0.1);
    }
  }, 60_000);
});
