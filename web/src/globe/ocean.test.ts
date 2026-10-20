import { describe, expect, it } from 'vitest';
import { coxMunkRoughness, windSpeed, WIND_BANDS } from './ocean';

describe('reflet de la mer (Cox et Munk)', () => {
  it('mer d’huile : rugosité de 0,003^¼ ; plus de vent, mer plus rugueuse', () => {
    expect(coxMunkRoughness(0)).toBeCloseTo(0.003 ** 0.25, 12);
    expect(coxMunkRoughness(7)).toBeCloseTo((0.003 + 0.00512 * 7) ** 0.25, 12);
    expect(coxMunkRoughness(12)).toBeGreaterThan(coxMunkRoughness(4));
  });
  it('vent par latitude : calme à l’équateur, alizés, vents d’ouest forts au sud ; paliers repris exactement', () => {
    for (const [lat, ms] of WIND_BANDS) expect(windSpeed(lat)).toBeCloseTo(ms, 12);
    expect(windSpeed(0)).toBe(4);
    expect(windSpeed(-50)).toBe(11);
    expect(windSpeed(15)).toBeGreaterThan(windSpeed(0));
  });
});
