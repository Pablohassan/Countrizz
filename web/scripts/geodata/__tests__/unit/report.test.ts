import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../../../../src/data/types';
import { renderReport, type ReportRow } from '../../lib/report';

const rec = (cca3: string, lng: number, areaKm2: number): CountryRecord => ({
  id: 1, cca3, cca2: 'XX', name: { fr: cca3, en: cca3 }, capital: { fr: 'X', en: 'X' }, capitals: { fr: ['X'], en: ['X'] }, capitalLngLat: [lng, 0], region: 'R', subregion: 'S', neighbors: [],
  areaKm2, cap: { center: [lng, 0], radiusDeg: 1 }, beacon: [lng, 0], beaconClearanceKm: 10, flag: '',
  outlineSource: 'naturalearth', patch: { sdf: '', size: 1024, center: [lng, 0], extentRad: 0.03, rangeTexels: 32 },
});
const row: ReportRow = {
  cca3: 'AAA', name: 'Aaa', source: 'naturalearth', license: 'NE', areaKm2: 100, refAreaKm2: 100,
  capRadiusDeg: 1, excluded: 0, centerInside: false, insidePixels: 5000, beaconClearanceKm: 0.2, texelKm: 0.4,
};

describe('renderReport', () => {
  it('liste les centres hors pays, les pays sous-texel et les écarts avec la génération précédente', () => {
    const md = renderReport([row], [rec('AAA', 0, 100), rec('OLD', 0, 1)], [rec('AAA', 2, 110), rec('NEW', 0, 1)]);
    expect(md).toContain('Centres de calotte hors du pays');
    expect(md).toMatch(/Lisibles seulement par leur balise[^\n]*\n\nAAA/);
    expect(md).toContain('AAA');
    expect(md).toContain('Ajoutés : NEW');
    expect(md).toContain('Retirés : OLD');
    expect(md).toMatch(/AAA.*calotte déplacée/);
    expect(md).toMatch(/AAA.*surface/);
  });
});
