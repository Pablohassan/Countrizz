import type { Viewport } from './framing';
import type { Pose } from './flight';
import { add, cross, dot, northUp, normalize, scale, toVec, type LngLat, type Vec3 } from '../geo/vec';

/**
 * Vue d'accueil « lever de Terre » (maquette H3 validée le 03/10, capture `acc-16.jpg`) : la sonde à l'altitude 1,6,
 * l'image décalée de 400 px vers le bas sur 844. Point visé ajusté sur cinq repères de la capture (Paris, Gibraltar,
 * Sicile, delta du Nil, lac Tchad ; écart moyen 15,6 px sur 1688) : lng 10°, lat 19,5°.
 * Le décalage est rendu par un tangage de la caméra : le TRAA de three réécrit `setViewOffset` à chaque image.
 */
export const HOME = { look: [10, 19.5] as LngLat, altitude: 1.6, shift: 400 / 422 } as const;

/** Pose de caméra avec tangage (rad, > 0 : le regard monte, la Terre descend dans l'image). */
export interface PitchedPose extends Pose { pitch: number }

export function homePose(v: Viewport): PitchedPose {
  const dir = toVec(HOME.look);
  const tanHalf = Math.tan((v.fovYDeg * Math.PI) / 360);
  return { dir, altitude: HOME.altitude, up: northUp(dir), pitch: Math.atan(HOME.shift * tanHalf) };
}

/**
 * Projection d'un point du monde (sphère unité) pour une caméra en `dir · (1 + altitude)`, regard vers l'origine, `up` en
 * haut, puis inclinée de `pitch` autour de sa droite — les gestes de `Globe.applyPose`. `axisY` : hauteur de l'axe optique,
 * NDC, comme `OffsetCamera`. Pixels CSS ; `null` derrière.
 */
export function projectOnScreen(p: Pose & { pitch?: number; axisY?: number }, v: Viewport, point: Vec3): [number, number] | null {
  const pitch = p.pitch ?? 0;
  const camera = scale(p.dir, 1 + p.altitude);
  const fwd0 = scale(p.dir, -1);
  const right = normalize(cross(fwd0, p.up));
  const up0 = cross(right, fwd0);
  const fwd = add(scale(fwd0, Math.cos(pitch)), scale(up0, Math.sin(pitch)));
  const up = add(scale(up0, Math.cos(pitch)), scale(fwd0, -Math.sin(pitch)));
  const rel: Vec3 = [point[0] - camera[0], point[1] - camera[1], point[2] - camera[2]];
  const z = dot(rel, fwd);
  if (z <= 1e-9) return null;
  const tanV = Math.tan((v.fovYDeg * Math.PI) / 360), tanH = tanV * (v.width / v.height);
  const axisY = p.axisY ?? 0;
  return [v.width / 2 + (dot(rel, right) / z / tanH) * (v.width / 2), v.height / 2 - (dot(rel, up) / z / tanV + axisY) * (v.height / 2)];
}
