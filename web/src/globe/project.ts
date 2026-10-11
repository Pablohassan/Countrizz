import type { FramePose } from '../camera/director';
import type { Viewport } from '../camera/framing';
import { projectOnScreen } from '../camera/home';
import type { LngLat } from '../data/types';
import { dot, toVec } from '../geo/vec';

/** Point du sol à l'écran (px CSS, coin haut gauche) ; `visible` : devant l'horizon et dans le cadre. */
export interface ScreenPoint { x: number; y: number; visible: boolean }

/**
 * Position écran d'un point du sol pour la pose d'une image (bulles des escales, étiquette « Pays · capitale », repères G5 ;
 * spec 2A §5.2) ; `null` derrière la caméra. Même calcul que la caméra three (offsetCamera.test.ts le vérifie).
 */
export function screenPoint(pose: FramePose, v: Viewport, p: LngLat): ScreenPoint | null {
  const q = toVec(p);
  const s = projectOnScreen(pose, v, q);
  if (!s) return null;
  const front = dot(q, pose.dir) * (1 + pose.altitude) > 1;   // P · C > 1 sur la sphère unité
  return { x: s[0], y: s[1], visible: front && s[0] >= 0 && s[0] <= v.width && s[1] >= 0 && s[1] <= v.height };
}
