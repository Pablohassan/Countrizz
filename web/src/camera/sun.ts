import type { Pose } from './flight';
import { add, cross, normalize, scale, type Vec3 } from '../geo/vec';
import { FRAMING } from './config';

/**
 * Angle du soleil au point visé selon l'altitude de la caméra (spec mise en avant §2, 21/10) : 35° au cadrage d'un pays
 * (à 55°, un pays ne recevait que cos 55° ≈ 0,57 de la pleine lumière : plans ternes), 55° en vue d'ensemble (terminateur
 * au limbe), passage lissé entre `from` et `to` rayons d'altitude. `to` = vue d'ensemble en paysage (1,4) : vues d'ensemble
 * (1,4 et 2,2) et accueil (1,6) inchangés ; `from` = 0,6, au-dessus de la médiane des arrivées (bureau 0,234, téléphone
 * 0,484). Les plus grands pays sur téléphone (arrivée au-dessus de 1,4, jusqu'à 3,18 pour la Russie) gardent 55°.
 */
export const SUN_ANGLE = { country: 35, overview: 55, from: 0.6, to: FRAMING.overview.landscape } as const;
export function sunAngleDeg(altitude: number): number {
  const t = Math.min(1, Math.max(0, (altitude - SUN_ANGLE.from) / (SUN_ANGLE.to - SUN_ANGLE.from)));
  return SUN_ANGLE.country + (SUN_ANGLE.overview - SUN_ANGLE.country) * t * t * (3 - 2 * t);
}

/**
 * Soleil placé par rapport à la caméra (spec §5) : à `angleDeg` du point visé, venant du haut à gauche de
 * l'image. Le pays visé est toujours de jour ; en vue d'ensemble, le terminateur reste visible au limbe.
 */
export function sunDirection(pose: Pose, angleDeg = sunAngleDeg(pose.altitude)): Vec3 {
  const right = cross(pose.up, pose.dir); // droite de l'image pour une caméra en dir·(1+h) regardant l'origine
  const towardUpLeft = normalize(add(pose.up, scale(right, -1)));
  const a = (angleDeg * Math.PI) / 180;
  return normalize(add(scale(pose.dir, Math.cos(a)), scale(towardUpLeft, Math.sin(a))));
}
