import { describe, expect, it } from 'vitest';
import { cross, dot, length, normalize, toVec, type Vec3 } from '../../geo/vec';
import { createRoute, ESCALES, PLANE, rollRad } from './route';

const dist = (a: Vec3, b: Vec3) => length([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);

describe('trajet de l’avion de l’accueil (spec 2A §4, décision 8)', () => {
  const route = createRoute();

  it('passe par les quatre escales, dans l’ordre Rabat → Madrid → Paris → Athènes', () => {
    ESCALES.forEach((c, i) => expect(dist(route.ground(route.passages[i]!), toVec(c.lieu))).toBeLessThan(2e-3));
    for (let i = 1; i < 4; i++) expect(route.passages[i]!).toBeGreaterThan(route.passages[i - 1]!);
  });

  it('boucle fermée et continue : pas de saut d’un échantillon au suivant', () => {
    expect(dist(route.ground(0), route.ground(1))).toBeLessThan(1e-9);
    let worst = 0;
    for (let k = 0; k < 2000; k++) worst = Math.max(worst, dist(route.ground(k / 2000), route.ground((k + 1) / 2000)));
    // longueur du tour / 2000, à peu près : pas de raccord
    expect(worst).toBeLessThan((route.total / 2000) * 1.5);
  });

  it('rase-mottes au-dessus des escales, croisière ailleurs', () => {
    for (const e of route.passages) expect(route.altitude(e)).toBeCloseTo(PLANE.altPassage, 9);
    // au milieu du tour par derrière, loin de toute escale
    const far = (route.passages[3]! + 1) / 2;
    expect(route.altitude(far)).toBeCloseTo(PLANE.altCroisiere, 6);
    expect(length(route.point(far))).toBeCloseTo(1 + PLANE.altCroisiere, 6);
  });

  it('repère de vol orthonormé, tangent à la sphère, dans le sens du trajet', () => {
    for (const e of [0.05, 0.2, route.passages[2]!, 0.7]) {
      const f = route.frame(e);
      const n = normalize(f.position);
      expect(length(f.forward)).toBeCloseTo(1, 9);
      // presque tangent : la descente vers une escale (0,009 sur ≈ 0,07 rad) incline un peu l'avant
      expect(Math.abs(dot(f.forward, n))).toBeLessThan(0.15);
      expect(dot(f.up, n)).toBeGreaterThan(0.99);
      expect(dist(f.right, cross(f.forward, f.up))).toBeLessThan(1e-9);
      const ahead = route.point(e + 1e-3);
      expect(dot(f.forward, [ahead[0] - f.position[0], ahead[1] - f.position[1], ahead[2] - f.position[2]])).toBeGreaterThan(0);
    }
  });

  it('roulis : −25° en ligne droite pour montrer la quille, ± 55° au plus dans les virages', () => {
    expect(rollRad(0, 1)).toBeCloseTo((PLANE.roulisBase * Math.PI) / 180, 12);
    expect(rollRad(1e9, 1)).toBeCloseTo((55 * Math.PI) / 180, 12);
    expect(rollRad(-1e9, 1)).toBeCloseTo((-55 * Math.PI) / 180, 12);
  });
});
