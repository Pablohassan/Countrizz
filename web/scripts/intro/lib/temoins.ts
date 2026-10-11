import { INTRO, IPS_MAITRE, type Bulle, type Cadrage } from '../../../src/intro/temps';
import type { Ancres } from '../export-keys';
import { imageA, TEMOINS } from './lanceur';

/** Instant (s) de l'image maîtresse `image` (`f_0001.png` est t = 0, une image par 1/120 s ; inverse d'`imageA`). */
export function instantDe(image: number): number {
  return (image - 1) / IPS_MAITRE;
}

/** Nombre d'images maîtresses, de t = 0 à `INTRO.FIN` compris (`f_0001.png` …). */
export const IMAGES_MAITRE = imageA(INTRO.FIN);

/** Légende d'une vignette de la planche : instant, nom du témoin s'il en est un, numéro d'image. */
export function legende(image: number): string {
  const temoin = TEMOINS.find((x) => imageA(x.t) === image);
  return `${instantDe(image).toFixed(2).replace('.', ',')} s${temoin ? ` · ${temoin.nom}` : ''} · image ${image}`;
}

/** Ancre d'une bulle à l'instant `t` dans `public/intro/ancres.json` (échantillon le plus proche), `null` hors fenêtre. */
export function ancreTemoin(a: Ancres, cadrage: Cadrage, bulle: Bulle, t: number): [number, number] | null {
  const k = Math.round((t - a.t0) * a.fps);
  return a.cadrages[cadrage][bulle][k] ?? null;
}
