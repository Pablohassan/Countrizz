import { describe, expect, it } from 'vitest';
import { cross, dot, normalize, toVec, type Vec3 } from '../../geo/vec';
import { convexHull2D, paperGeometry, shadowOutline, toonShade, toonStep, TOON } from './paper';

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

describe('papier de l’avion A2 (prototype du 05/10)', () => {
  const g = paperGeometry(0.8);

  it('trois groupes de faces : dessus crème, bande au bord de fuite, quille ; 14 triangles', () => {
    expect(g.groups).toEqual([4, 8, 2]);
    expect(g.positions.length).toBe((4 + 8 + 2) * 9);
    expect(g.edges.length % 6).toBe(0);
    expect(g.folds.length).toBe(4 * 6);
  });

  it('le dessus regarde vers le haut (y), la quille vers l’intérieur', () => {
    const tri = (k: number): Vec3 => {
      const p = (i: number): Vec3 => [g.positions[k * 9 + i * 3]!, g.positions[k * 9 + i * 3 + 1]!, g.positions[k * 9 + i * 3 + 2]!];
      return cross(sub(p(1), p(0)), sub(p(2), p(0)));
    };
    for (let k = 0; k < 12; k++) expect(tri(k)[1]).toBeGreaterThanOrEqual(0);
    // quille : un triangle par côté, normale vers l'axe (z de signe opposé à son côté)
    const q = [tri(12), tri(13)];
    expect(q[0]![2] * q[1]![2]).toBeLessThan(0);
  });

  it('nez devant (+x), envergure sur z, quille sous le papier', () => {
    expect(g.points.nose).toEqual([0.5, 0, 0]);
    expect(g.points.keel[1]).toBeLessThan(0);
    expect(Math.max(...g.outline.map((p) => Math.abs(p[2])))).toBeCloseTo(0.66, 9);
  });
});

describe('ombrage toon (MeshToonMaterial du prototype, calculé dans le matériau)', () => {
  it('trois marches selon n·L, seuils 0,22 et 0,41', () => {
    expect(toonStep(-1)).toBe(0);
    expect(toonStep(0.21)).toBe(0);
    expect(toonStep(0.22)).toBe(0.5);
    expect(toonStep(0.4)).toBe(0.5);
    expect(toonStep(0.41)).toBe(1);
    expect(toonStep(1)).toBe(1);
  });
  it('plein soleil : l’albédo ; à l’ombre : l’ambiance bleutée h', () => {
    expect(toonShade(1)).toEqual([1, 1, 1]);
    expect(toonShade(-1)).toEqual(TOON.ambient);
    const mid = toonShade(0.3);
    TOON.ambient.forEach((h, i) => expect(mid[i]).toBeCloseTo(h + 0.5 * (1 - h), 12));
  });
});

describe('ombre portée projetée (plan 2A-6, décision 4)', () => {
  const ground = toVec([2.35, 48.86]);
  const sun = normalize([ground[0] + 0.3, ground[1] + 0.5, ground[2] - 0.2]);

  it('enveloppe convexe : les coins d’un carré, sens trigonométrique, sans point intérieur', () => {
    const h = convexHull2D([[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5], [0.2, 0.7]]);
    expect(h).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]]);
  });

  it('chaque sommet tombe sur le plan tangent, le long du soleil', () => {
    const pts: Vec3[] = [[ground[0] * 1.03, ground[1] * 1.03, ground[2] * 1.03], [ground[0] * 1.03 + 0.01, ground[1] * 1.03, ground[2] * 1.03 - 0.01], [ground[0] * 1.025, ground[1] * 1.025 + 0.012, ground[2] * 1.025]];
    const out = shadowOutline(pts, ground, 0.0005, sun)!;
    expect(out.length).toBe(3);
    for (const q of out) {
      expect(dot(q, ground)).toBeCloseTo(1.0005, 9);
      // q − p est parallèle au soleil pour l'un des sommets d'origine
      expect(pts.some((p) => { const d = sub(p, q); const c = cross(d, sun); return Math.hypot(...c) < 1e-9 && dot(d, sun) > 0; })).toBe(true);
    }
    // vu de l'extérieur, le contour tourne dans le sens trigonométrique (normale du triangle vers l'extérieur)
    expect(dot(cross(sub(out[1]!, out[0]!), sub(out[2]!, out[0]!)), ground)).toBeGreaterThan(0);
  });

  it('soleil sous l’horizon du point : pas d’ombre', () => {
    expect(shadowOutline([[ground[0] * 1.03, ground[1] * 1.03, ground[2] * 1.03]], ground, 0.0005, [-ground[0], -ground[1], -ground[2]])).toBeNull();
  });
});
