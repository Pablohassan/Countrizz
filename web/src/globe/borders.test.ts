import { describe, expect, it } from 'vitest';
import { borderOpacity } from './borders';

describe('estompage des frontières vectorielles avec l’altitude', () => {
  it('pleines en vue d’ensemble, effacées de près (le patch prend le relais)', () => {
    expect(borderOpacity(1.4)).toBeCloseTo(0.55, 12);
    expect(borderOpacity(0.3)).toBeCloseTo(0.55, 12);
    expect(borderOpacity(0.03)).toBe(0);
    expect(borderOpacity(0.0003)).toBe(0);
  });
  it('décroît sans saut entre les deux', () => {
    let prev = borderOpacity(0.3);
    for (let a = 0.3; a >= 0.03; a -= 0.001) {
      const o = borderOpacity(a);
      expect(o).toBeLessThanOrEqual(prev + 1e-12);
      expect(prev - o).toBeLessThan(0.01);
      prev = o;
    }
  });
});
