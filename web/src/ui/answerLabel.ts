/** D2 : à partir de 20 caractères visibles (6 noms de pays sur 197), le libellé passe sur deux lignes, en plus petit. */
export const LONG_LABEL = 20;

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export const isLongLabel = (label: string): boolean => Array.from(graphemes.segment(label)).length >= LONG_LABEL;
