import { describe, expect, it } from 'vitest';
import { cross, dot, normalize, toVec, type Vec3 } from '../../geo/vec';
import { projectOnScreen } from '../../camera/home';
import { MARGE, MONUMENT, deploiement, recadrage, repere, solSous, tailleMonde } from './pose';

const near = (a: Vec3, b: Vec3) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 6));

describe('pose d\'une maquette sur le globe (caméra à la verticale du pays)', () => {
  const g = toVec([2.35, 48.85]);
  const nord = normalize(cross(cross(g, [0, 1, 0]), g));

  it('repliée : son axe vertical suit la verticale du lieu (vue du dessus)', () => {
    const r = repere(g, nord, 0);
    near(r.y, g);
  });

  it('dépliée de 90° : dressée vers le haut de l\'écran, la face avant vers la caméra', () => {
    const r = repere(g, nord, Math.PI / 2);
    near(r.y, nord);
    near(r.z, g);
  });

  it('repère direct et orthonormé à tout angle ; le haut de l\'écran est pris dans le plan du sol', () => {
    const penche = normalize([nord[0] + 0.3 * g[0], nord[1] + 0.3 * g[1], nord[2] + 0.3 * g[2]]);
    for (const a of [0, 0.4, 1.2, Math.PI / 2]) {
      const r = repere(g, penche, a);
      for (const v of [r.x, r.y, r.z]) expect(Math.hypot(...v)).toBeCloseTo(1, 6);
      expect(dot(r.x, r.y)).toBeCloseTo(0, 6);
      expect(dot(r.y, r.z)).toBeCloseTo(0, 6);
      near(cross(r.x, r.y), r.z);
    }
    near(repere(g, penche, Math.PI / 2).y, nord);
  });

  it('déploiement : 0 au départ, dépasse un peu l\'inclinaison (ressort), s\'y pose ; repli jusqu\'à 0', () => {
    expect(deploiement(0, null)).toBeCloseTo(0, 9);
    const pic = Math.max(...Array.from({ length: 60 }, (_, i) => deploiement((i / 60) * MONUMENT.deplie, null)));
    expect(pic).toBeGreaterThan(MONUMENT.inclinaison);
    expect(pic).toBeLessThan(MONUMENT.inclinaison * 1.25);
    expect(deploiement(MONUMENT.deplie, null)).toBeCloseTo(MONUMENT.inclinaison, 6);
    expect(deploiement(5, 5)).toBeCloseTo(MONUMENT.inclinaison, 6);
    expect(deploiement(5 + MONUMENT.replie, 5)).toBeCloseTo(0, 9);
  });

  it('taille à l\'écran fixe : la hauteur dans le monde croît avec la distance à la caméra', () => {
    const v = { width: 412, height: 915, fovYDeg: 50 };
    const h = tailleMonde(0.2, v);
    // à 0,2 rayon de la caméra, la vue fait 2 · 0,2 · tan 25° de haut ; la maquette en prend la part MONUMENT.part
    expect(h).toBeCloseTo(2 * 0.2 * Math.tan((25 * Math.PI) / 180) * MONUMENT.part, 9);
    expect(tailleMonde(0.4, v)).toBeCloseTo(2 * h, 9);
  });
});

describe('recadrage : la maquette reste dans la zone libre', () => {
  const v = { width: 412, height: 915, fovYDeg: 50 };
  const boite = { gauche: 40, droite: 60, haut: 140, bas: 10 };
  const safe = { top: 80, bottom: 300 };

  it('déjà dedans : aucun décalage', () => {
    expect(recadrage([200, 400], boite, v, safe)).toEqual([0, 0]);
  });

  it('base au bord gauche (Moscou) : glisse à droite jusqu\'à la marge', () => {
    const [dx, dy] = recadrage([5, 400], boite, v, safe);
    expect(5 + dx - boite.gauche).toBeCloseTo(MARGE, 9);
    expect(dy).toBe(0);
  });

  it('trop haut (sous le HUD) : descend ; trop bas (sur les réponses) : remonte', () => {
    expect(150 + recadrage([200, 150], boite, v, safe)[1] - boite.haut).toBeCloseTo(safe.top + MARGE, 9);
    expect(800 + recadrage([200, 800], boite, v, safe)[1] + boite.bas).toBeCloseTo(v.height - safe.bottom - MARGE, 9);
  });

  it('plus large que la zone : centrée', () => {
    const [dx] = recadrage([10, 400], { ...boite, gauche: 300, droite: 300 }, v, null);
    expect(10 + dx).toBeCloseTo(v.width / 2, 9);
  });
});

describe('point du sol sous un pixel (inverse de projectOnScreen)', () => {
  const v = { width: 412, height: 915, fovYDeg: 50 };
  const dir = toVec([60, 50]);
  const pose = { dir, altitude: 1.2, up: normalize(cross(cross(dir, [0, 1, 0]), dir)), axisY: 0.15 };

  it('aller-retour : le pixel d\'un point du sol ramène à ce point, même près du limbe (Moscou)', () => {
    for (const ll of [[60, 50], [37.6, 55.75], [95, 62]] as [number, number][]) {
      const p = toVec(ll);
      const px = projectOnScreen(pose, v, p)!;
      const back = solSous(pose, v, px)!;
      near(back, p);
    }
  });

  it('pixel hors du globe (caméra éloignée, coin de l\'écran) : null', () => {
    expect(solSous({ ...pose, altitude: 3 }, v, [0, 0])).toBeNull();
  });
});

describe('recadrage autour de l\'étiquette de la révélation', () => {
  const v = { width: 412, height: 915, fovYDeg: 50 };
  const safe = { top: 80, bottom: 300 };
  const boite = { gauche: 50, droite: 50, haut: 140, bas: 10 };
  // boîte de la maquette à l'écran, base en b décalée de d
  const rect = (b: [number, number], d: [number, number]) => ({ x: b[0] + d[0] - boite.gauche, y: b[1] + d[1] - boite.haut, w: boite.gauche + boite.droite, h: boite.haut + boite.bas });
  const disjoints = (a: { x: number; y: number; w: number; h: number }, e: { x: number; y: number; w: number; h: number }) =>
    a.x + a.w <= e.x || e.x + e.w <= a.x || a.y + a.h <= e.y || e.y + e.h <= a.y;

  it('étiquette ailleurs : rien ne change', () => {
    expect(recadrage([200, 400], boite, v, safe, { x: 0, y: 500, w: 100, h: 40 })).toEqual([0, 0]);
  });

  it('étiquette sur la maquette : le plus petit déplacement qui la libère, dans la zone libre', () => {
    const b: [number, number] = [150, 420];
    const evite = { x: 120, y: 330, w: 220, h: 45 };
    const d = recadrage(b, boite, v, safe, evite);
    const r = rect(b, d);
    expect(disjoints(r, evite)).toBe(true);
    expect(r.x).toBeGreaterThanOrEqual(MARGE - 1e-9);
    expect(r.y).toBeGreaterThanOrEqual(safe.top + MARGE - 1e-9);
    expect(r.y + r.h).toBeLessThanOrEqual(v.height - safe.bottom - MARGE + 1e-9);
    // gauche : −92, la maquette sortirait de l'écran ; droite : +252, idem ; haut : −112 ; bas : +107 (sous l'étiquette,
    // 375 + 12 + 140 − 420), dans la zone libre : le plus petit
    expect(d).toEqual([0, 375 + MARGE + boite.haut - 420]);
  });
});
