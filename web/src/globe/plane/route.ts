import { cross, dot, normalize, toVec, type LngLat, type Vec3 } from '../../geo/vec';

/**
 * Avion A2 de l'accueil (spec 2A §4, décision 8 du README de conception) : trajet et repère de vol, sans three. Porté de
 * `docs/superpowers/brainstorm/2026-10-03-phase2a-interface/ecrans/avion-cartoon-escales.js` (prototype WebGL du 05/10).
 */
const RAD = Math.PI / 180;

/** Escales : `a` = couleur principale du drapeau (quille, dessous), `b` = seconde (bande au bord de fuite). */
export const ESCALES = [
  { cca3: 'MAR', lieu: [-6.84, 34.02] as LngLat, a: 0xc1272d, b: 0x006233 },
  { cca3: 'ESP', lieu: [-3.7, 40.42] as LngLat, a: 0xc60b1e, b: 0xffc400 },
  { cca3: 'FRA', lieu: [2.35, 48.86] as LngLat, a: 0x002395, b: 0xed2939 },
  { cca3: 'GRC', lieu: [23.73, 37.98] as LngLat, a: 0x0d5eaf, b: 0x0d5eaf },
] as const;

/** Tour du monde après Athènes (lng, lat) : vers l'est, par derrière le globe, retour par l'Atlantique. */
const TOUR: LngLat[] = [[46, 36], [80, 32], [125, 26], [175, 20], [-130, 20], [-85, 25], [-48, 30], [-24, 33]];

/** Réglages du prototype (05/10, dosage E2, réduit et ralenti de 30 %) ; longueurs en rayons terrestres. */
export const PLANE = {
  /** rad/s le long du sol, à l'écran : celle du vol Rabat → Athènes du prototype. */
  vitesse: 0.043,
  /** s passées hors de l'écran. */
  retour: 2.4,
  /** hors de Rabat → Athènes : jusqu'à × (1 + gain), atteint à `sur` rad de l'escale (près du limbe, la perspective écrase le mouvement). */
  elan: { gain: 2.2, sur: 0.12 },
  /** ≈ 27 px sur un téléphone. */
  longueur: 0.0525,
  altCroisiere: 0.034,
  /** rase-mottes au-dessus des escales. */
  altPassage: 0.025,
  /** rad : demi-largeur du creux d'altitude autour d'une escale. */
  creux: 0.07,
  inclinaisonMax: 40,
  /** degrés : montre la quille à la caméra. */
  roulisBase: -25,
  /** la bande commence à 80 % de la corde. */
  bande: 0.8,
  /** s : changement de couleur à partir du passage d'une escale (plan 2A-6, décision 2). */
  morph: 0.5,
  gonfle: 0.06,
  /** s : les bulles s'effacent ce délai après la sortie de l'écran. */
  bulles: 0.25,
  /** perles de la traînée ; `hauteur` au-dessus du relief soulevé × 10 (plan 2A-6, décision 6). */
  perles: { pas: 0.0146, rayon: 0.0029, cerne: 0.0017, efface: 1.0, hauteur: 0.008 },
  contour: { bord: 1.9, pli: 1.0 },
  ombre: { couleur: 0x120c33, opacite: 0.45 },
  /** px : « à l'écran » déborde du cadre de cette marge. */
  marge: 10,
} as const;
export type PlaneSettings = typeof PLANE;

const mod1 = (x: number) => x - Math.floor(x);
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Repère de vol : avant, haut (≈ verticale locale), droite = avant × haut ; courbure signée (virage). */
export interface FlightFrame { position: Vec3; forward: Vec3; up: Vec3; right: Vec3; curvature: number }

export interface Route {
  /** Longueur du tour au sol (rad). */
  total: number;
  /** Progression (0 → 1) des quatre escales. */
  passages: readonly number[];
  /** Gain du roulis : l'inclinaison des virages atteint `inclinaisonMax` au plus fort virage de Rabat → Athènes. */
  bankGain: number;
  ground(e: number): Vec3;
  altitude(e: number): number;
  point(e: number): Vec3;
  frame(e: number): FlightFrame;
}

/** Roulis (rad) : celui du virage plus le roulis de base, borné à ± 55°. */
export function rollRad(curvature: number, gain: number, p: PlaneSettings = PLANE): number {
  return Math.max(-55 * RAD, Math.min(55 * RAD, Math.atan(gain * curvature) + p.roulisBase * RAD));
}

/**
 * Trajet FERMÉ lisse sur la sphère : Catmull-Rom périodique sur les vecteurs unitaires, renormalisée, par Rabat → Madrid →
 * Paris → Athènes → Proche-Orient → Asie → Pacifique → Amériques → Atlantique → Rabat ; paramétré par la longueur (e ∈ [0, 1)).
 */
export function createRoute(p: PlaneSettings = PLANE): Route {
  const P = [...ESCALES.map((c) => c.lieu), ...TOUR].map((l) => toVec(l));
  const n = P.length;
  const cr = (s: number): Vec3 => {
    const i = Math.floor(s), u = s - i;
    const [p0, p1, p2, p3] = [-1, 0, 1, 2].map((k) => P[(((i + k) % n) + n) % n]!);
    const u2 = u * u, u3 = u2 * u;
    const w = [-0.5 * u3 + u2 - 0.5 * u, 1.5 * u3 - 2.5 * u2 + 1, -1.5 * u3 + 2 * u2 + 0.5 * u, 0.5 * u3 - 0.5 * u2];
    const c = (j: 0 | 1 | 2) => w[0]! * p0![j] + w[1]! * p1![j] + w[2]! * p2![j] + w[3]! * p3![j];
    return normalize([c(0), c(1), c(2)]);
  };
  // table de longueur : abscisse s (indice de point, 0 → n) ↔ longueur parcourue
  const N = 4000, S = new Float64Array(N + 1), L = new Float64Array(N + 1);
  let prev = cr(0);
  for (let k = 1; k <= N; k++) {
    S[k] = (n * k) / N;
    const cur = cr(S[k]!);
    const d = sub(cur, prev);
    L[k] = L[k - 1]! + Math.hypot(d[0], d[1], d[2]);
    prev = cur;
  }
  const total = L[N]!;
  const sOf = (e: number) => {
    const l = mod1(e) * total;
    let lo = 0, hi = N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m]! < l) lo = m; else hi = m; }
    const f = L[hi]! > L[lo]! ? (l - L[lo]!) / (L[hi]! - L[lo]!) : 0;
    return S[lo]! + f * (S[hi]! - S[lo]!);
  };
  // interpolée (le prototype arrondissait au pas de la table) : l'avion passe exactement au-dessus de l'escale
  const eOf = (s: number) => { const j = (s / n) * N, k = Math.floor(j); return (L[k]! + (j - k) * ((L[Math.min(N, k + 1)]! - L[k]!))) / total; };
  const passages = [0, 1, 2, 3].map(eOf);
  const ground = (e: number) => cr(sOf(e));
  const altitude = (e: number) => {
    let dip = 0;
    for (const q of passages) {
      let d = Math.abs(mod1(e) - q); d = Math.min(d, 1 - d);
      dip = Math.max(dip, Math.exp(-(((d * total) / p.creux) ** 2)));
    }
    return p.altCroisiere - (p.altCroisiere - p.altPassage) * dip;
  };
  const point = (e: number): Vec3 => { const g = ground(e), r = 1 + altitude(e); return [g[0] * r, g[1] * r, g[2] * r]; };
  const frame = (e: number): FlightFrame => {
    const h = 4e-4;
    const a = point(e - h), b = point(e), c = point(e + h);
    const vel = sub(c, a);
    const acc = sub(sub(c, b), sub(b, a));
    const side = normalize(cross(vel, b));
    const curvature = (dot(acc, side) * 4) / dot(vel, vel);
    const forward = normalize(vel);
    const right = normalize(cross(forward, normalize(b)));
    const up = cross(right, forward);
    return { position: b, forward, up, right, curvature };
  };
  let kMax = 0;
  for (let i = 0; i <= 1000; i++) {
    const e = passages[0]! + ((passages[3]! - passages[0]!) * i) / 1000;
    kMax = Math.max(kMax, Math.abs(frame(e).curvature));
  }
  const bankGain = kMax > 0 ? Math.tan(p.inclinaisonMax * RAD) / kMax : 0;
  return { total, passages, bankGain, ground, altitude, point, frame };
}
