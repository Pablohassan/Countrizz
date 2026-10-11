import { describe, expect, it } from 'vitest';
import { BULLES, BULLES_RANGE, CADRAGES, INTRO, IPS_MAITRE, LOGO_LETTRES, type Bulle, type Cadrage } from '../../../../src/intro/temps';
import { frameAt } from '../../../../src/intro/timeline';
import { ANCRES_IPS, ANCRES_T0, PROFONDEUR, ancres, cles, nombreImages, type Cles, type Sources } from '../../export-keys';
import { projeter } from '../../lib/axes';
import { courbeFrontiere, pointsFrontiere, type Reperes } from '../../lib/terre';

/** Repères de la vraie Terre : `.cache/sources/reperes.json` écrit par `npm run intro:sources` (Task 2). */
const REPERES: Reperes = {
  paris: [0.6605924688707989, 0.7568215134698799, -0.027109560338230285],
  frontiereMilieu: [0.753004354824679, 0.6943535650710903, -0.006915935790586691],
};
/** Une frontière d'essai (la perle seule la lit) : un petit anneau autour de la France, relief uniforme. */
const S: Sources = {
  reperes: REPERES,
  frontiere: pointsFrontiere(courbeFrontiere([[-4, 48], [-1, 43], [3, 42.5], [7, 44], [8, 48.5], [3, 51], [-1, 49.5]], () => 0.005)),
};
const CAS: Cadrage[] = ['portrait', 'paysage'];
const CLES: Record<Cadrage, Cles> = { portrait: cles('portrait', S), paysage: cles('paysage', S) };
const piste = (k: Cles, id: string, chemin: string) => k.pistes.find((p) => p.id === id && p.chemin === chemin)!;
const n2 = (i: number) => String(i).padStart(2, '0');

describe('export des clés', () => {
  it('une image par 1/120 s, de 0 à INTRO.FIN compris ; chaque piste a frames × dim valeurs finies', () => {
    expect(nombreImages()).toBe(Math.round(INTRO.FIN * IPS_MAITRE) + 1);
    for (const c of CAS) {
      const k = CLES[c];
      expect([k.version, k.cadrage, k.width, k.height, k.fps, k.frames, k.fovY]).toEqual([1, c, CADRAGES[c].width, CADRAGES[c].height, 120, nombreImages(), 20]);
      for (const p of k.pistes) {
        expect(p.valeurs).toHaveLength(k.frames * p.dim);
        expect(p.valeurs.every(Number.isFinite)).toBe(true);
      }
      const fin = frameAt(INTRO.FIN, c).camera.position;
      piste(k, 'OB:camera', 'location').valeurs.slice(-3).forEach((v, i) => expect(v).toBeCloseTo(fin[i]!, 5));
    }
  });

  it('toutes les pistes que la scène Blender attend, une seule fois chacune', () => {
    const attendues = [
      'OB:camera location', 'OB:camera rotation_quaternion', 'OB:ecrasement_rot rotation_quaternion', 'OB:ecrasement_echelle scale',
      'OB:ecrasement_retour rotation_quaternion', 'OB:nuages rotation_euler', 'OB:nuages scale', 'OB:repere location',
      'OB:repere rotation_quaternion', 'OB:repere scale', 'OB:point location', 'OB:point scale', 'OB:drapeau location',
      'OB:drapeau rotation_quaternion', 'OB:drapeau scale', 'CU:frontiere bevel_factor_end', 'OB:perle location', 'OB:perle scale',
      ...['logo', 'titre'].flatMap((t) => LOGO_LETTRES.flatMap((_, i) => ['location', 'rotation_euler', 'scale', 'color'].map((c) => `OB:${t}_${n2(i)} ${c}`))),
      ...Array.from({ length: 46 }, (_, i) => ['location', 'scale', 'color'].map((c) => `OB:etoile_${n2(i)} ${c}`)).flat(),
    ];
    for (const c of CAS) expect(CLES[c].pistes.map((p) => `${p.id} ${p.chemin}`)).toEqual(attendues);
  });

  it('déterministe : deux exports donnent les mêmes octets', () => {
    expect(JSON.stringify(cles('paysage', S))).toBe(JSON.stringify(CLES.paysage));
    expect(JSON.stringify(ancres(REPERES))).toBe(JSON.stringify(ancres(REPERES)));
  }, 30_000);

  it('quaternions de signe continu d’une image à l’autre (interpolation par le plus court chemin)', () => {
    for (const c of CAS)
      for (const p of CLES[c].pistes.filter((q) => q.chemin === 'rotation_quaternion')) {
        const v = p.valeurs;
        for (let k = 1; k < CLES[c].frames; k++) {
          const dot = v[k * 4]! * v[k * 4 - 4]! + v[k * 4 + 1]! * v[k * 4 - 3]! + v[k * 4 + 2]! * v[k * 4 - 2]! + v[k * 4 + 3]! * v[k * 4 - 1]!;
          expect(dot, `${c} ${p.id} image ${k + 1}`).toBeGreaterThan(0);
        }
      }
  });

  it('les étoiles toujours derrière la Terre, les lettres devant tant qu’elles se voient', () => {
    for (const c of CAS) {
      const k = CLES[c], cam = piste(k, 'OB:camera', 'location').valeurs;
      const alphas = ['logo', 'titre'].flatMap((t) => LOGO_LETTRES.map((_, i) => piste(k, `OB:${t}_${n2(i)}`, 'color').valeurs));
      for (let f = 0; f < k.frames; f++) {
        const d = Math.hypot(cam[f * 3]!, cam[f * 3 + 1]!, cam[f * 3 + 2]!);
        expect(PROFONDEUR.etoiles).toBeGreaterThan(d + 1.4);
        if (alphas.some((a) => a[f * 4 + 3]! > 0)) expect(PROFONDEUR.lettres).toBeLessThan(d - 1.4);
      }
    }
  });
});

describe('ancres des bulles', () => {
  const a = ancres(REPERES);

  it('de t0 (apparition du point, 0,3 s avant la première bulle) à BULLES_RANGE, 60 par seconde', () => {
    expect([a.version, a.fps, a.t0]).toEqual([1, 60, 10.8]);
    expect(ANCRES_T0).toBe(10.8);
    for (const c of CAS)
      for (const b of Object.keys(BULLES) as Bulle[]) expect(a.cadrages[c][b]).toHaveLength(Math.round((BULLES_RANGE - ANCRES_T0) * ANCRES_IPS) + 1);
  });

  it('dans le cadre de la vidéo tant que la bulle est là (portrait et paysage)', () => {
    for (const c of CAS) {
      const { width, height } = a.cadrages[c];
      expect([width, height]).toEqual([CADRAGES[c].width, CADRAGES[c].height]);
      for (const b of Object.keys(BULLES) as Bulle[])
        a.cadrages[c][b].forEach(([x, y], i) => {
          if (a.t0 + i / a.fps < BULLES[b].apparait - 1e-9) return;
          expect(x, `${c} ${b} ${i}`).toBeGreaterThanOrEqual(0);
          expect(x, `${c} ${b} ${i}`).toBeLessThanOrEqual(width);
          expect(y, `${c} ${b} ${i}`).toBeGreaterThanOrEqual(0);
          expect(y, `${c} ${b} ${i}`).toBeLessThanOrEqual(height);
        });
    }
  });

  it('chacune sur son objet : le point posé sur Paris, le milieu de la frontière, le haut du mât au-dessus de Paris', () => {
    for (const c of CAS)
      a.cadrages[c].capitale.forEach((cap, i) => {
        const t = a.t0 + i / a.fps, f = frameAt(t, c);
        const paris = projeter(REPERES.paris, f.camera, CADRAGES[c]), milieu = projeter(REPERES.frontiereMilieu, f.camera, CADRAGES[c]);
        if (t >= 12) expect(Math.hypot(cap[0] - paris[0], cap[1] - paris[1]), `${c} ${t}`).toBeLessThan(8);   // posé depuis 11,22 s
        const pays = a.cadrages[c].pays[i]!;
        expect(Math.hypot(pays[0] - milieu[0], pays[1] - milieu[1]), `${c} ${t}`).toBeLessThan(0.1);   // arrondi au dixième de px
        if (t >= BULLES.drapeau.apparait - 1e-9) expect(a.cadrages[c].drapeau[i]![1], `${c} ${t}`).toBeLessThan(paris[1] - 50);
      });
  });
});
