import type { Pose } from './flight';
import { add, cross, normalize, scale, type Vec3 } from '../geo/vec';

/**
 * Soleil placé par rapport à la caméra (spec §5) : à `angleDeg` du point visé, venant du haut à gauche de
 * l'image. Le pays visé est toujours de jour ; en vue d'ensemble, le terminateur reste visible au limbe.
 */
export function sunDirection(pose: Pose, angleDeg = 55): Vec3 {
  const right = cross(pose.up, pose.dir); // droite de l'image pour une caméra en dir·(1+h) regardant l'origine
  const towardUpLeft = normalize(add(pose.up, scale(right, -1)));
  const a = (angleDeg * Math.PI) / 180;
  return normalize(add(scale(pose.dir, Math.cos(a)), scale(towardUpLeft, Math.sin(a))));
}
