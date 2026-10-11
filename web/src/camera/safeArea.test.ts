import { describe, expect, it } from 'vitest';
import { limitingHalfAngle } from './framing';
import { MIN_FREE, safeViewport } from './safeArea';

const phone = { width: 390, height: 844, fovYDeg: 50 };
const deg = (r: number) => (r * 180) / Math.PI;

describe('zone libre entre le HUD et la grille (D1)', () => {
  it('sans bandes : tout l’écran, axe au centre', () => {
    expect(safeViewport(phone, null)).toEqual({ zone: phone, axisY: 0 });
    expect(safeViewport(phone, { top: 0, bottom: 0 }).axisY).toBe(0);
  });

  it('HUD 80 px, grille 300 px : zone de 464 px, axe au milieu de la zone', () => {
    const { zone, axisY } = safeViewport(phone, { top: 80, bottom: 300 });
    expect(zone.width).toBe(390);
    expect(zone.height).toBe(464);
    // milieu de la zone : y = 80 + 232 = 312 px ; en NDC : 1 − 2 · 312 / 844
    expect(axisY).toBeCloseTo(1 - (2 * 312) / 844, 12);
    // même champ horizontal, champ vertical réduit dans le rapport des hauteurs
    const tan = (fov: number) => Math.tan((fov * Math.PI) / 360);
    expect(tan(zone.fovYDeg)).toBeCloseTo(tan(50) * (464 / 844), 12);
    expect(deg(Math.atan(tan(zone.fovYDeg) * (zone.width / zone.height)))).toBeCloseTo(deg(Math.atan(tan(50) * (390 / 844))), 9);
    // en portrait, l'angle limitant est l'horizontal, le même dans la zone (à l'arrondi près)
    expect(limitingHalfAngle(zone)).toBeLessThanOrEqual(limitingHalfAngle(phone) + 1e-12);
  });

  it('bandes plus hautes que l’image : réduites ensemble, 20 % de l’image reste libre', () => {
    const { zone, axisY } = safeViewport(phone, { top: 400, bottom: 600 });
    expect(zone.height).toBeCloseTo(844 * MIN_FREE, 9);
    // proportion gardée : top 400/1000, bottom 600/1000 de 675,2 px
    expect(axisY).toBeCloseTo((0.6 * 675.2 - 0.4 * 675.2) / 844, 9);
    expect(Number.isFinite(zone.fovYDeg) && zone.fovYDeg > 0).toBe(true);
  });

  it('valeurs non finies ou négatives : comptées 0', () => {
    expect(safeViewport(phone, { top: Number.NaN, bottom: -50 })).toEqual({ zone: phone, axisY: 0 });
    expect(safeViewport(phone, { top: Infinity, bottom: 0 })).toEqual({ zone: phone, axisY: 0 });
  });
});
