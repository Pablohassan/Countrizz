import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
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
});
