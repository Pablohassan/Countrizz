import { describe, expect, it } from 'vitest';
import { beaconReadable, byCca3, loadCountries, sample } from './helpers';

const all = loadCountries();

describe('pays à cheval sur l’antiméridien', () => {
  it.each([['FJI', 5], ['KIR', 15], ['RUS', 45]] as const)('%s : calotte < %s°', (cca3, maxDeg) => {
    expect(byCca3(all, cca3).cap.radiusDeg).toBeLessThan(maxDeg);
  });

  it.each([['FJI'], ['RUS']] as const)('%s : lisible au texel, balise dedans', (cca3) => {
    const c = byCca3(all, cca3);
    expect(beaconReadable(c)).toBe(true);
    expect(sample(c, c.beacon).r).toBeGreaterThan(128);
  });

  it('KIR : si ses atolls sont sous-texel, sa balise reste à moins d’un texel du pays', () => {
    const c = byCca3(all, 'KIR');
    // R ≥ 124 ⇔ distance signée ≥ −1 texel (128 − 127/32 ≈ 124).
    expect(sample(c, c.beacon).r).toBeGreaterThanOrEqual(beaconReadable(c) ? 129 : 124);
  });
});
