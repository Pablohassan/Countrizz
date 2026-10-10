import * as THREE from 'three/webgpu';
import { FOV_Y_DEG } from '../camera/config';
import { homePose } from '../camera/home';

/**
 * Chronologie de l'intro en pâte à modeler (spec `2026-10-10-countrizz-intro-pate-accueil-design.md` §2), en fonctions
 * pures du temps. La Terre en pâte est la sphère unité fixe à l'origine (même repère que le globe : lng 0 → +X,
 * lng 90 → −Z, pôle Nord → +Y) ; c'est la caméra qui bouge. Les phases du prototype validé (Terre placée à l'écran,
 * caméra fixe de 20°) sont converties en caméra relative à la Terre ; de 15,6 à 18 s, la caméra rejoint celle de la vue
 * d'accueil du globe (camera/home.ts) : l'image finale de l'intro est celle du vrai globe.
 * Les longueurs du prototype sont en pixels d'une scène de téléphone 390 × 844 ; ici, `U = min(largeur, ½ hauteur)`
 * remplace 390 et les hauteurs se prennent en fraction de 844.
 */
export const INTRO = {
  /** Fin de l'intro (l'accueil est monté, le fondu fini). */
  FIN: 21.2,
  /** Stop motion « en deux » : 12 images par seconde. */
  IPS: 12,
  /** Début de la chute de la Terre : il faut ses textures. */
  CHUTE: 2.0,
  /** Début du fondu vers le vrai globe : il faut le globe. */
  FONDU: 19.6,
  /** Entrée de l'accueil (titre, commandes). */
  ACCUEIL: 16.8,
} as const;

export const PARIS: readonly [number, number] = [2.35, 48.86];
/** Repère posé à Paris : rayon de la bille, hauteur du mât (unités du repère, qui est grossi × 1,6). */
export const POINT_RP = 0.0062, MAT_HM = 0.135, REPERE_ECHELLE = 1.6;

export interface Viewport { width: number; height: number }
export interface IntroCamera { position: [number, number, number]; quaternion: [number, number, number, number]; fov: number }
export interface IntroFrame {
  camera: IntroCamera;
  /** Écrasement de la Terre (axe vertical de l'image) à l'impact ; 1 = ronde. */
  squash: { sx: number; sy: number };
  /** Flou (px) et opacité du canvas pendant la chute. */
  blur: number;
  opacity: number;
  /** Opacité du calque entier de l'intro (fondu vers le globe). */
  layerOpacity: number;
  /** Nuages : échelle (ils se retirent avant l'approche) et rotation propre (rad). */
  clouds: { scale: number; spin: number };
  point: { visible: boolean; y: number; sxz: number; sy: number };
  /** Part de la frontière déroulée (0 → 1) ; `bead` : la perle au bout, visible pendant le déroulé. */
  border: number;
  bead: number | null;
  flag: { visible: boolean; sx: number; sy: number; y: number };
  label: { opacity: number; scale: number };
  title: { opacity: number; x: number; y: number };
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
const RAD = Math.PI / 180;

// ---------- la toupie ----------
const BETA = 40 * RAD;                           // Paris s'arrête 40° au-dessus du centre du disque
const CIBLE = -Math.PI / 2 - PARIS[0] * RAD;     // longitude de Paris face à la caméra
const W_MAX = 2 * Math.PI * 0.72;                // 0,72 tour/s : 21,6° par image à 12 i/s
const T_FREIN = 6.0, D_FREIN = 2.6;
const RESTE_FREIN = (W_MAX * D_FREIN) / 3;       // décélération cubique : la vitesse reste continue
function resteAngle(t: number): number {
  if (t < T_FREIN) return RESTE_FREIN + W_MAX * (T_FREIN - t);
  if (t < T_FREIN + D_FREIN) return RESTE_FREIN * Math.pow(1 - (t - T_FREIN) / D_FREIN, 3);
  return -0.16 * ressort(Math.min(t, 15.6) - T_FREIN - D_FREIN, 1.6, 4.5);   // elle s'arrête en se dandinant
}
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
/** Orientation de la Terre dans la scène du prototype (Paris face à la caméra à la fin du freinage). */
function orientation(t: number, out = new THREE.Quaternion()): THREE.Quaternion {
  const k = s5(phase(t, 6.6, 2.6));             // l'axe se redresse pendant qu'elle freine
  const qa = new THREE.Quaternion().setFromAxisAngle(AZ, -23.4 * RAD * (1 - k));
  const qb = new THREE.Quaternion().setFromAxisAngle(AX, (PARIS[1] * RAD - BETA) * k);
  const qc = new THREE.Quaternion().setFromAxisAngle(AY, CIBLE - resteAngle(t) - (1 - k) * 0.35);
  return out.copy(qa).multiply(qb).multiply(qc);
}

// ---------- où est la Terre à l'écran (prototype : px de la scène 390 × 844) ----------
const R_LOIN = 115, R_PRES = 507, CY_LOIN = 470, PARIS_Y = 430, H0 = 844, U0 = 390;
interface Placement { cx: number; cy: number; R: number; blur: number; opacity: number; sx: number; sy: number }
function placement(t: number, vp: Viewport): Placement {
  const u = Math.min(vp.width, vp.height / 2) / U0, hy = vp.height / H0;
  const rl = R_LOIN * u, rp = R_PRES * u, cyl = CY_LOIN * hy;
  let cy = cyl, R = rl, blur = 0, opacity = 1, sx = 1, sy = 1;
  if (t < 3.6) {                                    // elle tombe du ciel, énorme, floue, puis nette
    const v = clamp01(phase(t, INTRO.CHUTE, 1.6));
    cy = lerp(-560 * hy, cyl, v * v);
    R = lerp(rl * 2.3, rl, sortie(v));
    blur = 30 * Math.pow(1 - v, 1.6); opacity = clamp01(phase(t, INTRO.CHUTE, 0.6));
    sy = 1 + 0.12 * v; sx = 1 - 0.06 * v;          // étirée par la vitesse
  } else if (t < 8.4) {                             // l'impact : elle s'écrase, rebondit, se calme
    const w = t - 3.6, o = ressort(w, 2.2, 4.2);
    sy = 1 - 0.2 * o; sx = 1 + 0.14 * o;
    cy = cyl - 20 * hy * Math.max(0, Math.sin(Math.PI * clamp01(w / 0.42))) * (1 - clamp01(w / 0.42) * 0.3) + rl * (1 - sy);
  } else {                                          // l'approche de la France, l'horizon reste visible
    const z = s5(phase(t, 8.4, 1.9)), lent = 1 + 0.035 * clamp01(phase(Math.min(t, 15.6), 10.3, 5.3));
    R = rl * Math.pow((rp / rl) * lent, z);
    cy = lerp(cyl - rl * Math.sin(BETA), PARIS_Y * hy, z) + R * Math.sin(BETA);
  }
  return { cx: vp.width / 2, cy, R, blur, opacity, sx, sy };
}

/** Caméra du prototype (20°, à l'origine) ramenée dans le repère de la Terre : position Q⁻¹(−T)/R, orientation Q⁻¹. */
const FOV_PROTO = 20, PROF = 12;
function cameraProto(t: number, vp: Viewport): IntroCamera {
  const p = placement(t, vp);
  const k = PROF * Math.tan((FOV_PROTO * RAD) / 2) / (vp.height / 2);   // px → unités du monde à la profondeur PROF
  const T = new THREE.Vector3((p.cx - vp.width / 2) * k, -(p.cy - vp.height / 2) * k, -PROF);
  const R = p.R * k;
  const qi = orientation(t).invert();
  const pos = T.clone().multiplyScalar(-1 / R).applyQuaternion(qi);
  return { position: pos.toArray() as [number, number, number], quaternion: qi.toArray() as [number, number, number, number], fov: FOV_PROTO };
}

/** Caméra de la vue d'accueil du globe (mêmes gestes que `Globe.applyPose` : lookAt l'origine, `up` nord, tangage). */
export function homeCamera(vp: Viewport): IntroCamera {
  const h = homePose({ width: vp.width, height: vp.height, fovYDeg: FOV_Y_DEG });
  const k = new THREE.PerspectiveCamera(FOV_Y_DEG, vp.width / vp.height, 0.01, 100);
  const d = 1 + h.altitude;
  k.position.set(h.dir[0] * d, h.dir[1] * d, h.dir[2] * d);
  k.up.set(...h.up);
  k.lookAt(0, 0, 0);
  k.rotateX(h.pitch);
  return { position: k.position.toArray() as [number, number, number], quaternion: k.quaternion.toArray() as [number, number, number, number], fov: FOV_Y_DEG };
}

const RETOUR = 15.6, D_RETOUR = 2.4;
function camera(t: number, vp: Viewport): IntroCamera {
  if (t < RETOUR) return cameraProto(t, vp);
  const a = cameraProto(RETOUR, vp), b = homeCamera(vp), z = s5(phase(t, RETOUR, D_RETOUR));
  const q = new THREE.Quaternion().fromArray(a.quaternion).slerp(new THREE.Quaternion().fromArray(b.quaternion), z);
  const p = new THREE.Vector3().fromArray(a.position).lerp(new THREE.Vector3().fromArray(b.position), z);
  return { position: p.toArray() as [number, number, number], quaternion: q.toArray() as [number, number, number, number], fov: lerp(a.fov, b.fov, z) };
}

export function frameAt(t: number, vp: Viewport): IntroFrame {
  const p = placement(t, vp);
  const retrait = 1 - s5(phase(t, 15.4, 0.7));      // tout se range avant l'accueil

  // le point tombe sur Paris (10,0 s), s'écrase en pastille et y reste : le drapeau en sortira
  const ue = phase(t, 10.0, 0.42);
  let point: IntroFrame['point'] = { visible: false, y: 0, sxz: 0, sy: 0 };
  if (ue >= 0 && retrait > 0.01) {
    const chute = clamp01(ue), o = ue > 1 ? ressort(t - 10.42, 2.6, 5.5) : 0, tasse = ue > 1 ? s5((t - 10.42) / 0.5) : 0;
    const sy = (chute < 1 ? 1.25 : 1) * (1 - 0.42 * tasse) * (1 - 0.3 * o), sxz = (chute < 1 ? 0.85 : 1) * (1 + 0.3 * tasse) * (1 + 0.22 * o);
    point = { visible: true, y: POINT_RP * sy * 0.8 + 0.5 * (1 - chute * chute), sxz: POINT_RP * sxz * retrait, sy: POINT_RP * sy * retrait };
  }
  // la frontière se déroule (10,7 → 12,2 s)
  const f = clamp01(phase(t, 10.7, 1.5));
  const border = retrait > 0.01 ? sortie(f) * retrait : 0;
  // le drapeau jaillit (12,2 s) : étiré, puis il se tasse en tremblant
  const ud = phase(t, 12.2, 0.9);
  let flag: IntroFrame['flag'] = { visible: false, sx: 0, sy: 0, y: 0 };
  if (ud >= 0 && retrait > 0.01) {
    const o = ressort(ud, 2.2, 4.5), grand = sortie(ud * 2.2), D = 0.5 * retrait;
    flag = { visible: true, sx: grand * (1 - 0.18 * o) * D, sy: grand * (1 + 0.32 * o) * D, y: POINT_RP * 0.45 };
  }
  // vignette « France / Paris » (12,9 s)
  const uv = phase(t, 12.9, 0.45);
  const label = uv < 0 || retrait < 0.01 ? { opacity: 0, scale: 0 } : { opacity: clamp01(uv * 3) * retrait, scale: rebond(uv, 2.4) * (0.4 + 0.6 * retrait) };
  // le titre glisse depuis la gauche avec un rebond (1 s), s'envole quand on plonge (8,7 s) ; l'accueil le reprend
  const u = Math.min(vp.width, vp.height / 2) / U0;
  let title = { opacity: 0, x: 0, y: 0 };
  if (t < 8.7) { const v = phase(t, 1.0, 1.0); title = { opacity: clamp01(v * 3), x: -420 * u * (1 - rebond(v)), y: 0 }; }
  else { const v = clamp01(phase(t, 8.7, 0.45)); title = { opacity: 1 - v, x: 0, y: -190 * u * v * v }; }

  return {
    camera: camera(t, vp),
    squash: { sx: p.sx, sy: p.sy },
    blur: t < 3.6 ? p.blur : 0,
    opacity: t < 3.6 ? p.opacity : 1,
    layerOpacity: 1 - s5(phase(t, INTRO.FONDU, 1.4)),
    clouds: { scale: Math.max(0.0001, 1 - s5(phase(t, 8.2, 1.1))), spin: t * 0.16 },
    point,
    border,
    bead: f > 0 && f < 1 && retrait > 0.01 ? sortie(f) : null,
    flag,
    label,
    title,
  };
}
