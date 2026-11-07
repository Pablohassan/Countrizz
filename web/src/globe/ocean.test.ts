import { describe, expect, it } from 'vitest';
import { WIND } from '../../scripts/textures/config';
import { coxMunkRoughness, windSpeed, WIND_BANDS, WIND_MAX_MS } from './ocean';

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

describe('vent relevé (NOAA NCEI Blended Seawinds, spec océan §1.2 bis)', () => {
  it('le shader lit la vitesse à l’échelle où le build l’a codée', () => {
    expect(WIND_MAX_MS).toBe(WIND.maxMs);
  });
});
