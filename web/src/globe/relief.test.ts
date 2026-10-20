import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { LIFT_MAX, liftAt, liftFactor, sphereUv } from './relief';

describe('relief soulevé', () => {
  it('entier de loin, effacé au cadrage serré (sous 0,03), sans saut entre les deux', () => {
    expect(liftFactor(1.4)).toBe(1);
    expect(liftFactor(0.08)).toBe(1);
    expect(liftFactor(0.03)).toBe(0);
    expect(liftFactor(0.0003)).toBe(0);
    let prev = 0;
    for (let a = 0.03; a <= 0.08; a += 0.0005) { const f = liftFactor(a); expect(f).toBeGreaterThanOrEqual(prev); expect(f - prev).toBeLessThan(0.02); prev = f; }
  });
  it('hauteur sur le CPU : 255 = Everest × 10, lue en bilinéaire, raccordée à l’antiméridien', () => {
    const w = 4, h = 2, grid = new Uint8Array([255, 255, 0, 0, 255, 255, 0, 0]);
    expect(liftAt(grid, w, h, [-1, 0, 0])).toBeCloseTo(LIFT_MAX / 2, 9);              // −180° : entre la colonne 3 (0) et la 0 (255) → milieu
    expect(liftAt(grid, w, h, [Math.cos(-2.356), 0, -Math.sin(-2.356)])).toBeCloseTo(LIFT_MAX, 3); // ≈ −135° : centre de la colonne 0
  });
  it('les coordonnées de texture d’une direction sont celles de la boule (SphereGeometry)', () => {
    const g = new THREE.SphereGeometry(1, 32, 16);
    const pos = g.getAttribute('position'), uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      const d: [number, number, number] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      if (Math.abs(d[1]) > 0.999) continue;                     // pôles : u indéfini
      const [u, v] = sphereUv(d);
      const du = Math.abs(u - uv.getX(i));
      expect(Math.min(du, 1 - du)).toBeLessThan(1e-6);         // couture u = 0 / 1
      expect(v).toBeCloseTo(uv.getY(i), 6);
    }
  });
});
