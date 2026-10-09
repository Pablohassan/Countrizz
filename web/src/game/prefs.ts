/** Ce qu'il faut d'un `Storage` (localStorage, ou un double en test). */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const PREF_KEYS = { name: 'countrizz:name', lang: 'countrizz:lang', vibrations: 'countrizz:vibrations' } as const;

/** Nom du joueur : 12 caractères au plus (spec 2A §3, accueil). */
export const NAME_MAX = 12;

/** Graphèmes (un émoji avec modificateur compte pour un) : on ne coupe jamais au milieu. */
const graphemes = (s: string): string[] => Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (g) => g.segment);

/** Les `n` premiers caractères visibles de `s` (un émoji composé n'est jamais coupé). */
export const truncateGraphemes = (s: string, n: number): string => graphemes(s).slice(0, n).join('');

export function normalizeName(input: string, fallback: string): string {
  const clean = input.replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  return truncateGraphemes(clean, NAME_MAX).trim();
}

export function readPref(storage: KeyValueStorage | null, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

export function writePref(storage: KeyValueStorage | null, key: string, value: string): boolean {
  if (!storage) return false;
  try { storage.setItem(key, value); return true; } catch { return false; }
}
