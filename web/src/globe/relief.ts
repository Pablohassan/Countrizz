import { asin, atan, float, texture, uniform, vec2 } from 'three/tsl';
import type * as THREE from 'three/webgpu';
import type Node from 'three/src/nodes/core/Node.js';
import type { Vec3 } from '../geo/vec';

/**
 * Relief soulevé (spec océan §2, 20/10) : la boule est soulevée par l'altitude GEBCO_2026, exagérée 10 fois (choix de
 * l'utilisateur après l'essai ×10 / ×30). Le canal R de la surface porte 0 → `metresFull` mètres ; la mer vaut 0.
 */
export const RELIEF_LIFT = { exaggeration: 10, metresFull: 8850 } as const;
const EARTH_RADIUS_M = 6_371_000;
/** Hauteur soulevée maximale (rayons terrestres) : l'Everest × 10 ≈ 0,014, sous la coquille d'atmosphère (1,06). */
export const LIFT_MAX = (RELIEF_LIFT.exaggeration * RELIEF_LIFT.metresFull) / EARTH_RADIUS_M;
/**
 * Niveau de mipmap lu pour soulever la boule : 4096 / 2³ = 512 texels sur un tour, la résolution du maillage (512 × 256).
 * Les frontières lisent la même résolution (grille `relief-512.png`) : la ligne suit la surface entre deux sommets.
 */
export const RELIEF_LIFT_LEVEL = 3;
/**
 * Altitudes de caméra (rayons terrestres) entre lesquelles le soulèvement s'efface : au cadrage serré, la caméra est à la
 * verticale (la hauteur ne s'y voit pas) et la surface redevient la sphère exacte — photos, pays en jaune et balises y
 * gardent leur précision au texel. Sous 0,03, les frontières vectorielles sont déjà effacées (borders.ts).
 */
export const LIFT_ALTITUDE = { from: 0.03, to: 0.08 } as const;

/** Part du soulèvement (0 de près, 1 de loin) à l'altitude de caméra donnée. */
export function liftFactor(altitude: number): number {
  const t = Math.min(1, Math.max(0, (altitude - LIFT_ALTITUDE.from) / (LIFT_ALTITUDE.to - LIFT_ALTITUDE.from)));
  return t * t * (3 - 2 * t);
}

/**
 * Coordonnées de texture équirectangulaires d'une direction (repère de `toVec` et de `SphereGeometry`) : u = 0 à −180°,
 * v = 1 au pôle Nord ; miroir CPU de `sphereUvNode`.
 */
export function sphereUv(d: Vec3): [number, number] {
  return [(Math.atan2(-d[2], d[0]) / Math.PI + 1) / 2, Math.asin(Math.max(-1, Math.min(1, d[1]))) / Math.PI + 0.5];
}

export const sphereUvNode = (d: Node<'vec3'>): Node<'vec2'> =>
  vec2(atan(d.z.negate(), d.x).div(Math.PI).add(1).mul(0.5), asin(d.y).div(Math.PI).add(0.5));

/** Uniforme de la part du soulèvement (posée à chaque pose par Globe.applyPose). */
export const createLift = () => uniform(1);

/** Hauteur soulevée (rayons terrestres) au point de coordonnées `st`, avant le facteur d'apparition. */
export function liftHeight(surface: THREE.Texture, st: Node<'vec2'>): Node<'float'> {
  return texture(surface, st).level(float(RELIEF_LIFT_LEVEL)).r.mul(LIFT_MAX);
}

/**
 * Hauteur soulevée sur le CPU (frontières) : grille `w × h` d'altitudes codées 0 → 255 (ligne 0 au nord, comme la
 * surface réduite au niveau RELIEF_LIFT_LEVEL), lue en bilinéaire à la direction `d`.
 */
export function liftAt(grid: Uint8Array, w: number, h: number, d: Vec3): number {
  const [u, v] = sphereUv(d);
  const x = u * w - 0.5, y = (1 - v) * h - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const at = (xi: number, yi: number) => grid[Math.min(h - 1, Math.max(0, yi)) * w + (((xi % w) + w) % w)]!;
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return ((top * (1 - fy) + bottom * fy) / 255) * LIFT_MAX;
}
