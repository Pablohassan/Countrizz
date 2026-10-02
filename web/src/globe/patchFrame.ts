import type { LngLat, PatchMeta } from '../data/types';
import { cross, dot, length, toVec, type Vec3 } from '../geo/vec';

/** Repère tangent au centre du patch : C (centre), E (est), N (nord), orthonormé. */
export interface TangentFrame { center: Vec3; east: Vec3; north: Vec3 }

export function tangentFrame([lng, lat]: LngLat): TangentFrame {
  const l = (lng * Math.PI) / 180, p = (lat * Math.PI) / 180;
  return {
    center: toVec([lng, lat]),
    east: [-Math.sin(l), 0, -Math.cos(l)],
    north: [-Math.sin(p) * Math.cos(l), Math.cos(p), Math.sin(p) * Math.sin(l)],
  };
}

/**
 * Miroir CPU exact du shader (contrat de PatchMeta) : (u, v) d'une direction unitaire `p`.
 * x = k·(P·E), y = −k·(P·N), k = c / sin c, c = atan2(|P×C|, P·C) — précis aussi pour les très petits cadres.
 */
export function patchUV(meta: Pick<PatchMeta, 'extentRad'>, f: TangentFrame, p: Vec3): [number, number] {
  const cosC = dot(p, f.center), sinC = length(cross(p, f.center));
  const k = sinC > 1e-7 ? Math.atan2(sinC, cosC) / sinC : 1;
  return [((k * dot(p, f.east)) / meta.extentRad + 1) / 2, ((-k * dot(p, f.north)) / meta.extentRad + 1) / 2];
}

/** Hors cadre, le patch ne dit rien : le point compte comme hors du pays. */
export const inFrame = ([u, v]: [number, number]): boolean => u >= 0 && u <= 1 && v >= 0 && v <= 1;
