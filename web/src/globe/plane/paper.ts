import { cross, dot, normalize, type Vec3 } from '../../geo/vec';

const RAD = Math.PI / 180;
const lerp = (a: Vec3, b: Vec3, f: number): Vec3 => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/**
 * Papier de l'avion A2 (prototype `avion-cartoon-escales.js`, `papier`) : longueur 1 (nez en +x), envergure sur z, dessus
 * vers +y. Groupes : 0 = dessus crème, 1 = dessus de la bande (au bord de fuite, dès `band` de la corde), 2 = intérieur de
 * quille ; la face arrière prend la couleur principale. `edges` (bords) et `folds` (plis) : segments des contours.
 */
export function paperGeometry(band: number) {
  const NOSE: Vec3 = [0.5, 0, 0], xF = -0.5, slit = 0.004;
  const zFold = 0.25, zTip = 0.66, dIn = 6 * RAD, dOut = 26 * RAD;
  const KEEL: Vec3 = [-0.44, -0.27, 0];
  const cream: Vec3[][] = [], stripe: Vec3[][] = [], keel: Vec3[][] = [], edges: Vec3[][] = [], folds: Vec3[][] = [];
  const outline: Vec3[] = [NOSE, KEEL];
  for (const s of [-1, 1]) {
    const R: Vec3 = [xF, 0, s * slit];
    const yC = (zFold - slit) * Math.tan(dIn);
    const C: Vec3 = [xF, yC, s * zFold];
    const T: Vec3 = [xF, yC + (zTip - zFold) * Math.tan(dOut), s * zTip];
    const top: Vec3 = [0, 1, 0], inward: Vec3 = [0, 0, -s];
    const R2 = lerp(NOSE, R, band), C2 = lerp(NOSE, C, band), T2 = lerp(NOSE, T, band);
    cream.push([NOSE, R2, C2, top], [NOSE, C2, T2, top]);
    stripe.push([R2, R, C, top], [R2, C, C2, top], [C2, C, T, top], [C2, T, T2, top]);
    keel.push([NOSE, R, KEEL, inward]);
    edges.push([NOSE, T], [T, C], [C, R], [R, KEEL]);
    folds.push([lerp(NOSE, C, 0.45), C], [lerp(NOSE, R, 0.35), R]);
    outline.push(R, C, T);
  }
  edges.push([KEEL, NOSE]);
  const positions: number[] = [];
  for (const [A, B, C, ref] of [...cream, ...stripe, ...keel] as [Vec3, Vec3, Vec3, Vec3][]) {
    const n = cross(sub(B, A), sub(C, A));
    const [P, Q] = dot(n, ref) >= 0 ? [B, C] : [C, B];
    positions.push(...A, ...P, ...Q);
  }
  const flat = (segs: Vec3[][]) => segs.flatMap(([a, b]) => [...a!, ...b!]);
  return {
    positions: new Float32Array(positions),
    groups: [cream.length, stripe.length, keel.length] as const,
    edges: flat(edges),
    folds: flat(folds),
    points: { nose: NOSE, keel: KEEL },
    /** Sommets du papier (l'ombre en prend l'enveloppe). */
    outline,
  };
}

/**
 * Ombrage toon du prototype (MeshToonMaterial, carte de dégradé à 3 marches, sous un soleil chaud et une lumière
 * d'ambiance hémisphérique uniforme) : couleur = albédo × mix(ambiance, 1, marche(n·L)).
 */
export const TOON = { thresholds: [0.22, 0.41] as const, ambient: [0.335, 0.262, 0.62] as const };
export const toonStep = (ndl: number): 0 | 0.5 | 1 => (ndl < TOON.thresholds[0] ? 0 : ndl < TOON.thresholds[1] ? 0.5 : 1);
export const toonShade = (ndl: number): number[] => { const g = toonStep(ndl); return TOON.ambient.map((h) => h + (1 - h) * g); };

/** Enveloppe convexe (chaîne monotone d'Andrew), sens trigonométrique, en partant du point le plus à gauche puis le plus bas. */
export function convexHull2D(points: readonly (readonly [number, number])[]): [number, number][] {
  const p = [...points].map((q) => [q[0], q[1]] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const turn = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const q of p) { while (lower.length >= 2 && turn(lower.at(-2)!, lower.at(-1)!, q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && turn(upper.at(-2)!, upper.at(-1)!, q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Ombre portée nette (plan 2A-6, décision 4) : les sommets projetés le long du soleil `sun` (vers le soleil, unitaire) sur
 * le plan tangent au point `ground` (unitaire) relevé de `lift`, puis leur enveloppe convexe, dans le sens trigonométrique
 * vu de l'extérieur (un éventail de triangles regarde vers le ciel). `null` si le soleil est trop bas sur l'horizon du point.
 */
export function shadowOutline(points: readonly Vec3[], ground: Vec3, lift: number, sun: Vec3): Vec3[] | null {
  const nL = dot(ground, sun);
  if (nL < 0.05) return null;
  const d = 1 + lift;
  const u = normalize(Math.abs(ground[1]) > 0.999 ? cross([1, 0, 0], ground) : cross([0, 1, 0], ground));
  const v = cross(ground, u);
  const flat = points.map((x) => {
    const t = (dot(ground, x) - d) / nL;
    const q: Vec3 = [x[0] - t * sun[0], x[1] - t * sun[1], x[2] - t * sun[2]];
    return [dot(q, u), dot(q, v)] as [number, number];
  });
  return convexHull2D(flat).map(([a, b]) => [ground[0] * d + a * u[0] + b * v[0], ground[1] * d + a * u[1] + b * v[1], ground[2] * d + a * u[2] + b * v[2]] as Vec3);
}
