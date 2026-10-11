import * as THREE from 'three/webgpu';
import { REFERENCES, TITRES } from './cadrages';
import { BULLES_RANGE, CADRAGES, INTRO, LOGO_LETTRES, LOGO_TOUR_S, type Cadrage } from './temps';

/**
 * Chronologie de l'intro en pâte à modeler, en fonctions pures du temps : la source unique des clés de la vidéo Blender
 * (spec `2026-10-11-countrizz-intro-video-blender-design.md` §2-3). Déroulé du 10/10 : la Terre tombe du ciel (lente au
 * départ, puis de plus en plus vite) et tourne ; un premier dézoom en fait le « o » de C🌍untrizz au milieu de l'image ;
 * rezoom vers la France (point, frontière, drapeau ; les bulles du site s'y posent) ; un second dézoom la loge dans le
 * « o » du titre de fin. La Terre en pâte est la sphère unité fixe à l'origine (repère du globe : lng 0 → +X,
 * lng 90 → −Z, pôle Nord → +Y) ; c'est la caméra qui bouge : la Terre est placée à l'image (centre, rayon en px de la
 * vidéo) par une caméra fixe de 20°, ramenée dans son repère. Deux cadrages (temps.ts) ; les deux « o » et les lettres
 * des titres sont mesurés une fois pour toutes (cadrages.ts). Longueurs du prototype : px d'une scène 390 × 844,
 * `U = min(largeur, ½ hauteur)`.
 */

export const PARIS: readonly [number, number] = [2.35, 48.86];
/** Repère posé à Paris : rayon de la bille, hauteur du mât (unités du repère, qui est grossi × 1,6). */
export const POINT_RP = 0.0062, MAT_HM = 0.135, REPERE_ECHELLE = 1.6;

export interface IntroCamera { position: [number, number, number]; quaternion: [number, number, number, number]; fov: number }
/**
 * Une lettre d'un titre, autour de son centre mesuré (cadrages.ts) : décalage (px de la vidéo), échelle, rotation (rad,
 * sens horaire à l'image, comme `rotate` en CSS) et opacité.
 */
export interface LettreAnim { dx: number; dy: number; echelle: number; rot: number; alpha: number }
export interface IntroFrame {
  /** Caméra dans le repère de la Terre (repère three, Y en haut), quaternion [x, y, z, w], champ vertical 20°. */
  camera: IntroCamera;
  /** Étirement de la Terre le long de l'axe vertical de l'image : allongée avant l'impact, écrasée après ; 1 = ronde. */
  squash: { sx: number; sy: number };
  /** Nuages : échelle (ils se retirent avant le premier dézoom) et rotation propre (rad). */
  clouds: { scale: number; spin: number };
  point: { visible: boolean; y: number; sxz: number; sy: number };
  /** Part de la frontière déroulée (0 → 1) ; `bead` : la perle au bout, visible pendant le déroulé. */
  border: number;
  bead: number | null;
  flag: { visible: boolean; sx: number; sy: number; y: number };
  /** Les 8 lettres du logo du milieu (ordre LOGO_LETTRES) : elles surgissent au premier dézoom, s'envolent au rezoom. */
  logo: LettreAnim[];
  /** Les 8 lettres du titre de fin : elles surgissent comme celles de l'accueil (home.css `.logo-l`), après ACCUEIL. */
  titre: LettreAnim[];
  /** Les 46 étoiles en billes : centre et rayon (px de la vidéo), opacité, échelle. */
  etoiles: { x: number; y: number; r: number; alpha: number; echelle: number }[];
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
/** Courbe CSS `cubic-bezier(x1, y1, x2, y2)` : x résolu par Newton, puis par dichotomie s'il le faut. */
function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s: number) => ((ax * s + bx) * s + cx) * s, Y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let s = x;
    for (let i = 0; i < 8; i++) {
      const f = X(s) - x, d = dX(s);
      if (Math.abs(f) < 1e-9) return Y(s);
      if (Math.abs(d) < 1e-6) break;
      s -= f / d;
    }
    let a = 0, b = 1;
    s = x;
    while (b - a > 1e-9) { if (X(s) < x) a = s; else b = s; s = (a + b) / 2; }
    return Y(s);
  };
}
/** L'élan des entrées de l'accueil (home.css : `cubic-bezier(.25, .46, .45, 1.54)`). */
const ELAN = bezier(0.25, 0.46, 0.45, 1.54);
const RAD = Math.PI / 180;
const U0 = 390, H0 = 844;
interface Ecran { width: number; height: number }
interface Cible { x: number; y: number; r: number }
const unit = (vp: Ecran) => Math.min(vp.width, vp.height / 2) / U0;

// ---------- les étapes (s) : tout ce qui suit la chute de 2,4 s est décalé de +0,8 s (spec vidéo §3.1) ----------
const T_SOL = INTRO.CHUTE + INTRO.D_CHUTE;  // 3,6 : la Terre touche le sol
const DEZOOM1 = 5.8, D_DEZOOM1 = 1.4;       // premier dézoom : vers le « o » du logo
const LETTRES = 6.4, D_LETTRE = 0.45;       // les lettres du logo surgissent (0,09 s d'écart, 0,45 s chacune)
const REZOOM = 8.8, D_REZOOM = 2.0;         // rezoom vers la France
const T_POINT = 10.8, D_POINT = 0.42;       // le point tombe sur Paris
const T_LENT = 11.1;                        // gros plan : le disque grandit encore un peu, lentement, jusqu'au second dézoom
const T_FRONTIERE = 11.5, D_FRONTIERE = 1.5;   // la frontière se déroule
const T_DRAPEAU = 13.0, D_DRAPEAU = 0.9;    // le drapeau sort du point
const RETRAIT = BULLES_RANGE, D_RETRAIT = 0.7;   // le drapeau, la frontière et les bulles se rangent
const DEZOOM2 = 16.4, D_DEZOOM2 = INTRO.FONDU + 0.2 - DEZOOM2;   // second dézoom : vers le « o » du titre
const T_TITRE = INTRO.ACCUEIL + 0.5;        // lettres du titre : au rythme de celles de l'accueil, monté à ACCUEIL

// ---------- la toupie ----------
const BETA = 40 * RAD;                      // au gros plan, Paris est 40° au-dessus du centre du disque
const CIBLE = -Math.PI / 2 - PARIS[0] * RAD;
const W_MAX = 2 * Math.PI * 0.72;           // 0,72 tour/s au plus : 2,16° par image à 120 i/s
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

// ---------- où est la Terre à l'image ----------
const R_LOIN = 115, R_PRES = 507, CY_LOIN = 470, PARIS_Y = 430;
/**
 * La chute : rayon au départ (× celui d'arrivée), hauteur de départ (en rayons au-dessus du bord haut : nuages compris,
 * rien ne dépasse dans l'image), allongement à l'impact (il suit la vitesse, en v²).
 */
const R_CHUTE = 2.3, HORS_CADRE = 1.4, ALLONGE = 0.12;
/** L'impact : l'allongement se mue en écrasement sans saut (pente de départ en 1/s, fréquence en Hz, amortissement en 1/s). */
const PENTE_IMPACT = 2.0, F_IMPACT = 1.8, AMORTI = 3;
/** Largeur à l'impact : `sx = 1 − LARGE·(sy − 1)` (la pâte s'étale quand elle s'écrase). */
const LARGE = 0.7;
/** Écart à la forme ronde (`sy − 1`) après l'impact (`w` en s) : part de l'allongement de la chute, oscille, s'amortit. */
function ecartImpact(w: number): number {
  const om = 2 * Math.PI * F_IMPACT, b = (AMORTI * ALLONGE - PENTE_IMPACT) / om;
  return Math.exp(-AMORTI * w) * (ALLONGE * Math.cos(om * w) + b * Math.sin(om * w));
}
interface Placement { cx: number; cy: number; R: number; sx: number; sy: number }
function placement(t: number, vp: Ecran, c: { logo: Cible; titre: Cible }): Placement {
  const u = unit(vp), hy = vp.height / H0;
  const rl = R_LOIN * u, rp = R_PRES * u, cyl = CY_LOIN * hy, cx0 = vp.width / 2;
  if (t < T_SOL) {                                  // elle tombe du ciel : grande, presque en flottant, puis de plus en plus vite
    const v = clamp01(phase(t, INTRO.CHUTE, INTRO.D_CHUTE)), v3 = v * v * v, e = ALLONGE * v * v;
    const R0 = rl * R_CHUTE;
    // le centre arrive là où le bas de la Terre allongée touche le sol (comme après l'impact)
    return { cx: cx0, cy: lerp(-HORS_CADRE * R0, cyl - rl * ALLONGE, v3), R: lerp(R0, rl, v3), sx: 1 - LARGE * e, sy: 1 + e };
  }
  if (t < DEZOOM1) {                                // l'impact : elle s'écrase, rebondit, se calme
    const w = t - T_SOL, e = ecartImpact(w);
    const cy = cyl - 20 * hy * Math.max(0, Math.sin(Math.PI * clamp01(w / 0.42))) * (1 - clamp01(w / 0.42) * 0.3) - rl * e;
    return { cx: cx0, cy, R: rl, sx: 1 - LARGE * e, sy: 1 + e };
  }
  if (t < REZOOM) {                                 // premier dézoom : elle devient le « o » du logo
    const z = s5(phase(t, DEZOOM1, D_DEZOOM1));
    return { cx: lerp(cx0, c.logo.x, z), cy: lerp(cyl, c.logo.y, z), R: rl * Math.pow(c.logo.r / rl, z), sx: 1, sy: 1 };
  }
  // rezoom : Paris glisse vers sa place, le disque grandit autour (l'horizon reste visible)
  const proche = (tt: number) => {
    const z = s5(phase(tt, REZOOM, D_REZOOM)), lent = 1 + 0.035 * clamp01(phase(Math.min(tt, DEZOOM2), T_LENT, DEZOOM2 - T_LENT));
    const R = c.logo.r * Math.pow((rp / c.logo.r) * lent, z);
    const parisY = lerp(c.logo.y, PARIS_Y * hy, z);
    return { cx: lerp(c.logo.x, cx0, z), cy: parisY + R * Math.sin(BETA) * redresse(tt), R };
  };
  if (t < DEZOOM2) return { ...proche(t), sx: 1, sy: 1 };
  // second dézoom : vers le « o » du titre de fin
  const a = proche(DEZOOM2), z = s5(phase(t, DEZOOM2, D_DEZOOM2));
  return { cx: lerp(a.cx, c.titre.x, z), cy: lerp(a.cy, c.titre.y, z), R: a.R * Math.pow(c.titre.r / a.R, z), sx: 1, sy: 1 };
}

/** Caméra fixe de 20° ramenée dans le repère de la Terre : position Q⁻¹(−T)/R, orientation Q⁻¹. */
const FOV = 20, PROF = 12;
function cameraFrom(p: { cx: number; cy: number; R: number }, q: THREE.Quaternion, vp: Ecran): IntroCamera {
  const k = PROF * Math.tan((FOV * RAD) / 2) / (vp.height / 2);   // px → unités du monde à la profondeur PROF
  const T = new THREE.Vector3((p.cx - vp.width / 2) * k, -(p.cy - vp.height / 2) * k, -PROF);
  const qi = q.clone().invert();
  const pos = T.clone().multiplyScalar(-1 / (p.R * k)).applyQuaternion(qi);
  return { position: pos.toArray() as [number, number, number], quaternion: qi.toArray() as [number, number, number, number], fov: FOV };
}

// ---------- les lettres et les étoiles (px de la vidéo) ----------
/**
 * Logo du milieu (formules de l'intro three.js du 10/10, en px CSS de l'écran de référence, × `e`) : « C » arrive de la
 * gauche, « untrizz » lettre après lettre en tournant, chacune avec élan ; tout s'envole au rezoom.
 */
function lettresLogo(t: number, e: number): LettreAnim[] {
  const out = clamp01(phase(t, REZOOM, 0.5));
  return LOGO_LETTRES.map((_, i) => {
    const p = clamp01(phase(t, LETTRES + 0.09 * i, D_LETTRE)), k = rebond(p, 2.2), alpha = Math.min(1, p * 3) * (1 - out);
    if (i === 0) return { dx: (-80 * (1 - k) - 260 * out) * e, dy: 0, echelle: 1, rot: 0, alpha };
    return { dx: (60 + 25 * i) * out * e, dy: 30 * (1 - k) * e, echelle: Math.max(0.01, k), rot: (1 - k) * (i % 2 ? 12 : -12) * RAD, alpha };
  });
}
/**
 * Titre de fin : l'animation des lettres de l'accueil (home.css `.logo-l` : 0,45 s, retard 0,5 s + 0,09 s·i ; depuis
 * `translateY(.3em) scale(0)` avec l'élan ; opacité de 0 à 1 sur les premiers 40 %, avec l'élan, bornée à 1).
 */
function lettresTitre(t: number, police: number): LettreAnim[] {
  return LOGO_LETTRES.map((_, i) => {
    const p = clamp01(phase(t, T_TITRE + 0.09 * i, D_LETTRE)), k = ELAN(p);
    return { dx: 0, dy: 0.3 * police * (1 - k), echelle: k, rot: 0, alpha: clamp01(ELAN(p / 0.4)) };
  });
}
/** Étoiles en billes, toujours les mêmes (graine fixe) : diamètre 1,5 à 5 px CSS, position en part de l'image, entrée 0,2 à 1,6 s. */
const BILLES = (() => {
  let g = 12345;
  const a = () => (g = (g * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: 46 }, () => {
    const d = 1.5 + a() * 3.5, x = a(), y = a();
    return { d, x, y, debut: 0.2 + a() * 1.4, phase: a() * 6 };
  });
})();
function etoiles(t: number, vp: Ecran, e: number): IntroFrame['etoiles'] {
  return BILLES.map((b) => {
    const u = (t - b.debut) / 0.35, r = (b.d * e) / 2;   // bord gauche et haut posés en %, comme en CSS : le centre est à + r
    return { x: b.x * vp.width + r, y: b.y * vp.height + r, r, alpha: clamp01(u) * (0.55 + 0.35 * Math.sin(b.phase + t * 2.1)),
      echelle: u <= 0 ? 0 : Math.min(1.3, 1 + 0.3 * Math.sin(Math.min(1, u) * Math.PI)) };
  });
}

export function frameAt(t: number, cadrage: Cadrage): IntroFrame {
  const vp = CADRAGES[cadrage], titres = TITRES[cadrage];
  const p = placement(t, vp, { logo: titres.logo.o, titre: titres.titre.o });
  const retrait = 1 - s5(phase(t, RETRAIT, D_RETRAIT));

  // le point tombe sur Paris, s'écrase en pastille et y reste : le drapeau en sortira
  const ue = phase(t, T_POINT, D_POINT), pose = T_POINT + D_POINT;
  let point: IntroFrame['point'] = { visible: false, y: 0, sxz: 0, sy: 0 };
  if (ue >= 0 && retrait > 0.01) {
    const chute = clamp01(ue), o = ue > 1 ? ressort(t - pose, 2.6, 5.5) : 0, tasse = ue > 1 ? s5((t - pose) / 0.5) : 0;
    const sy = (chute < 1 ? 1.25 : 1) * (1 - 0.42 * tasse) * (1 - 0.3 * o), sxz = (chute < 1 ? 0.85 : 1) * (1 + 0.3 * tasse) * (1 + 0.22 * o);
    point = { visible: true, y: POINT_RP * sy * 0.8 + 0.5 * (1 - chute * chute), sxz: POINT_RP * sxz * retrait, sy: POINT_RP * sy * retrait };
  }
  const f = clamp01(phase(t, T_FRONTIERE, D_FRONTIERE));
  const border = retrait > 0.01 ? sortie(f) * retrait : 0;
  const ud = phase(t, T_DRAPEAU, D_DRAPEAU);
  let flag: IntroFrame['flag'] = { visible: false, sx: 0, sy: 0, y: 0 };
  if (ud >= 0 && retrait > 0.01) {
    const o = ressort(ud, 2.2, 4.5), grand = sortie(ud * 2.2), D = 0.5 * retrait;
    flag = { visible: true, sx: grand * (1 - 0.18 * o) * D, sy: grand * (1 + 0.32 * o) * D, y: POINT_RP * 0.45 };
  }

  return {
    camera: cameraFrom(p, orientation(t), vp),
    squash: { sx: p.sx, sy: p.sy },
    clouds: { scale: Math.max(0.0001, 1 - s5(phase(t, DEZOOM1 - 0.3, 0.8))), spin: t * 0.16 },
    point,
    border,
    bead: f > 0 && f < 1 && retrait > 0.01 ? sortie(f) : null,
    flag,
    logo: lettresLogo(t, REFERENCES[cadrage].echelle),
    titre: lettresTitre(t, titres.titre.police),
    etoiles: etoiles(t, vp, REFERENCES[cadrage].echelle),
  };
}
