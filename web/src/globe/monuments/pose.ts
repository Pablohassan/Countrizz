import type { Viewport } from '../../camera/framing';
import type { SafeArea } from '../../camera/safeArea';
import type { Pose } from '../../camera/flight';
import { add, cross, dot, normalize, scale, type Vec3 } from '../../geo/vec';

const RAD = Math.PI / 180;

/**
 * Réglages du pilote (08/11). À l'arrivée, la caméra regarde le pays à la verticale : une maquette debout ne montrerait que
 * son toit. Elle se déplie donc comme un livre animé, charnière à sa base : de couchée vers le ciel à dressée vers le haut
 * de l'écran, arrêtée à `inclinaison` du sol pour garder du relief, tournée de `tourne` sur elle-même (trois quarts).
 */
export const MONUMENT = {
  /** rad : angle final entre son axe et la verticale du lieu. */
  inclinaison: 70 * RAD,
  /** rad : rotation sur son axe, la face avant de trois quarts. */
  tourne: -30 * RAD,
  /** part de la hauteur de la vue occupée par la maquette (≈ 146 px CSS sur le Pixel 9). */
  part: 0.16,
  /** s : déploiement (ressort), repli au départ du vol. */
  deplie: 0.6,
  replie: 0.3,
  /** s : la maquette grandit de 0 à 1 au début du déploiement (vue du dessus, elle surgirait d'un coup). */
  apparition: 0.12,
} as const;

/**
 * Repère de la maquette : `y` son axe vertical, `z` sa face avant, `x` = `y` × `z`. `g` : direction de sa base vers la
 * caméra (à la verticale du pays, la verticale du lieu ; près du limbe, elle s'en écarte : la maquette fait face au
 * joueur partout). Dépliée de `angle` autour de l'axe horizontal de l'écran : 0 = axe vers la caméra ; π/2 = axe vers
 * `haut` (le haut de l'écran, ramené perpendiculaire à `g`), face avant vers la caméra.
 */
export function repere(g: Vec3, haut: Vec3, angle: number): { x: Vec3; y: Vec3; z: Vec3 } {
  const k = dot(haut, g);
  const u = normalize([haut[0] - k * g[0], haut[1] - k * g[1], haut[2] - k * g[2]]);
  const c = Math.cos(angle), s = Math.sin(angle);
  const y: Vec3 = [c * g[0] + s * u[0], c * g[1] + s * u[1], c * g[2] + s * u[2]];
  const z: Vec3 = [-c * u[0] + s * g[0], -c * u[1] + s * g[1], -c * u[2] + s * g[2]];
  return { x: cross(y, z), y, z };
}

const sortie = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };

/** Angle de déploiement `t` s après l'apparition ; `repli` : instant du début du repli (`null` : pas replié). */
export function deploiement(t: number, repli: number | null): number {
  const ouvert = (u: number) => MONUMENT.inclinaison * sortie(Math.min(1, Math.max(0, u / MONUMENT.deplie)));
  if (repli === null || t < repli) return ouvert(t);
  const x = Math.min(1, (t - repli) / MONUMENT.replie);
  return ouvert(repli) * (1 - x * x);
}

/** Hauteur dans le monde (rayons terrestres) de la maquette vue à `distance` de la caméra : `MONUMENT.part` de la vue. */
export function tailleMonde(distance: number, v: Viewport): number {
  return 2 * distance * Math.tan((v.fovYDeg * RAD) / 2) * MONUMENT.part;
}

/** px : écart minimal entre la maquette et le bord de la zone libre. */
export const MARGE = 12;

/** Rectangle à l'écran, px CSS. */
export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Décalage à l'écran (px, x vers la droite, y vers le bas) qui garde dans la zone libre la boîte de la maquette, donnée par
 * ses débords autour de sa base (px). Une maquette plus grande que la zone y est centrée. Monument au bord de l'écran
 * (Moscou, au bord ouest de la Russie cadrée) : elle glisse vers l'intérieur. `evite` : l'étiquette de la révélation ; si
 * la maquette la touche, le plus petit déplacement (à gauche, à droite, au-dessus, au-dessous) qui l'en écarte de `MARGE`
 * sans quitter la zone ; aucun : la maquette reste où la zone la met.
 */
export function recadrage(base: [number, number], boite: { gauche: number; droite: number; haut: number; bas: number }, v: Viewport, safe: SafeArea | null, evite: Rect | null = null): [number, number] {
  const y0 = safe?.top ?? 0, y1 = v.height - (safe?.bottom ?? 0);
  const axe = (b: number, avant: number, apres: number, debut: number, fin: number) => {
    const lo = debut + MARGE + avant, hi = fin - MARGE - apres;
    return (lo > hi ? (debut + fin) / 2 - (apres - avant) / 2 : Math.min(hi, Math.max(lo, b))) - b;
  };
  const d: [number, number] = [axe(base[0], boite.gauche, boite.droite, 0, v.width), axe(base[1], boite.haut, boite.bas, y0, y1)];
  if (!evite) return d;
  const r = ([dx, dy]: [number, number]): Rect => ({ x: base[0] + dx - boite.gauche, y: base[1] + dy - boite.haut, w: boite.gauche + boite.droite, h: boite.haut + boite.bas });
  const e = 1e-9, ev = evite;
  const libre = (q: Rect) => q.x + q.w + MARGE <= ev.x + e || ev.x + ev.w + MARGE <= q.x + e || q.y + q.h + MARGE <= ev.y + e || ev.y + ev.h + MARGE <= q.y + e;
  if (libre(r(d))) return d;
  const dedans = (q: Rect) => q.x >= MARGE - e && q.x + q.w <= v.width - MARGE + e && q.y >= y0 + MARGE - e && q.y + q.h <= y1 - MARGE + e;
  const candidats: [number, number][] = [
    [ev.x - MARGE - boite.droite - base[0], d[1]], [ev.x + ev.w + MARGE + boite.gauche - base[0], d[1]],
    [d[0], ev.y - MARGE - boite.bas - base[1]], [d[0], ev.y + ev.h + MARGE + boite.haut - base[1]],
  ];
  const ok = candidats.filter((c) => dedans(r(c))).sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
  return ok[0] ?? d;
}

/**
 * Point de la sphère de rayon `rayon` sous le pixel `px` (CSS), le plus proche de la caméra : l'inverse de `projectOnScreen`
 * (camera/home.ts), mêmes gestes ; `null` si le rayon manque la sphère.
 */
export function solSous(p: Pose & { pitch?: number; axisY?: number }, v: Viewport, px: [number, number], rayon = 1): Vec3 | null {
  const pitch = p.pitch ?? 0;
  const camera = scale(p.dir, 1 + p.altitude);
  const fwd0 = scale(p.dir, -1);
  const right = normalize(cross(fwd0, p.up));
  const up0 = cross(right, fwd0);
  const fwd = add(scale(fwd0, Math.cos(pitch)), scale(up0, Math.sin(pitch)));
  const up = add(scale(up0, Math.cos(pitch)), scale(fwd0, -Math.sin(pitch)));
  const tanV = Math.tan((v.fovYDeg * Math.PI) / 360), tanH = tanV * (v.width / v.height);
  const nx = (px[0] - v.width / 2) / (v.width / 2), ny = -(px[1] - v.height / 2) / (v.height / 2) - (p.axisY ?? 0);
  const d = normalize(add(fwd, add(scale(right, nx * tanH), scale(up, ny * tanV))));
  // |camera + t d| = rayon : t² + 2 (c·d) t + |c|² − rayon² = 0, plus petite racine positive
  const b = dot(camera, d), c = dot(camera, camera) - rayon * rayon, disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t <= 0) return null;
  return normalize(add(camera, scale(d, t)));
}
