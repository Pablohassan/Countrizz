import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { chooseOutline, licenseAllowed } from '../../lib/outline';
import { forD3 } from '../../lib/geometry';

const ccw = (s: number): Polygon => ({ type: 'Polygon', coordinates: [[[0, 0], [s, 0], [s, s], [0, s], [0, 0]]] });
const ne = forD3(ccw(1));            // ≈ 12 364 km²
const ratio = { min: 0.5, max: 2 };
const ODBL = 'Open Data Commons Open Database License 1.0';

describe('licenseAllowed', () => {
  it.each([
    [ODBL, true],
    ['Creative Commons Attribution 4.0 International (CC BY 4.0)', true],
    ['Public Domain', true],
    ['Open Government Licence v3.0', true],
    ['CC0 1.0 Universal (CC0 1.0) Public Domain Dedication', true],
    ['Creative Commons Attribution-NonCommercial 4.0', false],
    ['CC BY-NC-SA 4.0', false],
    ['Licence inconnue', false],
    // licences réelles rencontrées le 02/10, hors des familles connues : refusées (registre, Task 3)
    ['Federal Office of Topography swisstopo License', false],
    ['Pixabay License for Content', false],
  ])('%s → %s', (l, ok) => expect(licenseAllowed(l)).toBe(ok));
});

describe('chooseOutline', () => {
  it('sans geoBoundaries : Natural Earth', () => {
    expect(chooseOutline(ne, undefined, 12364, ratio).source).toBe('naturalearth');
  });
  it('geoBoundaries ODbL, anneau anti-horaire : remis dans le sens d3 et retenu', () => {
    const r = chooseOutline(ne, { geometry: ccw(0.5), license: ODBL }, 3091, ratio);
    expect(r.source).toBe('geoboundaries');
  });
  it('licence non commerciale : refusée, avec une note', () => {
    const r = chooseOutline(ne, { geometry: ccw(1), license: 'CC BY-NC 4.0' }, 12364, ratio);
    expect(r.source).toBe('naturalearth');
    expect(r.note).toMatch(/licence/);
  });
  it('surface incohérente avec la référence : refusée, avec une note', () => {
    const r = chooseOutline(ne, { geometry: ccw(3), license: ODBL }, 12364, ratio);
    expect(r.source).toBe('naturalearth');
    expect(r.note).toMatch(/surface/);
  });
});
