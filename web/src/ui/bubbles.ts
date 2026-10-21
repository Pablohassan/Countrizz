import type { Viewport } from '../camera/framing';

/** Coin haut gauche d'une bulle de `w` × `h` px ramené dans l'écran, à `margin` px des bords (la rotation du globe déplace les escales). */
export function inScreen(x: number, y: number, w: number, h: number, v: Viewport, margin = 4): [number, number] {
  return [Math.min(Math.max(margin, x), v.width - w - margin), Math.min(Math.max(margin, y), v.height - h - margin)];
}
