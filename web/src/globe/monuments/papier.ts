/**
 * Maquettes en papier des monuments (pilote du 08/11) : des pièces pleines à facettes, sans three, que `monument.ts` habille
 * comme l'avion de l'accueil (aplats toon, contours noirs). Repère : y vers le haut, la face avant vers +z.
 */
type P3 = [number, number, number];
export type Triangle = [P3, P3, P3];

/**
 * Pièce tournée : `cotes` côtés autour d'un profil, du bas vers le haut ; un point = [rayon, y] ou [rayon, y, dx, dz] (centre
 * décalé : pieds de la tour Eiffel, bras levé). Rayon 0 : une pointe. `tourne` (degrés) fait pivoter les côtés ; `ech`
 * aplatit en x et z (ellipse).
 */
export interface Tour { tour: ([number, number] | [number, number, number, number])[]; cotes: number; couleur: number; tourne?: number; ech?: [number, number] }
/** Boîte de centre `boite` et de côtés `taille`, tournée de `tourne` degrés autour de la verticale. */
export interface Boite { boite: P3; taille: P3; couleur: number; tourne?: number }
/** Anneau elliptique (`ech`) de rayons extérieur `R` et intérieur `r` ; `hauts` : hauteur de chaque segment (ruine). */
export interface Anneau { anneau: { R: number; r: number; hauts: number[]; base?: number }; couleur: number; ech?: [number, number] }
export type Piece = Tour | Boite | Anneau;

const RAD = Math.PI / 180;
const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Polygone convexe (sommets dans l'ordre) en éventail, orienté pour que sa normale suive `dehors` ; triangles plats retirés. */
function face(out: Triangle[], poly: P3[], dehors: P3): void {
  const pts = poly.filter((p, i) => { const q = poly[(i + 1) % poly.length]!; return Math.hypot(...sub(p, q)) > 1e-9; });
  for (let i = 1; i < pts.length - 1; i++) {
    const t: Triangle = [pts[0]!, pts[i]!, pts[i + 1]!];
    const n = cross(sub(t[1], t[0]), sub(t[2], t[0]));
    if (Math.hypot(...n) < 1e-12) continue;
    out.push(dot(n, dehors) >= 0 ? t : [t[0], t[2], t[1]]);
  }
}

function tour(p: Tour): Triangle[] {
  const out: Triangle[] = [];
  const [sx, sz] = p.ech ?? [1, 1];
  const a0 = (p.tourne ?? 0) * RAD;
  const ang = Array.from({ length: p.cotes }, (_, i) => a0 + (2 * Math.PI * i) / p.cotes);
  const anneaux = p.tour.map(([r, y, dx = 0, dz = 0]) => ({ r, y, c: [dx, y, dz] as P3, pts: ang.map((a) => [dx + r * Math.cos(a) * sx, y, dz + r * Math.sin(a) * sz] as P3) }));
  for (let k = 0; k + 1 < anneaux.length; k++) {
    const A = anneaux[k]!, B = anneaux[k + 1]!;
    // normale du profil dans le plan (rayon, y) : dehors en montant, vers le haut sur une marche qui rentre
    const nr = B.y - A.y, ny = A.r - B.r;
    for (let i = 0; i < p.cotes; i++) {
      const j = (i + 1) % p.cotes, mid = (ang[i]! + ang[j]!) / 2 + (j === 0 ? Math.PI : 0);
      const radial: P3 = [Math.cos(mid) * sz, 0, Math.sin(mid) * sx];
      face(out, [A.pts[i]!, A.pts[j]!, B.pts[j]!, B.pts[i]!], [radial[0] * nr, ny, radial[2] * nr]);
    }
  }
  const bas = anneaux[0]!, haut = anneaux.at(-1)!;
  if (bas.r > 0) face(out, bas.pts, [0, -1, 0]);
  if (haut.r > 0) face(out, haut.pts, [0, 1, 0]);
  return out;
}

function boite(p: Boite): Triangle[] {
  const [cx, cy, cz] = p.boite, [w, h, d] = p.taille.map((x) => x / 2) as P3;
  const a = (p.tourne ?? 0) * RAD, c = Math.cos(a), s = Math.sin(a);
  const at = (x: number, y: number, z: number): P3 => [cx + x * c - z * s, cy + y, cz + x * s + z * c];
  const dir = (x: number, y: number, z: number): P3 => [x * c - z * s, y, x * s + z * c];
  const out: Triangle[] = [];
  for (const sgn of [-1, 1]) {
    face(out, [at(sgn * w, -h, -d), at(sgn * w, h, -d), at(sgn * w, h, d), at(sgn * w, -h, d)], dir(sgn, 0, 0));
    face(out, [at(-w, sgn * h, -d), at(w, sgn * h, -d), at(w, sgn * h, d), at(-w, sgn * h, d)], dir(0, sgn, 0));
    face(out, [at(-w, -h, sgn * d), at(w, -h, sgn * d), at(w, h, sgn * d), at(-w, h, sgn * d)], dir(0, 0, sgn));
  }
  return out;
}

function anneau(p: Anneau): Triangle[] {
  const { R, r, hauts, base = 0 } = p.anneau, [sx, sz] = p.ech ?? [1, 1], n = hauts.length;
  const at = (rr: number, a: number, y: number): P3 => [rr * Math.cos(a) * sx, y, rr * Math.sin(a) * sz];
  const out: Triangle[] = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n, b = (2 * Math.PI * (i + 1)) / n, h = hauts[i]!, m = (a + b) / 2;
    const radial: P3 = [Math.cos(m) * sz, 0, Math.sin(m) * sx];
    face(out, [at(R, a, base), at(R, b, base), at(R, b, h), at(R, a, h)], radial);
    face(out, [at(r, a, base), at(r, b, base), at(r, b, h), at(r, a, h)], [-radial[0], 0, -radial[2]]);
    face(out, [at(R, a, h), at(R, b, h), at(r, b, h), at(r, a, h)], [0, 1, 0]);
    face(out, [at(R, a, base), at(R, b, base), at(r, b, base), at(r, a, base)], [0, -1, 0]);
    // mur entre ce segment et le suivant s'ils n'ont pas la même hauteur : il regarde le plus bas
    const h2 = hauts[(i + 1) % n]!;
    if (Math.abs(h - h2) > 1e-9) {
      const t: P3 = [-Math.sin(b) * sx, 0, Math.cos(b) * sz];
      face(out, [at(R, b, Math.min(h, h2)), at(r, b, Math.min(h, h2)), at(r, b, Math.max(h, h2)), at(R, b, Math.max(h, h2))], h > h2 ? t : [-t[0], 0, -t[2]]);
    }
  }
  return out;
}

/** Triangles d'une pièce, faces vers l'extérieur. */
export function triangles(p: Piece): Triangle[] {
  return 'tour' in p ? tour(p) : 'boite' in p ? boite(p) : anneau(p);
}

/** Poids de la largeur dans l'encombrement d'une maquette. */
export const LARGEUR = 1;

/**
 * Maquette assemblée, posée sur y = 0 et ramenée à un encombrement 1 : max(hauteur, `LARGEUR` × largeur), pour qu'une
 * maquette large et basse (Muraille, Colisée) ne déborde pas de l'écran à taille égale avec une tour. Rend les sommets
 * (triangles à plat, un par face : facettes nettes) et la couleur de chaque triangle (0xRRGGBB, celle de sa pièce).
 */
export function construire(pieces: Piece[]): { positions: Float32Array; couleurs: number[] } {
  const tris = pieces.flatMap((p) => triangles(p).map((t) => ({ t, c: p.couleur })));
  const etendue = (j: number) => { const v = tris.flatMap(({ t }) => t.map((p) => p[j])); return [Math.min(...v), Math.max(...v)] as const; };
  const [y0, y1] = etendue(1), [x0, x1] = etendue(0), [z0, z1] = etendue(2);
  const k = 1 / Math.max(y1 - y0, LARGEUR * Math.max(x1 - x0, z1 - z0));
  const positions = new Float32Array(tris.length * 9);
  tris.forEach(({ t }, i) => t.forEach((v, j) => positions.set([v[0] * k, (v[1] - y0) * k, v[2] * k], i * 9 + j * 3)));
  return { positions, couleurs: tris.map(({ c }) => c) };
}
