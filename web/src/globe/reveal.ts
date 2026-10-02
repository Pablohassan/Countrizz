import type { CountryLook } from './globe';

/** Durée de la vague de révélation, du centre du patch vers ses bords. */
export const WAVE_MS = 600;

export interface RevealTimeline {
  questionAtMs: number;
  answer?: { kind: 'correct' | 'wrong'; atMs: number };
}

/** Apparence du pays visé à l'instant `nowMs` (horloge de la boucle de rendu). */
export function lookAt(t: RevealTimeline | null, nowMs: number): CountryLook {
  if (!t) return { visible: false, reveal: 0, state: 'question', stateTime: 0 };
  const e = Math.min(1, Math.max(0, (nowMs - t.questionAtMs) / WAVE_MS));
  const reveal = 1 - (1 - e) ** 3;
  if (!t.answer || nowMs < t.answer.atMs) return { visible: true, reveal, state: 'question', stateTime: (nowMs - t.questionAtMs) / 1000 };
  return { visible: true, reveal: 1, state: t.answer.kind, stateTime: (nowMs - t.answer.atMs) / 1000 };
}
