import { describe, expect, it } from 'vitest';
import { HOME, homePose, projectOnScreen } from './home';
import { angleBetween, toVec, type Vec3 } from '../geo/vec';

const phone = { width: 390, height: 844, fovYDeg: 50 };

/** Haut du disque terrestre à l'écran : le plus petit y parmi les points du limbe vus de la caméra. */
function discTop(v: typeof phone): number {
  const p = homePose(v), d = 1 + p.altitude;
  // limbe : cercle des points P de la sphère tels que P·C = 1 (C = dir · d)
  const c = p.dir, cosT = 1 / d, sinT = Math.sqrt(1 - cosT * cosT);
  const a: Vec3 = p.up, b: Vec3 = [c[1] * a[2] - c[2] * a[1], c[2] * a[0] - c[0] * a[2], c[0] * a[1] - c[1] * a[0]];
  let top = Infinity;
  for (let i = 0; i < 3600; i++) {
    const t = (i / 3600) * 2 * Math.PI;
    const q: Vec3 = [0, 1, 2].map((k) => c[k] * cosT + sinT * (a[k] * Math.cos(t) + b[k] * Math.sin(t))) as unknown as Vec3;
    const s = projectOnScreen(p, v, q);
    if (s && s[0] >= 0 && s[0] <= v.width) top = Math.min(top, s[1]);
  }
  return top;
}

describe('vue d’accueil « lever de Terre »', () => {
  it('reprend la capture validée : regard lng 10°, lat 19,5°, altitude 1,6', () => {
    const p = homePose(phone);
    expect(angleBetween(p.dir, toVec([10, 19.5]))).toBeLessThan(1e-9);
    expect(p.altitude).toBe(1.6);
    expect(HOME.look).toEqual([10, 19.5]);
  });

  it('incline la caméra de 23,85° (décalage de 400 px sur 844 de la maquette)', () => {
    expect(homePose(phone).pitch * 180 / Math.PI).toBeCloseTo(23.85, 1);
  });

  // Le tangage n'est pas tout à fait la translation de la maquette : Paris y descend de ≈ 16 px de plus (mesuré le 10/10).
  it('pose Paris et le haut du disque là où la maquette les montre, à 20 px près (390 × 844)', () => {
    const p = homePose(phone);
    const paris = projectOnScreen(p, phone, toVec([2.35, 48.86]))!;
    expect(Math.abs(paris[0] - 150)).toBeLessThan(20);
    expect(Math.abs(paris[1] - 565)).toBeLessThan(20);
    expect(Math.abs(discTop(phone) - 445)).toBeLessThan(20);
  });

  it('projectOnScreen rend null derrière la caméra', () => {
    const p = homePose(phone);
    expect(projectOnScreen(p, phone, [p.dir[0] * 10, p.dir[1] * 10, p.dir[2] * 10])).toBeNull();
  });
});
