import * as THREE from 'three/webgpu';
import { LOGO_LETTRES, LOGO_TOUR_S } from './temps';

export { LOGO_LETTRES, LOGO_TOUR_S };

/**
 * GELÉE : chronologie de l'intro three.js, gardée telle quelle pour `scene.ts` et `Intro.tsx` jusqu'au lecteur vidéo,
 * qui les supprime avec elle (plan de l'intro vidéo, Task 10). La chronologie vivante est `timeline.ts`.
 *
 * Chronologie de l'intro en pâte à modeler, en fonctions pures du temps. Déroulé validé par l'utilisateur le 10/10 :
 * la Terre tombe du ciel et tourne ; un premier dézoom en fait le « o » de C🌍untrizz au milieu de l'écran ; rezoom vers
 * la France (point, frontière, drapeau, vignette) ; un second dézoom la loge dans le « o » du titre de l'accueil.
 * La Terre en pâte est la sphère unité fixe à l'origine (repère du globe : lng 0 → +X, lng 90 → −Z, pôle Nord → +Y) ;
 * c'est la caméra qui bouge : la Terre est placée à l'écran (centre, rayon en px CSS) par une caméra fixe de 20°,
 * ramenée dans son repère. Les cibles des deux « o » sont mesurées dans la page (Intro.tsx) ; `defaultTargets` sert
 * aux tests et en attendant la mesure. Longueurs du prototype : px d'une scène 390 × 844, `U = min(largeur, ½ hauteur)`.
 */
export const INTRO = {
  /** Début de la chute de la Terre : il faut ses textures. */
  CHUTE: 1.2,
  /** L'accueil se monte (titre, commandes) ; la Terre part vers le « o » du titre. */
  ACCUEIL: 16.2,
  /** Le vrai globe reprend son rendu, le fond de nuit s'efface : il faut le globe. */
  FONDU: 17.4,
  /** Fin : la petite Terre animée du titre prend le relais de la 3D. */
  FIN: 19.0,
  /** Stop motion « en deux » : 12 images par seconde. */
  IPS: 12,
} as const;

export const PARIS: readonly [number, number] = [2.35, 48.86];
/** Repère posé à Paris : rayon de la bille, hauteur du mât (unités du repère, qui est grossi × 1,6). */
export const POINT_RP = 0.0062, MAT_HM = 0.135, REPERE_ECHELLE = 1.6;

export interface Viewport { width: number; height: number }
export interface Target { x: number; y: number; r: number }
/** Les deux « o » : celui du logo au milieu de l'écran, celui du titre de l'accueil (px CSS). */
export interface Targets { logo: Target; titre: Target }
export interface IntroCamera { position: [number, number, number]; quaternion: [number, number, number, number]; fov: number }
export interface IntroFrame {
  camera: IntroCamera;
  /** Écrasement de la Terre (axe vertical de l'image) à l'impact ; 1 = ronde. */
  squash: { sx: number; sy: number };
  /** Flou (px) et opacité du canvas pendant la chute. */
  blur: number;
  opacity: number;
  /** Opacité du fond de nuit et de ses étoiles (le vrai globe apparaît dessous pendant le fondu). */
  backdrop: number;
  /** Nuages : échelle (ils se retirent avant le premier dézoom) et rotation propre (rad). */
  clouds: { scale: number; spin: number };
  point: { visible: boolean; y: number; sxz: number; sy: number };
  /** Part de la frontière déroulée (0 → 1) ; `bead` : la perle au bout, visible pendant le déroulé. */
  border: number;
  bead: number | null;
  flag: { visible: boolean; sx: number; sy: number; y: number };
  label: { opacity: number; scale: number };
  /** Logo du milieu : progression d'entrée de chaque lettre (0 → 1), puis leur envol (0 → 1). */
  logo: { letters: number[]; out: number };
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const s5 = (x: number) => { x = clamp01(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const sortie = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
/** Dépassement puis retour (easeOutBack). */
export const rebond = (x: number, k = 1.9) => { x = clamp01(x) - 1; return 1 + (k + 1) * x * x * x + k * x * x; };
/** Oscillation amortie (0 en u = 0). */
const ressort = (u: number, f = 2.6, amort = 5) => (u <= 0 ? 0 : Math.exp(-amort * u) * Math.sin(2 * Math.PI * f * u));
const phase = (t: number, a: number, d: number) => (t - a) / d;
/** Hermite cubique : de (p0, pente v0) à (p1, pente v1) entre t0 et t1. */
function hermite(t: number, t0: number, t1: number, p0: number, p1: number, v0: number, v1: number): number {
  const d = t1 - t0, s = clamp01((t - t0) / d), s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * d * v0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * d * v1;
}
const RAD = Math.PI / 180;
const U0 = 390, H0 = 844;
const unit = (vp: Viewport) => Math.min(vp.width, vp.height / 2) / U0;

/** Cibles approchées (avant la mesure dans la page) : le logo au milieu, le titre de l'accueil (Chango 54 px à 110 px). */
export function defaultTargets(vp: Viewport): Targets {
  const u = unit(vp);
  return {
    logo: { x: vp.width / 2 - 70 * u, y: vp.height / 2, r: 21 * u },
    titre: { x: vp.width / 2 - 104 * u, y: 151 * u, r: 16 * u },
  };
}

// ---------- les étapes ----------
const T_SOL = INTRO.CHUTE + 1.6;            // la Terre touche le sol
const DEZOOM1 = 5.0, D_DEZOOM1 = 1.4;       // premier dézoom : vers le « o » du logo
const LETTRES = 5.6;                        // les lettres surgissent
const REZOOM = 8.0, D_REZOOM = 2.0;         // rezoom vers la France
const RETRAIT = 15.4;                       // le drapeau et la frontière se rangent
const DEZOOM2 = 15.6, D_DEZOOM2 = INTRO.FONDU + 0.2 - 15.6;   // second dézoom : vers le « o » du titre

// ---------- la toupie ----------
const BETA = 40 * RAD;                      // au gros plan, Paris est 40° au-dessus du centre du disque
const CIBLE = -Math.PI / 2 - PARIS[0] * RAD;
const W_MAX = 2 * Math.PI * 0.72;           // 0,72 tour/s au plus : 21,6° par image à 12 i/s
const W_LOGO = 0.3;                         // rotation lente pendant le logo (rad/s)
const W_TITRE = (2 * Math.PI) / LOGO_TOUR_S;
const T_FREIN = T_SOL + 0.8, T_LOGO = T_FREIN + 1.8;
const R3 = 0.6;                                         // reste à tourner au début du rezoom
const R2 = R3 + W_LOGO * (REZOOM - T_LOGO);
const R1 = R2 + ((W_MAX + W_LOGO) / 2) * (T_LOGO - T_FREIN);
/** Angle qui reste à tourner avant que Paris soit face à nous (rad). */
function resteAngle(t: number): number {
  if (t < T_FREIN) return R1 + W_MAX * (T_FREIN - t);
  if (t < T_LOGO) return hermite(t, T_FREIN, T_LOGO, R1, R2, -W_MAX, -W_LOGO);
  if (t < REZOOM) return R2 - W_LOGO * (t - T_LOGO);
  if (t < REZOOM + D_REZOOM) return hermite(t, REZOOM, REZOOM + D_REZOOM, R3, 0, -W_LOGO, 0);
  const wobble = -0.16 * ressort(Math.min(t, DEZOOM2) - REZOOM - D_REZOOM, 1.6, 4.5);
  if (t < DEZOOM2) return wobble;
  // vers le titre : elle se remet à tourner ; la vitesse monte en 1,2 s jusqu'à celle de la petite Terre du titre
  const u = t - DEZOOM2, RAMPE = 1.2;
  const tourne = u < RAMPE ? (W_TITRE * u * u) / (2 * RAMPE) : W_TITRE * (RAMPE / 2 + (u - RAMPE));
  return wobble - tourne;
}
/** 0 : axe incliné de 23,4°, vue de côté ; 1 : axe redressé, Paris 40° au-dessus du centre (gros plan). */
function redresse(t: number): number {
  if (t < DEZOOM2) return s5(phase(t, REZOOM, D_REZOOM));
  return 1 - s5(phase(t, DEZOOM2, D_DEZOOM2));
}
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
function orientation(t: number, out = new THREE.Quaternion()): THREE.Quaternion {
  const k = redresse(t);
  const qa = new THREE.Quaternion().setFromAxisAngle(AZ, -23.4 * RAD * (1 - k));
  const qb = new THREE.Quaternion().setFromAxisAngle(AX, (PARIS[1] * RAD - BETA) * k);
  const qc = new THREE.Quaternion().setFromAxisAngle(AY, CIBLE - resteAngle(t) - (1 - k) * 0.35);
  return out.copy(qa).multiply(qb).multiply(qc);
}
/**
 * Angle de la Terre (rotation autour de son axe incliné, dans [0, 2π[) : la petite Terre animée du titre part de
 * l'image qui lui correspond (ses 24 images couvrent un tour, `Z(−23,4°)·Y(angle)`).
 */
export function logoAngleAt(t: number): number {
  const a = CIBLE - resteAngle(t) - 0.35;
  return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

// ---------- où est la Terre à l'écran ----------
const R_LOIN = 115, R_PRES = 507, CY_LOIN = 470, PARIS_Y = 430;
interface Placement { cx: number; cy: number; R: number; blur: number; opacity: number; sx: number; sy: number }
function placement(t: number, vp: Viewport, c: Targets): Placement {
  const u = unit(vp), hy = vp.height / H0;
  const rl = R_LOIN * u, rp = R_PRES * u, cyl = CY_LOIN * hy, cx0 = vp.width / 2;
  if (t < T_SOL) {                                  // elle tombe du ciel, énorme, floue, puis nette
    const v = clamp01(phase(t, INTRO.CHUTE, 1.6));
    return { cx: cx0, cy: lerp(-560 * hy, cyl, v * v), R: lerp(rl * 2.3, rl, sortie(v)), blur: 30 * Math.pow(1 - v, 1.6),
      opacity: clamp01(phase(t, INTRO.CHUTE, 0.6)), sx: 1 - 0.06 * v, sy: 1 + 0.12 * v };
  }
  if (t < DEZOOM1) {                                // l'impact : elle s'écrase, rebondit, se calme
    const w = t - T_SOL, o = ressort(w, 2.2, 4.2), sy = 1 - 0.2 * o;
    const cy = cyl - 20 * hy * Math.max(0, Math.sin(Math.PI * clamp01(w / 0.42))) * (1 - clamp01(w / 0.42) * 0.3) + rl * (1 - sy);
    return { cx: cx0, cy, R: rl, blur: 0, opacity: 1, sx: 1 + 0.14 * o, sy };
  }
  if (t < REZOOM) {                                 // premier dézoom : elle devient le « o » du logo
    const z = s5(phase(t, DEZOOM1, D_DEZOOM1));
    return { cx: lerp(cx0, c.logo.x, z), cy: lerp(cyl, c.logo.y, z), R: rl * Math.pow(c.logo.r / rl, z), blur: 0, opacity: 1, sx: 1, sy: 1 };
  }
  // rezoom : Paris glisse vers sa place, le disque grandit autour (l'horizon reste visible)
  const proche = (tt: number) => {
    const z = s5(phase(tt, REZOOM, D_REZOOM)), lent = 1 + 0.035 * clamp01(phase(Math.min(tt, DEZOOM2), 10.3, 5.3));
    const R = c.logo.r * Math.pow((rp / c.logo.r) * lent, z);
    const parisY = lerp(c.logo.y, PARIS_Y * hy, z);
    return { cx: lerp(c.logo.x, cx0, z), cy: parisY + R * Math.sin(BETA) * redresse(tt), R };
  };
  if (t < DEZOOM2) return { ...proche(t), blur: 0, opacity: 1, sx: 1, sy: 1 };
  // second dézoom : vers le « o » du titre de l'accueil
  const a = proche(DEZOOM2), z = s5(phase(t, DEZOOM2, D_DEZOOM2));
  return { cx: lerp(a.cx, c.titre.x, z), cy: lerp(a.cy, c.titre.y, z), R: a.R * Math.pow(c.titre.r / a.R, z), blur: 0, opacity: 1, sx: 1, sy: 1 };
}

/** Caméra fixe de 20° ramenée dans le repère de la Terre : position Q⁻¹(−T)/R, orientation Q⁻¹. */
const FOV = 20, PROF = 12;
function camera(t: number, vp: Viewport, c: Targets): IntroCamera { return cameraFrom(placement(t, vp, c), orientation(t), vp); }
function cameraFrom(p: { cx: number; cy: number; R: number }, q: THREE.Quaternion, vp: Viewport): IntroCamera {
  const k = PROF * Math.tan((FOV * RAD) / 2) / (vp.height / 2);   // px → unités du monde à la profondeur PROF
  const T = new THREE.Vector3((p.cx - vp.width / 2) * k, -(p.cy - vp.height / 2) * k, -PROF);
  const qi = q.clone().invert();
  const pos = T.clone().multiplyScalar(-1 / (p.R * k)).applyQuaternion(qi);
  return { position: pos.toArray() as [number, number, number], quaternion: qi.toArray() as [number, number, number, number], fov: FOV };
}

/**
 * Une image de la petite Terre du titre (fabrication du sprite, `?introSprite=` en dev) : la Terre seule au centre, axe
 * incliné comme pendant le logo, tournée de `angle` (rad) — la même orientation que `logoAngleAt`.
 */
export function spriteFrame(angle: number, vp: Viewport): IntroFrame {
  const base = frameAt(7, vp);
  const q = new THREE.Quaternion().setFromAxisAngle(AZ, -23.4 * RAD).multiply(new THREE.Quaternion().setFromAxisAngle(AY, angle));
  const R = 0.45 * Math.min(vp.width, vp.height);
  return { ...base, camera: cameraFrom({ cx: vp.width / 2, cy: vp.height / 2, R }, q, vp), backdrop: 0, clouds: { scale: 0.0001, spin: 0 }, logo: { letters: base.logo.letters.map(() => 0), out: 1 } };
}

export function frameAt(t: number, vp: Viewport, c: Targets = defaultTargets(vp)): IntroFrame {
  const p = placement(t, vp, c);
  const retrait = 1 - s5(phase(t, RETRAIT, 0.7));   // le drapeau et la frontière se rangent

  // le point tombe sur Paris (10,0 s), s'écrase en pastille et y reste : le drapeau en sortira
  const ue = phase(t, 10.0, 0.42);
  let point: IntroFrame['point'] = { visible: false, y: 0, sxz: 0, sy: 0 };
  if (ue >= 0 && retrait > 0.01) {
    const chute = clamp01(ue), o = ue > 1 ? ressort(t - 10.42, 2.6, 5.5) : 0, tasse = ue > 1 ? s5((t - 10.42) / 0.5) : 0;
    const sy = (chute < 1 ? 1.25 : 1) * (1 - 0.42 * tasse) * (1 - 0.3 * o), sxz = (chute < 1 ? 0.85 : 1) * (1 + 0.3 * tasse) * (1 + 0.22 * o);
    point = { visible: true, y: POINT_RP * sy * 0.8 + 0.5 * (1 - chute * chute), sxz: POINT_RP * sxz * retrait, sy: POINT_RP * sy * retrait };
  }
  const f = clamp01(phase(t, 10.7, 1.5));
  const border = retrait > 0.01 ? sortie(f) * retrait : 0;
  const ud = phase(t, 12.2, 0.9);
  let flag: IntroFrame['flag'] = { visible: false, sx: 0, sy: 0, y: 0 };
  if (ud >= 0 && retrait > 0.01) {
    const o = ressort(ud, 2.2, 4.5), grand = sortie(ud * 2.2), D = 0.5 * retrait;
    flag = { visible: true, sx: grand * (1 - 0.18 * o) * D, sy: grand * (1 + 0.32 * o) * D, y: POINT_RP * 0.45 };
  }
  const uv = phase(t, 12.9, 0.45);
  const label = uv < 0 || retrait < 0.01 ? { opacity: 0, scale: 0 } : { opacity: clamp01(uv * 3) * retrait, scale: rebond(uv, 2.4) * (0.4 + 0.6 * retrait) };
  // les lettres du logo : « C » d'abord, puis « untrizz », chacune avec élan ; elles s'envolent au rezoom
  const letters = LOGO_LETTRES.map((_, i) => clamp01(phase(t, LETTRES + 0.09 * i, 0.45)));

  return {
    camera: camera(t, vp, c),
    squash: { sx: p.sx, sy: p.sy },
    blur: p.blur,
    opacity: p.opacity,
    backdrop: 1 - s5(phase(t, INTRO.FONDU, INTRO.FIN - INTRO.FONDU)),
    clouds: { scale: Math.max(0.0001, 1 - s5(phase(t, DEZOOM1 - 0.3, 0.8))), spin: t * 0.16 },
    point,
    border,
    bead: f > 0 && f < 1 && retrait > 0.01 ? sortie(f) : null,
    flag,
    label,
    logo: { letters, out: clamp01(phase(t, REZOOM, 0.5)) },
  };
}
