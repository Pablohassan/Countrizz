import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { angleBetween, toVec } from '../../../../src/geo/vec';
import { PARIS } from '../../../../src/intro/timeline';
import { FRONTIERE_SEGMENTS, HAUTEUR_MAX, courbeFrontiere, hauteurA, hauteurDe, pointsFrontiere, reperes, surFrontiere, type Gris16 } from '../../lib/terre';

/** La formule de l'ancienne scène three.js (`git show c9e68d6:web/src/intro/scene.ts`, l. 92-95), telle quelle. */
const sceneTs = (terre: number, altitude: number) => THREE.MathUtils.smoothstep(terre, 0.3, 0.72) * (0.0045 + 0.09 * Math.pow(Math.sqrt(altitude), 2.4));
const uni = (v: number, w = 360, h = 180): Gris16 => ({ w, h, d: new Uint16Array(w * h).fill(v) });
/** Un petit anneau autour de la France, son point le plus au nord en 4ᵉ position. */
const ANNEAU: [number, number][] = [[-4, 48], [-1, 43], [3, 42.5], [7, 44], [8, 48.5], [3, 51], [-1, 49.5]];

describe('hauteur du relief en pâte', () => {
  it('même formule que scene.ts (terre adoucie × socle + altitude caricaturée)', () => {
    for (const terre of [0, 0.2, 0.3, 0.31, 0.5, 0.71, 0.72, 0.9, 1])
      for (const alt of [0, 0.01, 0.25, 0.5, 0.99, 1]) expect(hauteurDe(terre, alt)).toBeCloseTo(sceneTs(terre, alt), 15);
  });

  it('HAUTEUR_MAX est la plus grande hauteur ; la mer vaut 0', () => {
    expect(HAUTEUR_MAX).toBeCloseTo(0.0945, 15);
    expect(hauteurDe(1, 1)).toBeCloseTo(HAUTEUR_MAX, 15);
    expect(hauteurDe(0.3, 1)).toBe(0);
  });

  it('lue dans le gris 16 bits : v / 65535 · HAUTEUR_MAX, bilinéaire, raccord au méridien 180', () => {
    expect(hauteurA(uni(65535), 2.35, 48.86)).toBeCloseTo(HAUTEUR_MAX, 12);
    const g = uni(0, 4, 2);
    g.d[0] = 65535; g.d[4] = 65535;   // colonne 0 (−180° → −90°) à 1, les autres à 0
    expect(hauteurA(g, -135, 0)).toBeCloseTo(HAUTEUR_MAX, 12);   // centre du pixel
    expect(hauteurA(g, 180, 0)).toBeCloseTo(HAUTEUR_MAX / 2, 12);   // à mi-chemin des colonnes 3 et 0
    expect(hauteurA(g, -180, 0)).toBeCloseTo(HAUTEUR_MAX / 2, 12);
  });
});

describe('frontière et repères des bulles', () => {
  const h = (lng: number, lat: number) => hauteurA(uni(32768), lng, lat);   // relief uniforme : 0,047 25

  it('la frontière part du point le plus au nord, au rayon 1 + hauteur + 0,0034, et se referme', () => {
    const p = pointsFrontiere(courbeFrontiere(ANNEAU, h));
    expect(p).toHaveLength(FRONTIERE_SEGMENTS + 1);
    expect(angleBetween(p[0]!, toVec([3, 51]))).toBeLessThan(1e-12);
    expect(Math.hypot(...p[0]!)).toBeCloseTo(1 + h(3, 51) + 0.0034, 12);
    for (let k = 0; k < 3; k++) expect(p.at(-1)![k]).toBeCloseTo(p[0]![k]!, 12);
  });

  it('surFrontiere : part 0,5 = le point du milieu ; entre deux points, la corde', () => {
    const p = pointsFrontiere(courbeFrontiere(ANNEAU, h));
    expect(surFrontiere(p, 0.5)).toEqual(p[FRONTIERE_SEGMENTS / 2]);
    const m = surFrontiere(p, 10.5 / FRONTIERE_SEGMENTS);
    for (let k = 0; k < 3; k++) expect(m[k]).toBeCloseTo((p[10]![k]! + p[11]![k]!) / 2, 12);
    expect(surFrontiere(p, 1)).toEqual(p.at(-1));
  });

  it('Paris : la bonne direction, posé sur la surface déplacée (rayon 1 + hauteur > 1)', () => {
    const r = reperes(pointsFrontiere(courbeFrontiere(ANNEAU, h)), h);
    expect(angleBetween(r.paris, toVec([PARIS[0], PARIS[1]]))).toBeLessThan(1e-12);
    expect(Math.hypot(...r.paris)).toBeCloseTo(1 + h(PARIS[0], PARIS[1]), 12);
    expect(Math.hypot(...r.paris)).toBeGreaterThan(1);
  });

  it('le milieu de la frontière est son point d’indice SEGMENTS / 2', () => {
    const p = pointsFrontiere(courbeFrontiere(ANNEAU, h));
    expect(reperes(p, h).frontiereMilieu).toEqual(p[FRONTIERE_SEGMENTS / 2]);
  });
});
