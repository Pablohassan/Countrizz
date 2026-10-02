import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import type { CountryRecord, LngLat } from '../../../../src/data/types';
import { EARTH_RADIUS_KM } from '../../config';
import { samplePatchPng } from '../../lib/patch';
import { isSubTexel } from '../../lib/report';
import { OUT_DIR } from '../../paths';

export function loadCountries(): CountryRecord[] {
  const p = path.join(OUT_DIR, 'countries.json');
  if (!existsSync(p)) throw new Error('public/data/countries.json absent : lancer `npm run geodata` avant `npm run test:data`');
  return JSON.parse(readFileSync(p, 'utf8')) as CountryRecord[];
}

const cache = new Map<string, PNG>();
export function sample(rec: CountryRecord, p: LngLat): { r: number; g: number } {
  let png = cache.get(rec.cca3);
  if (!png) { png = PNG.sync.read(readFileSync(path.join(OUT_DIR, rec.patch.sdf))); cache.set(rec.cca3, png); }
  const s = samplePatchPng(png, rec.patch, p);
  if (!s) throw new Error(`${p} hors de l'emprise du patch ${rec.cca3}`);
  return s;
}

export const byCca3 = (all: CountryRecord[], cca3: string): CountryRecord => {
  const r = all.find((c) => c.cca3 === cca3);
  if (!r) throw new Error(`${cca3} absent de countries.json`);
  return r;
};

/** Côté d'un texel du patch, en km. */
export const texelKm = (c: CountryRecord): number => (2 * c.patch.extentRad * EARTH_RADIUS_KM) / c.patch.size;

/** La balise est-elle assez loin du bord pour que le remplissage du patch la couvre ? (même règle que le build) */
export const beaconReadable = (c: CountryRecord): boolean => !isSubTexel({ beaconClearanceKm: c.beaconClearanceKm, texelKm: texelKm(c) });
