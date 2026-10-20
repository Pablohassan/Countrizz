import { describe, expect, it } from 'vitest';
import { BORDER_RADIUS, BORDER_STEP_RAD, borderPositions } from './borders';
import { borderOpacity } from './borders';
import { LIFT_MAX } from './relief';

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

describe('frontières et relief soulevé', () => {
  const radius = (p: number[], i: number) => Math.hypot(p[i * 3]!, p[i * 3 + 1]!, p[i * 3 + 2]!);
  it('sans grille de relief : au rayon d’avant, segments découpés tous les 0,35° au plus', () => {
    const p = borderPositions([[[0, 0], [2, 0]]], null);
    expect(p.length / 6).toBe(Math.ceil((2 * Math.PI) / 180 / BORDER_STEP_RAD));
    for (let i = 0; i < p.length / 3; i++) expect(radius(p, i)).toBeCloseTo(BORDER_RADIUS, 12);
  });
  it('sur un relief : soulevée de la hauteur plus la marge ; en mer (hauteur nulle), collée au sol plat', () => {
    const high = { data: new Uint8Array(8).fill(255), width: 4, height: 2 };
    const flat = { data: new Uint8Array(8), width: 4, height: 2 };
    expect(radius(borderPositions([[[10, 5], [10.1, 5]]], high), 0)).toBeCloseTo(BORDER_RADIUS + LIFT_MAX + 0.0004, 9);
    expect(radius(borderPositions([[[10, 5], [10.1, 5]]], flat), 0)).toBeCloseTo(BORDER_RADIUS, 12);
  });
});
