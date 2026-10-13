/** L1 : au bureau, les touches 1 à 4 (rangée du haut — le code de la touche, AZERTY compris — ou pavé numérique). */
export function answerIndexFromKey(e: { key: string; code?: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): number | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code ?? '')?.[1] ?? (/^[1-4]$/.test(e.key) ? e.key : null);
  return digit ? Number(digit) - 1 : null;
}
