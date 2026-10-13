/**
 * Clés de l'intro (spec `2026-10-11-countrizz-intro-video-blender-design.md` §2.2) : la chronologie
 * (`src/intro/timeline.ts`) évaluée à chaque image du rendu maître, pour les deux cadrages, en pistes que
 * `blender/anim.py` cuit en F-curves LINÉAIRES (le flou de mouvement échantillonne entre les images) :
 *  - `scripts/intro/.cache/keys-portrait.json`, `keys-paysage.json` : image k (1 → frames) = instant (k − 1) / 120 s, la
 *    dernière est INTRO.FIN ; valeurs en coordonnées three, quaternions dans l'ordre de Blender `[w, x, y, z]` ;
 *  - `public/intro/ancres.json` (versionné) : les ancres des bulles en px de la vidéo, de t0 à BULLES_RANGE au pas 1/60 s.
 * Lit `.cache/sources/reperes.json` et `frontiere.json` (`npm run intro:sources`). Deux exports donnent les mêmes octets.
 * Usage : `npm run intro:keys`.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { BULLES, BULLES_RANGE, CADRAGES, INTRO, IPS_MAITRE, type Cadrage } from '../../src/intro/temps';
import { TITRES } from '../../src/intro/cadrages';
import { MAT_HM, REPERE_ECHELLE, frameAt, type IntroFrame } from '../../src/intro/timeline';
import { matriceEcrasement, projeter, quatBlender, signesContinus, unitesParPx, versCamera, type Vec3 } from './lib/axes';
import { surFrontiere, type Reperes } from './lib/terre';
import type { Ancres } from '../../src/intro/questions';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RAD = Math.PI / 180;

/**
 * Profondeur (unités de la scène, devant la caméra) des objets posés dans le plan de l'image : les lettres devant la
 * Terre quand elles se voient, les étoiles toujours derrière (contrôlé à chaque image par `cles`).
 */
export const PROFONDEUR = { lettres: 2, etoiles: 1000 } as const;
/** La Terre, son relief et ses nuages (rayon 1,24, boules de 0,08) tiennent dans cette sphère. */
const RAYON_MAX = 1.4;
/** Rayon de la perle au bout de la frontière (scene.ts:188). */
const PERLE = 0.0049;
/** Ancres des bulles : 60 par seconde, depuis l'apparition du point (0,3 s avant la première bulle, spec §3.3). */
export const ANCRES_IPS = 60;
export const ANCRES_T0 = Math.round((Math.min(...Object.values(BULLES).map((b) => b.apparait)) - 0.3) * ANCRES_IPS) / ANCRES_IPS;

/** Images du rendu maître : de 0 à INTRO.FIN compris, au pas de 1/IPS_MAITRE. */
export const nombreImages = () => Math.round(INTRO.FIN * IPS_MAITRE) + 1;

export interface Sources { reperes: Reperes; frontiere: Vec3[] }
export interface Piste { id: string; chemin: string; dim: number; valeurs: number[] }
export interface Cles { version: 1; cadrage: Cadrage; width: number; height: number; fps: number; frames: number; fovY: number; pistes: Piste[] }
/** Ancres des questions (`public/intro/ancres.json`) : le type du site (`src/intro/questions.ts`, Task 9), un seul pour la fabrique et le lecteur. */
export type { Ancres };

/** Le repère posé à Paris (scene.ts:162-166) : son axe Y sur la verticale du lieu, grossi × REPERE_ECHELLE. */
function repere(paris: Vec3) {
  const p = new THREE.Vector3(...paris), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
  return { q, m: new THREE.Matrix4().compose(p, q, new THREE.Vector3().setScalar(REPERE_ECHELLE)) };
}

/** Le drapeau tourné vers la caméra (scene.ts:242-250) : cap = direction de la caméra dans le repère, écrasement compris. */
function quatDrapeau(c: IntroFrame['camera'], mRepere: THREE.Matrix4): THREE.Quaternion {
  const loc = new THREE.Vector3(...c.position).applyMatrix4(mRepere.clone().invert());
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(-22 * RAD, Math.atan2(loc.x, loc.z), 0, 'YXZ'));
}

/** Une image cachée prend la position de l'image visible la plus proche : pas de traînée de flou quand l'objet surgit. */
function remplirCachees(p: Piste, visible: readonly boolean[]): void {
  const n = visible.length, avant = new Int32Array(n).fill(-1), apres = new Int32Array(n).fill(-1);
  for (let k = 0, v = -1; k < n; k++) { if (visible[k]) v = k; avant[k] = v; }
  for (let k = n - 1, v = -1; k >= 0; k--) { if (visible[k]) v = k; apres[k] = v; }
  for (let k = 0; k < n; k++) {
    if (visible[k]) continue;
    const a = avant[k]!, b = apres[k]!, j = a < 0 ? b : b < 0 ? a : k - a <= b - k ? a : b;
    if (j >= 0) for (let d = 0; d < p.dim; d++) p.valeurs[k * p.dim + d] = p.valeurs[j * p.dim + d]!;
  }
}

/** 9 chiffres significatifs : plus que les flottants 32 bits des F-curves de Blender, et un tiers d'octets en moins. */
const arrondi = (x: number) => Number(x.toPrecision(9));

/**
 * Toutes les pistes d'un cadrage. Objets (noms Blender) et chemins :
 *  - `OB:camera` location, rotation_quaternion — `OB:ecrasement_rot` rotation_quaternion (= la caméra),
 *    `OB:ecrasement_echelle` scale (sx, sy, sx), `OB:ecrasement_retour` rotation_quaternion (son inverse) ;
 *  - `OB:nuages` rotation_euler (0, spin, 0), scale (0 quand three les cache) ;
 *  - `OB:repere` location, rotation_quaternion, scale (fixes) ; ses enfants `OB:point` et `OB:drapeau` location,
 *    scale (0 = caché), et rotation_quaternion du drapeau ;
 *  - `CU:frontiere` bevel_factor_end ; `OB:perle` location (sur `frontiere.json`), scale (0 = cachée) ;
 *  - `OB:logo_00` … `_07`, `OB:titre_00` … `_07` : location (repère local de la caméra, à PROFONDEUR.lettres),
 *    rotation_euler (0, 0, −rot), scale (police · unités/px · échelle), color (1, 1, 1, alpha) ;
 *  - `OB:etoile_00` … `_45` : location (local caméra, à PROFONDEUR.etoiles), scale (rayon en unités), color (1, 1, 1, alpha).
 */
export function cles(cadrage: Cadrage, s: Sources): Cles {
  const video = CADRAGES[cadrage], T = TITRES[cadrage], frames = nombreImages(), rep = repere(s.reperes.paris);
  const pistes = new Map<string, Piste>();
  const poser = (id: string, chemin: string, v: readonly number[]) => {
    const cle = `${id} ${chemin}`;
    let p = pistes.get(cle);
    if (!p) pistes.set(cle, (p = { id, chemin, dim: v.length, valeurs: [] }));
    p.valeurs.push(...v);
  };
  const visible: Record<'OB:point' | 'OB:drapeau' | 'OB:perle', boolean[]> = { 'OB:point': [], 'OB:drapeau': [], 'OB:perle': [] };
  let fovY = NaN;
  for (let k = 0; k < frames; k++) {
    const t = k / IPS_MAITRE, f = frameAt(t, cadrage), c = f.camera, d = Math.hypot(...c.position);
    if (k === 0) fovY = c.fov;
    else if (c.fov !== fovY) throw new Error(`champ de la caméra variable (${c.fov}° à ${t} s) : la caméra de Blender a un champ fixe`);
    if (PROFONDEUR.etoiles < d + RAYON_MAX) throw new Error(`étoiles devant la Terre à ${t} s (caméra à ${d})`);
    if ([...f.logo, ...f.titre].some((a) => a.alpha > 0) && PROFONDEUR.lettres > d - RAYON_MAX) throw new Error(`lettres derrière la Terre à ${t} s (caméra à ${d})`);
    const M = matriceEcrasement(c, f.squash), mRep = M.clone().multiply(rep.m), [qx, qy, qz, qw] = c.quaternion;
    poser('OB:camera', 'location', c.position);
    poser('OB:camera', 'rotation_quaternion', quatBlender(c.quaternion));
    poser('OB:ecrasement_rot', 'rotation_quaternion', quatBlender(c.quaternion));
    poser('OB:ecrasement_echelle', 'scale', [f.squash.sx, f.squash.sy, f.squash.sx]);
    poser('OB:ecrasement_retour', 'rotation_quaternion', quatBlender([-qx, -qy, -qz, qw]));
    const sn = f.clouds.scale > 0.001 ? f.clouds.scale : 0;   // three les cache sous 0,001 (scene.ts:239)
    poser('OB:nuages', 'rotation_euler', [0, f.clouds.spin, 0]);
    poser('OB:nuages', 'scale', [sn, sn, sn]);
    poser('OB:repere', 'location', s.reperes.paris);
    poser('OB:repere', 'rotation_quaternion', quatBlender([rep.q.x, rep.q.y, rep.q.z, rep.q.w]));
    poser('OB:repere', 'scale', [REPERE_ECHELLE, REPERE_ECHELLE, REPERE_ECHELLE]);
    visible['OB:point'].push(f.point.visible);
    poser('OB:point', 'location', [0, f.point.y, 0]);
    poser('OB:point', 'scale', f.point.visible ? [f.point.sxz, f.point.sy, f.point.sxz] : [0, 0, 0]);
    visible['OB:drapeau'].push(f.flag.visible);
    poser('OB:drapeau', 'location', [0, f.flag.y, 0]);
    const qd = quatDrapeau(c, mRep);
    poser('OB:drapeau', 'rotation_quaternion', quatBlender([qd.x, qd.y, qd.z, qd.w]));
    poser('OB:drapeau', 'scale', f.flag.visible ? [f.flag.sx, f.flag.sy, f.flag.sx] : [0, 0, 0]);
    poser('CU:frontiere', 'bevel_factor_end', [f.border]);
    visible['OB:perle'].push(f.bead !== null);
    poser('OB:perle', 'location', surFrontiere(s.frontiere, Math.min(0.9999, f.bead ?? 0)));   // scene.ts:259
    poser('OB:perle', 'scale', f.bead === null ? [0, 0, 0] : [PERLE, PERLE, PERLE]);
    // les deux titres en pâte : chaque lettre autour de son centre mesuré (cadrages.ts), dans le plan de l'image
    const kl = unitesParPx(PROFONDEUR.lettres, c.fov, video);
    for (const [nom, titre, anims] of [['logo', T.logo, f.logo], ['titre', T.titre, f.titre]] as const) {
      anims.forEach((a, i) => {
        const id = `OB:${nom}_${String(i).padStart(2, '0')}`, l = titre.lettres[i]!, e = titre.police * kl * a.echelle;
        poser(id, 'location', versCamera(l.x + a.dx, l.y + a.dy, PROFONDEUR.lettres, c.fov, video));
        poser(id, 'rotation_euler', [0, 0, -a.rot]);   // rot tourne dans le sens horaire à l'écran, comme rotate() en CSS
        poser(id, 'scale', [e, e, e]);
        poser(id, 'color', [1, 1, 1, a.alpha]);
      });
    }
    const ke = unitesParPx(PROFONDEUR.etoiles, c.fov, video);
    f.etoiles.forEach((e, i) => {
      const id = `OB:etoile_${String(i).padStart(2, '0')}`, r = e.r * ke * e.echelle;
      poser(id, 'location', versCamera(e.x, e.y, PROFONDEUR.etoiles, c.fov, video));
      poser(id, 'scale', [r, r, r]);
      poser(id, 'color', [1, 1, 1, e.alpha]);
    });
  }
  for (const [id, vis] of Object.entries(visible))
    for (const p of pistes.values()) if (p.id === id && p.chemin !== 'scale') remplirCachees(p, vis);
  for (const p of pistes.values()) {
    if (p.chemin === 'rotation_quaternion') signesContinus(p.valeurs);
    p.valeurs = p.valeurs.map(arrondi);
  }
  return { version: 1, cadrage, width: video.width, height: video.height, fps: IPS_MAITRE, frames, fovY, pistes: [...pistes.values()] };
}

/**
 * Ancres des bulles en px de la vidéo, de ANCRES_T0 à BULLES_RANGE au pas de 1/ANCRES_IPS : capitale = le centre du point
 * de pâte (Paris), pays = le milieu de la frontière, drapeau = le haut du mât, penché et tourné avec le drapeau (scene.ts:263
 * l'omettait : jusqu'à 45 px d'écart en portrait). Hors cadre, la valeur est gardée telle quelle (le lecteur borne la bulle).
 */
export function ancres(r: Reperes): Ancres {
  const rep = repere(r.paris), n = Math.round((BULLES_RANGE - ANCRES_T0) * ANCRES_IPS) + 1;
  const px = ([x, y]: [number, number]): [number, number] => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  const cadrages = {} as Ancres['cadrages'];
  for (const cadrage of Object.keys(CADRAGES) as Cadrage[]) {
    const video = CADRAGES[cadrage], a: Ancres['cadrages'][Cadrage] = { ...video, capitale: [], pays: [], drapeau: [] };
    for (let i = 0; i < n; i++) {
      const f = frameAt(ANCRES_T0 + i / ANCRES_IPS, cadrage), M = matriceEcrasement(f.camera, f.squash), mRep = M.clone().multiply(rep.m);
      const vers = (m: THREE.Matrix4, p: Vec3) => { const v = new THREE.Vector3(...p).applyMatrix4(m); return px(projeter([v.x, v.y, v.z], f.camera, video)); };
      a.capitale.push(vers(mRep, [0, f.point.visible ? f.point.y : 0, 0]));
      a.pays.push(vers(M, r.frontiereMilieu));
      const mat = new THREE.Matrix4().compose(new THREE.Vector3(0, f.flag.y, 0), quatDrapeau(f.camera, mRep), new THREE.Vector3(f.flag.sx, f.flag.sy, f.flag.sx));
      a.drapeau.push(vers(mRep.clone().multiply(mat), [0, MAT_HM, 0]));
    }
    cadrages[cadrage] = a;
  }
  return { version: 1, fps: ANCRES_IPS, t0: ANCRES_T0, cadrages };
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const lire = <T>(f: string): T => {
    try { return JSON.parse(readFileSync(path.join(ICI, '.cache/sources', f), 'utf8')) as T; }
    catch { throw new Error(`.cache/sources/${f} illisible : lancer d'abord npm run intro:sources`); }
  };
  const s: Sources = { reperes: lire<Reperes>('reperes.json'), frontiere: lire<Vec3[]>('frontiere.json') };
  for (const cadrage of Object.keys(CADRAGES) as Cadrage[]) {
    const k = cles(cadrage, s), f = path.join(ICI, `.cache/keys-${cadrage}.json`);
    writeFileSync(f, JSON.stringify(k));
    console.log(`keys-${cadrage}.json : ${k.frames} images, ${k.pistes.length} pistes, ${statSync(f).size} octets`);
  }
  const fa = path.resolve(ICI, '../../public/intro/ancres.json'), a = ancres(s.reperes);
  writeFileSync(fa, JSON.stringify(a));
  console.log(`ancres.json : t0 ${a.t0} s, ${a.cadrages.portrait.capitale.length} instants par bulle, ${statSync(fa).size} octets`);
}
