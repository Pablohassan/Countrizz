import type { MultiPolygon, Polygon } from 'geojson';
import { areaKm2, forD3 } from './geometry';

export interface Outline {
  geometry: MultiPolygon;
  source: 'geoboundaries' | 'naturalearth';
  license: string;
  note?: string;
}

const DENIED = [/non-?commercial/i, /\bNC\b/];
const ALLOWED = [/open database license/i, /\bodbl\b/i, /public domain/i, /open government licen[cs]e/i,
  /creative commons attribution/i, /\bcc[ -]by\b/i];

export function licenseAllowed(l: string): boolean {
  if (DENIED.some((r) => r.test(l))) return false;
  return ALLOWED.some((r) => r.test(l));
}

const NE_LICENSE = 'Natural Earth (domaine public)';

export function chooseOutline(
  ne: MultiPolygon,
  gb: { geometry: Polygon | MultiPolygon; license: string } | undefined,
  refAreaKm2: number,
  ratio: { min: number; max: number },
): Outline {
  const fallback = (note?: string): Outline => ({ geometry: ne, source: 'naturalearth', license: NE_LICENSE, ...(note ? { note } : {}) });
  if (!gb) return fallback();
  if (!licenseAllowed(gb.license)) return fallback(`licence geoBoundaries refusée : ${gb.license}`);
  const g = forD3(gb.geometry);
  const r = areaKm2(g) / refAreaKm2;
  if (r < ratio.min || r > ratio.max) return fallback(`surface geoBoundaries incohérente (×${r.toFixed(2)} de la référence)`);
  return { geometry: g, source: 'geoboundaries', license: gb.license };
}
