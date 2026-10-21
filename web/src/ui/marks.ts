import type { Pose } from '../camera/flight';
import type { Viewport } from '../camera/framing';
import { projectOnScreen } from '../camera/home';
import { dot, normalize, toVec, type LngLat, type Vec3 } from '../geo/vec';

/** La tige d'une épingle penche de 60 % de l'angle du sol (maquette G5 : Maroc −26° pour −43,4°, Espagne −16° pour −26,8°). */
export const STEM_TILT = 0.6;

/**
 * Un repère planté dans le globe, à l'écran (maquette G5 « Escales », `accueil-avion-escales.html`) : position (px CSS),
 * `f` = le sol vu de face (1) ou par la tranche (0), `n` = angle (degrés, sens horaire depuis le haut de l'écran) de la
 * verticale du lieu à l'écran, `t` = inclinaison de la tige ; `visible` : devant l'horizon, dans le cadre à 30 px près.
 */
export interface MarkGeometry { x: number; y: number; f: number; n: number; t: number; visible: boolean }

export function markGeometry(pose: Pose & { pitch?: number; axisY?: number }, v: Viewport, at: LngLat): MarkGeometry | null {
  const p = toVec(at);
  const s0 = projectOnScreen(pose, v, p);
  if (!s0) return null;
  const up: Vec3 = [p[0] * 1.01, p[1] * 1.01, p[2] * 1.01];
  const s1 = projectOnScreen(pose, v, up);
  const r = 1 + pose.altitude;
  const camera: Vec3 = [pose.dir[0] * r, pose.dir[1] * r, pose.dir[2] * r];
  const toCamera = normalize([camera[0] - p[0], camera[1] - p[1], camera[2] - p[2]]);
  const f = Math.max(0, dot(p, toCamera));
  let n = 0;
  if (s1) {
    const dx = s1[0] - s0[0], dy = s1[1] - s0[1];
    if (Math.hypot(dx, dy) > 1e-6) n = (Math.atan2(dx, -dy) * 180) / Math.PI;
  }
  const m = 30;
  const visible = dot(p, camera) > 1 && s0[0] >= -m && s0[0] <= v.width + m && s0[1] >= -m && s0[1] <= v.height + m;
  return { x: s0[0], y: s0[1], f, n, t: n * STEM_TILT, visible };
}
