import { describe, expect, it } from 'vitest';
import { ARRIVAL, arrivalCurves, breath, EXPOSURE, exposureGain } from './spotlight';

describe('mise en scène de l’arrivée sur le pays (spec mise en avant §3)', () => {
  it('rien au départ, tout en place après la séquence', () => {
    expect(arrivalCurves(0)).toEqual({ dim: 0, draw: 0, lift: 0, sweep: 0 });
    const end = arrivalCurves(3);
    expect(end.dim).toBe(1);
    expect(end.draw).toBe(1);
    expect(end.lift).toBeCloseTo(1, 6);
    expect(end.sweep).toBe(1);
  });
  it('assombrissement, liseré et reflet ne reculent jamais', () => {
    let prev = arrivalCurves(0);
    for (let t = 0; t <= 2; t += 0.01) {
      const c = arrivalCurves(t);
      for (const k of ['dim', 'draw', 'sweep'] as const) expect(c[k]).toBeGreaterThanOrEqual(prev[k] - 1e-12);
      prev = c;
    }
  });
  it('la pièce se soulève avec un rebond, comme les boutons (≈ 1,12), puis se pose', () => {
    let peak = 0;
    for (let t = 0; t <= 2; t += 0.005) peak = Math.max(peak, arrivalCurves(t).lift);
    expect(peak).toBeGreaterThan(1.08);
    expect(peak).toBeLessThan(1.16);
    expect(arrivalCurves(ARRIVAL.lift.from).lift).toBe(0);
  });
  it('le liseré respire après la séquence, période 2,4 s, entre 0 et 1', () => {
    for (let t = 0; t < 10; t += 0.07) { const b = breath(t); expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThanOrEqual(1); }
    expect(breath(1.3)).toBeCloseTo(breath(1.3 + 2.4), 9);
  });
});

describe('exposition par pays tirée de sa photo (spec mise en avant §2)', () => {
  it('ramène la luminance des terres vers la cible, d’un gain de 1 à 2', () => {
    expect(exposureGain(EXPOSURE.target)).toBeCloseTo(1, 12);
    expect(exposureGain(0.2)).toBe(1);                    // désert : rien
    expect(exposureGain(0.02)).toBe(EXPOSURE.maxGain);    // Suriname : plafonné
    expect(exposureGain(0.036)).toBeCloseTo(EXPOSURE.target / 0.036, 12);
    expect(exposureGain(0)).toBe(EXPOSURE.maxGain);
  });
});
