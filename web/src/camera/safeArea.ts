import type { Viewport } from './framing';

/** Bandes occupées par l'interface, en px CSS : HUD en haut, grille de réponses et crédit en bas (D1, D2). */
export interface SafeArea { top: number; bottom: number }

/** Part de l'image qui reste libre au minimum : au-delà, les deux bandes sont réduites dans la même proportion. */
export const MIN_FREE = 0.2;

const band = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);

/**
 * Zone libre entre les bandes : le pays s'y cadre (`zone` : même largeur et même champ horizontal, champ vertical réduit
 * dans le rapport des hauteurs) et s'y centre (`axisY` : hauteur de l'axe optique à l'écran, en NDC, > 0 au-dessus du
 * centre). La caméra décentrée (globe/offsetCamera.ts) place l'axe à cette hauteur.
 */
export function safeViewport(v: Viewport, a: SafeArea | null): { zone: Viewport; axisY: number } {
  let top = a ? band(a.top) : 0, bottom = a ? band(a.bottom) : 0;
  if (top === 0 && bottom === 0) return { zone: v, axisY: 0 };
  const max = v.height * (1 - MIN_FREE);
  if (top + bottom > max) {
    const k = max / (top + bottom);
    top *= k;
    bottom *= k;
  }
  const height = v.height - top - bottom;
  const tanHalf = Math.tan((v.fovYDeg * Math.PI) / 360) * (height / v.height);
  return { zone: { width: v.width, height, fovYDeg: (2 * Math.atan(tanHalf) * 180) / Math.PI }, axisY: (bottom - top) / v.height };
}
