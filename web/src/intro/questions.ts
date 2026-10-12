import type { Lang, Mode } from '../game/types';
import { messages } from '../i18n';
import { couverture } from './lecteur';
import { CADRAGES, type Cadrage } from './temps';

/**
 * Les questions de l'intro (spec `2026-10-11-countrizz-intro-video-blender-design.md` §5), en fonctions pures du temps
 * de la vidéo : « Capitale ? », « Pays ? », « Drapeau ? » en Chango, sans bulle ni réponse. Chaque mot naît de son objet
 * au moment où il apparaît (le point qui touche Paris, la frontière qui se déroule, le drapeau qui sort du point) : ses
 * lettres jaillissent l'une après l'autre de l'ancre courante de l'objet (`ancres.json`), volent avec un saut et une
 * vrille, se posent avec élan près de lui, ondulent, puis rentrent dans l'objet au rangement. Tout est en px de la
 * vidéo : `Intro.tsx` pose le calque sur l'écran par un seul transform (`couverture`) et mesure les lettres dans la page
 * (`Gabarit`). Implémentation de référence : la maquette validée le 12/10 (« ok go »), retour avancé à 15,6 s.
 */

export type Question = 'capitale' | 'pays' | 'drapeau';
/** Ancres des questions (`/intro/ancres.json`, écrit par `scripts/intro/export-keys.ts`) : px vidéo, de `t0` au pas 1/`fps`. */
export interface Ancres { version: 1; fps: number; t0: number; cadrages: Record<Cadrage, { width: number; height: number } & Record<Question, [number, number][]>> }

/** Les questions dans l'ordre de leur naissance (celui de leurs lettres dans la page). */
export const ORDRE_QUESTIONS: readonly Question[] = ['capitale', 'pays', 'drapeau'];
/** Le mode du jeu de chaque question : son texte est `modes.*` du catalogue. */
export const MODE_QUESTION: Record<Question, Mode> = { capitale: 'capital', pays: 'country', drapeau: 'flag' };

/**
 * Envol des lettres de chaque mot : naissance de la première lettre (s), écart entre deux lettres (s), durée du vol (s),
 * hauteur du saut (px vidéo) ; `phase` décale l'oscillation d'un mot à l'autre. « Capitale ? » naît quand le point touche
 * Paris (T_POINT + D_POINT de timeline.ts), « Pays ? » pendant que la frontière se déroule (T_FRONTIERE + 0,1 s, une
 * lettre toutes les 0,16 s), « Drapeau ? » avec le drapeau qui sort du point (T_DRAPEAU + 0,15 s) ; testé sur `frameAt`.
 */
export const QUESTIONS: Record<Question, { naissance: number; ecart: number; vol: number; saut: number; phase: number }> = {
  capitale: { naissance: 11.22, ecart: 0.06, vol: 0.55, saut: 170, phase: 0 },
  pays: { naissance: 11.6, ecart: 0.16, vol: 0.6, saut: 120, phase: 1 },
  drapeau: { naissance: 13.15, ecart: 0.06, vol: 0.55, saut: 110, phase: 2 },
};
/**
 * Les lettres rentrent dans leur objet à partir de RETOUR, la dernière d'abord ; elles ont fini entre 16,2 et 16,4 s
 * (16,21 s pour 5 lettres, 16,37 s pour 9 ; au-delà de 16,2 s, fin de la fenêtre d'`ancres.json`, BULLES_RANGE, l'ancre
 * est tenue pendant que les objets se rangent, de 16,2 à 16,9 s), avant le second dézoom (16,4 s).
 */
export const RETOUR = 15.6;

/**
 * Taille des lettres (px vidéo) et place de repos de chaque mot, près de son objet : centre (px vidéo) et inclinaison (°).
 * Ce sont celles de la maquette validée ; un écran loin des références peut rogner une place : `poserMot` la ramène.
 */
export const POSES: Record<Cadrage, { taille: number } & Record<Question, [x: number, y: number, inclinaison: number]>> = {
  portrait: { taille: 62, capitale: [860, 1262, -4], pays: [330, 1470, 4], drapeau: [560, 900, -3] },
  paysage: { taille: 64, capitale: [1300, 600, -4], pays: [680, 730, 4], drapeau: [990, 330, -3] },
};
/** Marge entre un mot et le bord de l'écran (px CSS). */
export const MARGE_QUESTION = 8;

// ---------- le mouvement (constantes de la maquette) ----------
const RAD = Math.PI / 180;
/** Une fois posé, le mot s'anime peu à peu (s) : son inclinaison oscille (± °, Hz). */
const VIE_S = 0.8, OSC_DEG = 2.2, OSC_HZ = 0.55;
/** Onde à travers les lettres : amplitude (× taille), fréquence (Hz), déphasage d'une lettre à la suivante (rad). */
const ONDE = 0.08, ONDE_HZ = 1.1, ONDE_DEPHASAGE = 0.6;
/** Vrille pendant le vol (°, sens alterné d'une lettre à l'autre). */
const VRILLE_DEG = 220;
/** Le « ? » sautille : 0,4 s après sa pose, un saut (× taille, et un balancement en °) de 0,45 s toutes les 1,6 s. */
const SAUTILLE = 0.35, SAUTILLE_DEG = 18, SAUTILLE_DELAI_S = 0.4, SAUTILLE_PERIODE_S = 1.6, SAUTILLE_S = 0.45;
/** Retour dans l'objet : écart entre deux lettres (s), durée (s), tour sur elle-même (°). */
const RETOUR_ECART = 0.04, RETOUR_S = 0.45, RETOUR_DEG = 160;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** Arrivée qui ralentit. */
const sortie = (x: number) => 1 - (1 - clamp01(x)) ** 3;
/** Élan : dépassement puis retour (easeOutBack). */
const elan = (x: number, k = 2.2) => { const u = clamp01(x) - 1; return 1 + (k + 1) * u ** 3 + k * u ** 2; };
/** Recul : un peu en arrière avant de partir (easeInBack). */
const recul = (x: number, k = 1.8) => { const u = clamp01(x); return (k + 1) * u ** 3 - k * u ** 2; };

// ---------- textes ----------
/** Ce qui suit le mot : en français une espace fine insécable (U+202F) puis « ? », en anglais « ? » collé. */
const POINT: Record<Lang, string> = { fr: '\u202F?', en: '?' };
/** Le texte d'une question dans la langue : `modes.*` du catalogue, suivi de « ? » à la typographie de la langue. */
export function texteQuestion(lang: Lang, q: Question): string {
  return messages[lang].modes[MODE_QUESTION[q]] + POINT[lang];
}
/** Les signes d'un texte, dans l'ordre : les lettres (qui volent) et les blancs (qui ne font que l'espace). */
export function signes(texte: string): { c: string; blanc: boolean }[] {
  return Array.from(texte, (c) => ({ c, blanc: /\s/u.test(c) }));
}

// ---------- ancres ----------
/**
 * Ancre d'une question à l'instant `t` (px vidéo), interpolée entre deux échantillons ; tenue à sa première et à sa
 * dernière valeur hors de la fenêtre d'`ancres.json` (après 16,2 s, les lettres finissent de rentrer là où était l'objet).
 */
export function ancreQuestion(a: Ancres, cadrage: Cadrage, q: Question, t: number): [number, number] {
  const pts = a.cadrages[cadrage][q], n = pts.length;
  if (n === 0) throw new Error(`ancres.json : aucune ancre « ${q} » en ${cadrage}`);
  if (n === 1) return [pts[0][0], pts[0][1]];
  const u = Math.min(n - 1, Math.max(0, (t - a.t0) * a.fps)), i = Math.min(n - 2, Math.floor(u)), k = u - i;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
}

// ---------- places de repos, dans la partie visible ----------
/** Un rectangle en px de la vidéo. */
export interface Cadre { x0: number; y0: number; x1: number; y1: number }
/** La partie de la vidéo que l'écran montre sous le rognage `cover` (px vidéo), rentrée de `marge` px CSS de chaque bord. */
export function partieVisible(cadrage: Cadrage, ecran: { width: number; height: number }, marge = 0): Cadre {
  const c = couverture(CADRAGES[cadrage], ecran, cadrage);
  return { x0: (marge - c.x) / c.echelle, y0: (marge - c.y) / c.echelle, x1: (ecran.width - marge - c.x) / c.echelle, y1: (ecran.height - marge - c.y) / c.echelle };
}

/**
 * Un mot tel que la page l'a mesuré, à la taille `POSES[cadrage].taille` dans le calque (px vidéo) : sa boîte, et pour
 * chaque lettre (blancs exclus, dans l'ordre) son centre dans la boîte et sa taille.
 */
export interface Gabarit { largeur: number; hauteur: number; lettres: { x: number; y: number; w: number; h: number }[] }

/**
 * Ce qu'un mot posé occupe autour du centre de sa place de repos tant qu'il y vit (px vidéo) : chaque lettre — le cercle
 * de sa boîte, qu'elle peut tourner — à sa place tournée de l'inclinaison ± OSC_DEG (9 angles : moins de 0,01 px
 * d'erreur), plus l'onde, plus le saut du « ? ».
 */
export function etendue(g: Gabarit, inclinaison: number, taille: number): { gauche: number; droite: number; haut: number; bas: number } {
  let gauche = 0, droite = 0, haut = 0, bas = 0;
  g.lettres.forEach((l, i) => {
    const dx = l.x - g.largeur / 2, dy = l.y - g.hauteur / 2, r = Math.hypot(l.w, l.h) / 2;
    const monte = ONDE * taille + (i === g.lettres.length - 1 ? SAUTILLE * taille : 0), descend = ONDE * taille;
    for (let k = 0; k <= 8; k++) {
      const a = (inclinaison + OSC_DEG * (k / 4 - 1)) * RAD;
      const x = dx * Math.cos(a) - dy * Math.sin(a), y = dx * Math.sin(a) + dy * Math.cos(a);
      gauche = Math.min(gauche, x - r);
      droite = Math.max(droite, x + r);
      haut = Math.min(haut, y - r - monte);
      bas = Math.max(bas, y + r + descend);
    }
  });
  return { gauche, droite, haut, bas };
}

/** Un mot posé pour un écran : centre et inclinaison (°) de sa place de repos, centres des lettres au repos sans inclinaison (px vidéo). */
export interface Mot { question: Question; cadrage: Cadrage; taille: number; centre: [number, number]; inclinaison: number; lettres: [number, number][] }

/**
 * Pose un mot mesuré : à sa place de repos (`POSES`) si elle tient dans la partie visible de l'écran (à `marge` px CSS
 * des bords, son mouvement compris : `etendue`), sinon ramené dedans au plus près ; centré s'il est plus grand qu'elle.
 * À refaire quand l'écran change (redimensionnement, rotation) ou la langue.
 */
export function poserMot(q: Question, cadrage: Cadrage, g: Gabarit, ecran: { width: number; height: number }, marge = MARGE_QUESTION): Mot {
  const { taille } = POSES[cadrage], [x, y, inclinaison] = POSES[cadrage][q];
  const v = partieVisible(cadrage, ecran, marge), e = etendue(g, inclinaison, taille);
  const ramener = (c: number, moins: number, plus: number, min: number, max: number) =>
    max - min < plus - moins ? (min + max - moins - plus) / 2 : Math.min(max - plus, Math.max(min - moins, c));
  const cx = ramener(x, e.gauche, e.droite, v.x0, v.x1), cy = ramener(y, e.haut, e.bas, v.y0, v.y1);
  const x0 = cx - g.largeur / 2, y0 = cy - g.hauteur / 2;
  return { question: q, cadrage, taille, centre: [cx, cy], inclinaison, lettres: g.lettres.map((l): [number, number] => [x0 + l.x, y0 + l.y]) };
}

// ---------- chaque lettre, en fonction du temps ----------
/** Une lettre à l'image : centre (px vidéo), rotation (°, sens horaire comme `rotate` en CSS), échelle, opacité. */
export interface EtatLettre { x: number; y: number; rot: number; echelle: number; opacite: number }

/**
 * La lettre `i` d'un mot posé à l'instant `t` de la vidéo ; null quand elle ne se voit pas (pas encore née, ou rentrée
 * dans son objet). Fonction pure de t : `?introT` fige les questions avec la vidéo, le réseau qui cale aussi.
 */
export function etatLettre(t: number, mot: Mot, i: number, a: Ancres): EtatLettre | null {
  const q = QUESTIONS[mot.question], n = mot.lettres.length, taille = mot.taille;
  const t0 = q.naissance + i * q.ecart, p = (t - t0) / q.vol;
  if (p <= 0) return null;
  const pe = sortie(p);
  // place de repos : la mise en page du mot, tournée de son inclinaison (qui oscille un peu une fois le mot posé)
  const vie = clamp01((t - t0 - q.vol) / VIE_S);
  const incl = (mot.inclinaison + OSC_DEG * vie * Math.sin(2 * Math.PI * OSC_HZ * (t - q.naissance) + q.phase)) * RAD;
  const [nx, ny] = mot.lettres[i], [cx, cy] = mot.centre;
  const rx = cx + (nx - cx) * Math.cos(incl) - (ny - cy) * Math.sin(incl);
  const ry = cy + (nx - cx) * Math.sin(incl) + (ny - cy) * Math.cos(incl);
  // envol depuis l'objet, qui peut encore bouger (le drapeau monte) : l'ancre suit jusqu'à la pose
  const [ax, ay] = ancreQuestion(a, mot.cadrage, mot.question, Math.min(t, t0 + q.vol));
  let x = ax + (rx - ax) * pe;
  let y = ay + (ry - ay) * pe - q.saut * Math.sin(Math.PI * clamp01(p));
  let echelle = elan(p), rot = incl / RAD + (1 - pe) * (i % 2 ? VRILLE_DEG : -VRILLE_DEG);
  const opacite = clamp01(p * 4);
  // l'onde à travers les lettres, et le « ? » qui sautille
  y -= ONDE * taille * vie * Math.sin(2 * Math.PI * ONDE_HZ * (t - q.naissance) - i * ONDE_DEPHASAGE);
  const u = t - (t0 + q.vol) - SAUTILLE_DELAI_S;
  if (i === n - 1 && u > 0) {
    const h = (u % SAUTILLE_PERIODE_S) / SAUTILLE_S;
    if (h < 1) { y -= SAUTILLE * taille * Math.sin(Math.PI * h); rot += SAUTILLE_DEG * Math.sin(2 * Math.PI * h); }
  }
  // au rangement : retour dans l'objet, la dernière lettre d'abord, en rétrécissant
  const e = clamp01((t - RETOUR - (n - 1 - i) * RETOUR_ECART) / RETOUR_S);
  if (e > 0) {
    const [bx, by] = ancreQuestion(a, mot.cadrage, mot.question, t), k = e * e;
    x += (bx - x) * k;
    y += (by - y) * k;
    echelle *= 1 - recul(e);
    rot += RETOUR_DEG * k * (i % 2 ? 1 : -1);
  }
  return echelle > 0.001 ? { x, y, rot, echelle, opacite } : null;
}
