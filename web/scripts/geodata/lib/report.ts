import { geoDistance } from 'd3-geo';
import type { CountryRecord } from '../../../src/data/types';

export interface ReportRow {
  cca3: string;
  name: string;
  source: string;
  license: string;
  areaKm2: number;
  refAreaKm2: number;
  capRadiusDeg: number;
  excluded: number;
  centerInside: boolean;
  insidePixels: number;
  beaconClearanceKm: number;
  texelKm: number;
  note?: string;
}

/** Une balise à moins de 1,5 texel du bord : le remplissage du patch ne suffit pas à lire le pays. */
export const isSubTexel = (r: { beaconClearanceKm: number; texelKm: number }) => r.beaconClearanceKm < 1.5 * r.texelKm;

const deg = (a: [number, number], b: [number, number]) => (geoDistance(a, b) * 180) / Math.PI;

export function renderReport(rows: ReportRow[], previous: CountryRecord[] | null, current: CountryRecord[]): string {
  const out: string[] = ['# Rapport de génération des données pays', ''];
  out.push(`${rows.length} pays.`, '');

  out.push('## Écarts avec la génération précédente', '');
  if (!previous) out.push('Première génération.', '');
  else {
    const prev = new Map(previous.map((r) => [r.cca3, r]));
    const cur = new Map(current.map((r) => [r.cca3, r]));
    out.push(`Ajoutés : ${[...cur.keys()].filter((k) => !prev.has(k)).join(', ') || 'aucun'}`);
    out.push(`Retirés : ${[...prev.keys()].filter((k) => !cur.has(k)).join(', ') || 'aucun'}`, '');
    for (const [k, c] of cur) {
      const p = prev.get(k);
      if (!p) continue;
      const moved = deg(p.cap.center, c.cap.center);
      const changes: string[] = [];
      if (moved > 0.5) changes.push(`calotte déplacée de ${moved.toFixed(2)}°`);
      if (Math.abs(c.cap.radiusDeg - p.cap.radiusDeg) > 0.1 * p.cap.radiusDeg) changes.push(`rayon ${p.cap.radiusDeg.toFixed(2)}° → ${c.cap.radiusDeg.toFixed(2)}°`);
      if (Math.abs(c.areaKm2 - p.areaKm2) > 0.05 * p.areaKm2) changes.push(`surface ${p.areaKm2} → ${c.areaKm2} km²`);
      if (changes.length) out.push(`- ${k} : ${changes.join(' ; ')}`);
    }
    out.push('');
  }

  out.push('## Centres de calotte hors du pays (informatif : archipels, pays en croissant)', '');
  out.push(rows.filter((r) => !r.centerInside).map((r) => r.cca3).join(' ') || 'aucun', '');

  out.push('## Lisibles seulement par leur balise (balise à moins de 1,5 texel du bord : atolls, micro-territoires)', '');
  out.push(rows.filter(isSubTexel).map((r) => r.cca3).join(' ') || 'aucun', '');

  out.push('## Détail par pays', '');
  out.push('| cca3 | nom | contour | licence | surface km² | réf. km² | rayon ° | polygones écartés | pixels dedans | balise→bord km | texel km | note |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    out.push(`| ${r.cca3} | ${r.name} | ${r.source} | ${r.license} | ${Math.round(r.areaKm2)} | ${r.refAreaKm2} | ${r.capRadiusDeg.toFixed(3)} | ${r.excluded} | ${r.insidePixels} | ${r.beaconClearanceKm.toFixed(2)} | ${r.texelKm.toFixed(3)} | ${r.note ?? ''} |`);
  }
  return out.join('\n') + '\n';
}
