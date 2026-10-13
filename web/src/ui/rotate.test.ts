import { describe, expect, it } from 'vitest';
import { isPhoneLandscape } from './rotate';

describe('« Tourne ton téléphone » (D5, D16)', () => {
  it('téléphone tactile en paysage seulement', () => {
    expect(isPhoneLandscape({ coarse: true, width: 844, height: 390 })).toBe(true);
    expect(isPhoneLandscape({ coarse: true, width: 640, height: 360 })).toBe(true);
    expect(isPhoneLandscape({ coarse: true, width: 390, height: 844 })).toBe(false);   // portrait
    expect(isPhoneLandscape({ coarse: true, width: 1180, height: 820 })).toBe(false);  // tablette en paysage : on joue
    expect(isPhoneLandscape({ coarse: false, width: 844, height: 390 })).toBe(false);  // fenêtre de bureau basse
  });
});
