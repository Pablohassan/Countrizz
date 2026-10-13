/**
 * D3 · P1 : le drapeau garde ses vraies proportions, à **aire égale bornée** (zone utile 150 × 88 px, aire 7776 px²) :
 * Népal 72 × 88, Suisse 88 × 88, France 108 × 72, 2:1 125 × 62, Qatar 141 × 55. Jamais teinté.
 */
export const FLAG_BOX = { width: 150, height: 88, area: 7776 } as const;

export function flagSize(ratio: number): { width: number; height: number } {
  const width = Math.min(FLAG_BOX.width, FLAG_BOX.height * ratio, Math.sqrt(FLAG_BOX.area * ratio));
  return { width, height: width / ratio };
}

/** Drapeaux qui ne sont pas des rectangles : le décor « autocollant » suit leur forme (drop-shadow) au lieu d'un cadre. */
export const SHAPED_FLAGS: ReadonlySet<string> = new Set(['NPL']);
