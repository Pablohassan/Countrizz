import { visibleHalfAngle, type Viewport } from '../camera/framing';

/** Niveau courant (couvre la vue), niveau suivant plus fin et son opacité. */
export interface LevelPick { coarse: number; fine: number | null; fineOpacity: number }

/**
 * Spec zoom §4.3 : D = viewFactor × demi-angle au sol vu sur le petit côté ; courant = le niveau le plus fin dont l'emprise
 * couvre D (le 0 sinon) ; suivant posé à clamp(2 · ln(E_courant / D) / ln(levelRatio), 0, 1) — entièrement dès que
 * D ≤ 2 × son emprise, donc avant qu'il ne devienne le courant : le relais n'a pas de saut. `extentsRad` : du plus large au plus fin.
 * `offsetRad` : écart entre le centre de la vue et celui du pays (en vol) ; la zone à couvrir autour du pays s'en agrandit.
 */
export function pickLevels(altitude: number, v: Viewport, extentsRad: readonly number[], o: { viewFactor: number; levelRatio: number }, offsetRad = 0): LevelPick {
  const D = o.viewFactor * visibleHalfAngle(altitude, v) + offsetRad;
  let coarse = 0;
  for (let i = 0; i < extentsRad.length; i++) if (extentsRad[i]! >= D) coarse = i;
  const fine = coarse + 1 < extentsRad.length ? coarse + 1 : null;
  const fineOpacity = fine === null ? 0 : Math.min(1, Math.max(0, (2 * Math.log(extentsRad[coarse]! / D)) / Math.log(o.levelRatio)));
  return { coarse, fine, fineOpacity };
}

/**
 * La paire réellement posée d'après ce qui est chargé : un courant absent cède la place au niveau plus large le plus fin
 * qui soit chargé ; un suivant absent, à rien (spec zoom §4.4 : la manche n'attend jamais une photo).
 */
export function availableSlots(p: LevelPick, loaded: readonly boolean[]): { coarse: number | null; fine: number | null; fineOpacity: number } {
  let coarse: number | null = null;
  for (let i = p.coarse; i >= 0; i--) if (loaded[i]) { coarse = i; break; }
  const fine = p.fine !== null && loaded[p.fine] ? p.fine : null;
  return { coarse, fine, fineOpacity: fine === null ? 0 : p.fineOpacity };
}
