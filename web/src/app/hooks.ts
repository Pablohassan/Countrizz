import type { KeyValueStorage } from '../game/prefs';

/** Drapeau posé par Playwright (playwright.config.ts) : il installe les crochets, comme `window.__globe` (GlobeView). */
export const E2E_FLAG = 'countrizz:e2e';

/** Crochets du jeu (`window.__game`, `?partie=`, `?graine=`) : en dev, ou avec le drapeau ; jamais si le stockage lève. */
export function hooksEnabled(dev: boolean, storage: KeyValueStorage | null): boolean {
  if (dev) return true;
  try { return storage?.getItem(E2E_FLAG) === '1'; } catch { return false; }
}

/** `?partie=3000` : partie courte (1 000 à 60 000 ms nettes) ; `?graine=42` : tirage rejouable. Le reste est ignoré. */
export function e2eOverrides(search: string): { gameMs?: number; seed?: number } {
  const q = new URLSearchParams(search);
  const out: { gameMs?: number; seed?: number } = {};
  const ms = Number(q.get('partie'));
  if (q.get('partie') && Number.isInteger(ms) && ms >= 1000 && ms <= 60_000) out.gameMs = ms;
  const seed = Number(q.get('graine'));
  if (q.get('graine') && Number.isInteger(seed) && seed >= 0) out.seed = seed;
  return out;
}

/** Graine d'une partie : celle du crochet, sinon 32 bits aléatoires. */
export const newSeed = (override?: number): number => override ?? crypto.getRandomValues(new Uint32Array(1))[0]!;
