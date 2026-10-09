import { NAME_MAX, truncateGraphemes, type KeyValueStorage } from './prefs';
import type { Mode } from './types';

export type { KeyValueStorage } from './prefs';

export const TOP = 10;
export interface ScoreEntry { name: string; score: number; at: number }

/** Top 10 du mode : score décroissant, à égalité le plus ancien d'abord (spec 2A §10, section 5). */
const order = (a: ScoreEntry, b: ScoreEntry) => b.score - a.score || a.at - b.at;

/**
 * Ajoute la partie au top 10. « Nouveau record ! » : le meilleur score du mode est strictement battu (une première partie
 * à plus de 0 point en est un). `rank` : place dans le top 10, ou null.
 */
export function insertScore(list: readonly ScoreEntry[], entry: ScoreEntry) {
  const previousBest = list.length > 0 ? Math.max(...list.map((x) => x.score)) : null;
  const top = [...list, entry].sort(order).slice(0, TOP);
  const i = top.indexOf(entry);
  return { list: top, rank: i < 0 ? null : i + 1, record: entry.score > (previousBest ?? 0), previousBest };
}

export interface ScoreBook {
  read(mode: Mode): ScoreEntry[];
  /** false : écrit en mémoire seulement (stockage absent, refusé ou plein). */
  write(mode: Mode, list: ScoreEntry[]): boolean;
  /** false : les scores ne survivront pas à la visite (« Ton score ne peut pas être gardé sur cet appareil »). */
  readonly persistent: boolean;
}

const key = (mode: Mode) => `countrizz:scores:${mode}`;

/** Garde ce qui ressemble à une entrée ; nom recoupé ; top 10 trié. Rien d'étranger ne plante l'écran des scores. */
function sanitize(raw: unknown): ScoreEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is ScoreEntry => !!x && typeof x === 'object' && typeof x.name === 'string'
      && Number.isFinite(x.score) && Number.isFinite(x.at))
    .map((x) => ({ name: truncateGraphemes(x.name, NAME_MAX), score: x.score, at: x.at }))
    .sort(order)
    .slice(0, TOP);
}

function probe(storage: KeyValueStorage | null): boolean {
  if (!storage) return false;
  try { storage.setItem('countrizz:probe', '1'); storage.removeItem('countrizz:probe'); return true; } catch { return false; }
}

export function openScoreBook(storage: KeyValueStorage | null): ScoreBook {
  let persistent = probe(storage);
  /** Ce qui n'a pas pu être écrit : prime sur le stockage pour la suite de la visite. */
  const memory = new Map<Mode, ScoreEntry[]>();
  return {
    get persistent() { return persistent; },
    read(mode) {
      const kept = memory.get(mode);
      if (kept) return kept;
      if (!persistent) return [];
      try { return sanitize(JSON.parse(storage!.getItem(key(mode)) ?? '[]')); } catch { return []; }
    },
    write(mode, list) {
      if (persistent) {
        try { storage!.setItem(key(mode), JSON.stringify(list)); memory.delete(mode); return true; } catch { persistent = false; }
      }
      memory.set(mode, list);
      return false;
    },
  };
}
