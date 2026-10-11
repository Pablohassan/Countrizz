import { describe, expect, it } from 'vitest';
import { northUp, toVec } from '../geo/vec';
import { screenPoint } from './project';

const v = { width: 390, height: 844, fovYDeg: 50 };
const at = (lngLat: [number, number], altitude: number, axisY = 0) => {
  const dir = toVec(lngLat);
  return { dir, altitude, up: northUp(dir), cut: false, pitch: 0, axisY };
};

describe('position écran d’un point du globe (spec 2A §5.2)', () => {
  it('le point visé est au centre, visible', () => {
    const s = screenPoint(at([2.35, 48.85], 0.5), v, [2.35, 48.85])!;
    expect(s.x).toBeCloseTo(195, 6);
    expect(s.y).toBeCloseTo(422, 6);
    expect(s.visible).toBe(true);
  });

  it('avec la zone libre, le point visé suit l’axe décalé', () => {
    const s = screenPoint(at([2.35, 48.85], 0.5, 0.26), v, [2.35, 48.85])!;
    expect(s.y).toBeCloseTo(422 - 0.26 * 422, 6);
  });

  it('face cachée : non visible (derrière l’horizon)', () => {
    const s = screenPoint(at([2.35, 48.85], 0.5), v, [-177.65, -48.85]);
    expect(s === null || s.visible === false).toBe(true);
  });

  it('hors du cadre : position rendue, non visible', () => {
    // 11,6° du point visé : devant l'horizon (17,8° à l'altitude 0,05) mais loin hors du champ (12,2° de demi-champ)
    const s = screenPoint(at([2.35, 48.85], 0.05), v, [20, 48.85])!;
    expect(s).not.toBeNull();
    expect(s.visible).toBe(false);
  });
});
