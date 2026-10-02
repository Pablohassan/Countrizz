import type { LngLat } from '../data/types';

/** Vecteur 3D immuable ; la Terre est la sphère unité centrée à l'origine. */
export type Vec3 = readonly [number, number, number];
export type { LngLat };

const RAD = Math.PI / 180;

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a));

/**
 * lng/lat (degrés) → vecteur unitaire. Même repère que `SphereGeometry` de three habillée d'une texture
 * équirectangulaire : lng 0 → +X, lng +90 → −Z, pôle Nord → +Y.
 */
export function toVec([lng, lat]: LngLat): Vec3 {
  const l = lng * RAD, p = lat * RAD;
  return [Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)];
}

export function toLngLat(v: Vec3): LngLat {
  const n = normalize(v);
  return [Math.atan2(-n[2], n[0]) / RAD, Math.asin(Math.max(-1, Math.min(1, n[1]))) / RAD];
}

/** Angle entre deux directions, précis aussi pour les très petits angles (atan2 plutôt qu'acos). */
export const angleBetween = (a: Vec3, b: Vec3): number => Math.atan2(length(cross(a, b)), dot(a, b));

/** Rotation de `v` d'un angle `angle` autour de l'axe unitaire `axis` (Rodrigues). */
export function rotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

/** Interpolation sphérique le long du grand cercle (le plus court chemin, antiméridien compris). */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const omega = angleBetween(a, b);
  if (omega < 1e-12) return a;
  const s = Math.sin(omega);
  return add(scale(a, Math.sin((1 - t) * omega) / s), scale(b, Math.sin(t * omega) / s));
}

/** « Nord en haut » : l'axe des pôles projeté sur le plan tangent en `dir` (indéfini exactement au pôle). */
export function northUp(dir: Vec3): Vec3 {
  const u = add([0, 1, 0], scale(dir, -dir[1]));
  const n = length(u);
  return n < 1e-12 ? [0, 0, -1] : scale(u, 1 / n);
}
