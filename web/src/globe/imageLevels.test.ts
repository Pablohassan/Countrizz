import { describe, expect, it } from 'vitest';
import { visibleHalfAngle } from '../camera/framing';
import { availableSlots, pickLevels } from './imageLevels';

const phone = { width: 390, height: 844, fovYDeg: 50 };
const o = { viewFactor: 2.2, levelRatio: 4 };
const finest = 0.0019;                                     // ≈ 0,109° : le Vatican
const chain = [256, 64, 16, 4, 1].map((k) => finest * k);  // du plus large au plus fin
/** Altitude dont la vue × 2,2 vaut `D` (recherche par dichotomie : visibleHalfAngle croît avec l'altitude). */
const altitudeFor = (D: number) => { let lo = 1e-7, hi = 50; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (2.2 * visibleHalfAngle(m, phone) < D) lo = m; else hi = m; } return (lo + hi) / 2; };

describe('choix des niveaux selon l’altitude (spec zoom §4.3)', () => {
  it('sous la vue du plus fin, le plus fin seul ; en vue d’ensemble, le niveau 0 et le 1 à 0', () => {
    expect(pickLevels(altitudeFor(0.99 * finest), phone, chain, o)).toMatchObject({ coarse: 4, fine: null });
    expect(pickLevels(2.2, phone, chain, o)).toEqual({ coarse: 0, fine: 1, fineOpacity: 0 });
  });
  it('le suivant est entièrement posé dès que la vue tombe à deux fois son emprise', () => {
    const p = pickLevels(altitudeFor(2 * chain[2]!), phone, chain, o);
    expect(p).toMatchObject({ coarse: 1, fine: 2 });
    expect(p.fineOpacity).toBeCloseTo(1, 6);
    expect(pickLevels(altitudeFor(3 * chain[2]!), phone, chain, o).fineOpacity).toBeLessThan(1);
  });
  it('à 1,079 × l’emprise du plus fin (l’autre cadrage de référence), le plus fin est entièrement posé', () => {
    const p = pickLevels(altitudeFor(1.079 * finest), phone, chain, o);
    expect(p).toEqual({ coarse: 3, fine: 4, fineOpacity: 1 });
  });
  it('balayage d’altitude : continu au relais, et à chaque pas un niveau chargé couvre la vue (Review Focus 3)', () => {
    let prevShown = 0;
    for (let k = 0; k <= 4000; k++) {
      const D = chain[0]! * 2 * Math.pow(finest / (chain[0]! * 2), k / 4000);
      const p = pickLevels(altitudeFor(D), phone, chain, o);
      const s = availableSlots(p, [true, true, true, true, true]);
      expect(s.coarse).not.toBeNull();
      // part de la vue couverte par une photo nette : le courant entier, plus le suivant à son opacité
      const shown = s.coarse! + s.fineOpacity;
      expect(shown + 1e-9).toBeGreaterThanOrEqual(prevShown);   // jamais de retour en arrière en descendant
      expect(shown - prevShown).toBeLessThan(0.05);              // pas de saut d'un pas à l'autre
      prevShown = shown;
    }
  });
});

describe('ce qui est chargé (la manche n’attend jamais une photo)', () => {
  const p = { coarse: 3, fine: 4, fineOpacity: 0.6 };
  it('tout chargé : la paire choisie', () => {
    expect(availableSlots(p, [true, true, true, true, true])).toEqual(p);
  });
  it('le plus fin en échec : le courant seul', () => {
    expect(availableSlots(p, [true, true, true, true, false])).toEqual({ coarse: 3, fine: null, fineOpacity: 0 });
  });
  it('le courant manquant : le niveau plus large le plus fin qui soit chargé', () => {
    expect(availableSlots(p, [true, true, false, false, true])).toEqual({ coarse: 1, fine: 4, fineOpacity: 0.6 });
  });
  it('rien de chargé : rien', () => {
    expect(availableSlots(p, [false, false, false, false, false])).toEqual({ coarse: null, fine: null, fineOpacity: 0 });
  });
});
