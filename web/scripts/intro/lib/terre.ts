import * as THREE from 'three';
import { toVec } from '../../../src/geo/vec';
import { PARIS } from '../../../src/intro/timeline';

/**
 * Géométrie de la Terre en pâte, partagée par la fabrique (sources.ts, export-keys.ts) : la hauteur du relief, la
 * frontière de la France et les repères des bulles. Mêmes formules que la scène three.js de l'intro (`src/intro/scene.ts`),
 * dans son repère : sphère unité, lng 0 → +X, lng 90 → −Z, pôle Nord → +Y. Rien n'est lu sur le disque ici.
 */

/** Hauteur la plus grande (rayons terrestres) : socle 0,0045 plus le relief caricaturé à l'altitude maximale. */
export const HAUTEUR_MAX = 0.0045 + 0.09;

/**
 * Hauteur du relief en pâte (rayons terrestres), formule de `scene.ts:92-95` : la terre adoucie (masque flouté, 0 → 1)
 * passée par `smoothstep(0,3 ; 0,72)`, fois le socle plus l'altitude (0 → 1) caricaturée par `√e^2,4`.
 */
export function hauteurDe(terre: number, altitude: number): number {
  const k = Math.max(0, Math.min(1, (terre - 0.3) / (0.72 - 0.3)));   // THREE.MathUtils.smoothstep(terre, 0.3, 0.72)
  return k * k * (3 - 2 * k) * (0.0045 + 0.09 * Math.pow(Math.sqrt(altitude), 2.4));
}

/** Image équirectangulaire en niveaux de gris 16 bits (ligne 0 = 90° N, colonne 0 = 180° O). */
export interface Gris16 { w: number; h: number; d: Uint16Array }

/**
 * Hauteur (rayons terrestres) lue dans `hauteur.png` (valeur 16 bits × HAUTEUR_MAX / 65535) : bilinéaire, centres des
 * pixels en (i + 0,5), comme `echantillon` de scene.ts et la texture « Linear » de Blender ; le méridien 180 se raccorde.
 */
export function hauteurA(g: Gris16, lng: number, lat: number): number {
  const x = ((lng + 180) / 360) * g.w - 0.5, y = ((90 - lat) / 180) * g.h - 0.5;
  const x0 = Math.floor(x), y0 = Math.max(0, Math.min(g.h - 1, Math.floor(y))), y1 = Math.min(g.h - 1, y0 + 1);
  const fx = x - x0, fy = Math.max(0, Math.min(1, y - y0));
  const p = (xx: number, yy: number) => g.d[yy * g.w + (((xx % g.w) + g.w) % g.w)]!;
  const v = (p(x0, y0) * (1 - fx) + p(x0 + 1, y0) * fx) * (1 - fy) + (p(x0, y1) * (1 - fx) + p(x0 + 1, y1) * fx) * fy;
  return (v / 65535) * HAUTEUR_MAX;
}

const vec = (lng: number, lat: number, r: number) => new THREE.Vector3(...toVec([lng, lat])).multiplyScalar(r);

/** Le boudin de la frontière flotte 0,0034 au-dessus du relief (scene.ts:184). */
export const FRONTIERE_DECOLLE = 0.0034;
/** Segments du boudin (TubeGeometry de scene.ts:185) : la frontière exportée a FRONTIERE_SEGMENTS + 1 points. */
export const FRONTIERE_SEGMENTS = 2600;

/**
 * La frontière de la France comme scene.ts:182-184 : l'anneau `[lng, lat][]` recommencé à son point le plus au nord,
 * courbe de Catmull-Rom centripète FERMÉE au rayon 1 + hauteur + 0,0034.
 */
export function courbeFrontiere(france: [number, number][], hauteur: (lng: number, lat: number) => number): THREE.CatmullRomCurve3 {
  let depart = 0;
  france.forEach(([, la], i) => { if (la > france[depart]![1]) depart = i; });
  const anneau = [...france.slice(depart), ...france.slice(0, depart)];
  return new THREE.CatmullRomCurve3(anneau.map(([lng, lat]) => vec(lng, lat, 1 + hauteur(lng, lat) + FRONTIERE_DECOLLE)), true, 'centripetal');
}

/**
 * Les points du boudin tel que three le dessine : `getPointAt(i / FRONTIERE_SEGMENTS)`, i = 0 … FRONTIERE_SEGMENTS (le
 * dernier = le premier, la boucle est fermée). La part `border` de la frontière s'arrête à l'indice `border · SEGMENTS`.
 */
export function pointsFrontiere(courbe: THREE.CatmullRomCurve3): [number, number, number][] {
  return courbe.getSpacedPoints(FRONTIERE_SEGMENTS).map((p) => [p.x, p.y, p.z]);
}

/** Point de la frontière à la part `u` (0 → 1) : interpolation linéaire entre ses points, comme le bout du boudin. */
export function surFrontiere(points: readonly (readonly [number, number, number])[], u: number): [number, number, number] {
  const n = points.length - 1, x = Math.max(0, Math.min(1, u)) * n, i = Math.min(n - 1, Math.floor(x)), f = x - i;
  const a = points[i]!, b = points[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** Repères des bulles, sur la surface déplacée : Paris (le repère du point et du drapeau) et le milieu de la frontière. */
export interface Reperes { paris: [number, number, number]; frontiereMilieu: [number, number, number] }

export function reperes(points: readonly (readonly [number, number, number])[], hauteur: (lng: number, lat: number) => number): Reperes {
  const p = vec(PARIS[0], PARIS[1], 1 + hauteur(PARIS[0], PARIS[1]));   // scene.ts:164
  return { paris: [p.x, p.y, p.z], frontiereMilieu: surFrontiere(points, 0.5) };
}
