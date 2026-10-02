import { describe, expect, it } from 'vitest';
import { frameAltitude, limitingHalfAngle, overviewAltitude } from './framing';

const deg = Math.PI / 180;
const desktop = { width: 1300, height: 750, fovYDeg: 50 };
const phone = { width: 390, height: 844, fovYDeg: 50 };
const params = { k: 1, margin: 1.2, floor: 0.0005, overview: { landscape: 1.4, portrait: 2.2 } };

describe('demi-champ limitant', () => {
  it('vertical en paysage', () => {
    expect(limitingHalfAngle(desktop)).toBeCloseTo(25 * deg, 12);
  });
  it('horizontal en portrait : atan(tan 25° × 390/844) = 12,1598°', () => {
    expect(limitingHalfAngle(phone) / deg).toBeCloseTo(12.1598, 4);
  });
});

describe('altitude de cadrage : k·(cos θ + sin θ / tan(α/m)) − 1, bornée', () => {
  it('France (θ = 4,8665°) au bureau : 0,21933', () => {
    expect(frameAltitude(4.866456269099665, desktop, params)).toBeCloseTo(0.21933, 5);
  });
  it('la même France recule en portrait : 0,47106', () => {
    expect(frameAltitude(4.866456269099665, phone, params)).toBeCloseTo(0.47106, 5);
  });
  it('k multiplie la distance au centre de la Terre', () => {
    expect(frameAltitude(4.866456269099665, desktop, { ...params, k: 1.2 })).toBeCloseTo(1.2 * 1.21933 - 1, 5);
  });
  it('plancher pour un point, plafond à la vue d’ensemble', () => {
    expect(frameAltitude(0, desktop, params)).toBe(params.floor);
    expect(frameAltitude(80, desktop, params)).toBe(1.4);
    expect(frameAltitude(80, phone, params)).toBe(2.2);
  });
  it('contexte minimal θ_min : un pays plus petit est cadré comme une calotte de θ_min, les autres ne bougent pas', () => {
    const withContext = { ...params, minContextDeg: 3 };
    // θ = 3° : cos 3° + sin 3° / tan(20,8333°) − 1 = 0,136164
    expect(frameAltitude(0.381, desktop, withContext)).toBeCloseTo(0.136164, 5);
    expect(frameAltitude(4.866456269099665, desktop, withContext)).toBeCloseTo(0.21933, 5);
  });
  it('vue d’ensemble : 1,4 en paysage, 2,2 en portrait (valeurs de l’ancien jeu)', () => {
    expect(overviewAltitude(desktop, params)).toBe(1.4);
    expect(overviewAltitude(phone, params)).toBe(2.2);
  });
});
