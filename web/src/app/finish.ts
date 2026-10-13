import { normalizeName } from '../game/prefs';
import type { Tally } from '../game/rules';
import { insertScore, type ScoreBook, type ScoreEntry } from '../game/scores';
import type { Mode } from '../game/types';

export interface GameResult {
  mode: Mode;
  score: number;
  correct: number;
  /** Manches répondues (la question en cours au zéro n'est pas comptée). */
  total: number;
  record: boolean;
  previousBest: number | null;
  rank: number | null;
  /** Faux : « Ton score ne peut pas être gardé sur cet appareil » (stockage absent, refusé ou plein). */
  saved: boolean;
  /** L'entrée de la partie : l'écran des scores la montre en violet, « · toi ». */
  entry: ScoreEntry;
}

/** La partie finie entre au top 10 de son mode (spec 2A §3 « Fin » et « Scores », section 5). */
export function finishGame(book: ScoreBook, mode: Mode, tally: Tally, name: string, at: number): GameResult {
  const entry: ScoreEntry = { name, score: tally.score, at };
  const r = insertScore(book.read(mode), entry);
  const saved = book.write(mode, r.list);
  return { mode, score: tally.score, correct: tally.correct, total: tally.rounds.length, record: r.record, previousBest: r.previousBest, rank: r.rank, saved, entry };
}

/** Nom affiché et enregistré : celui du joueur, recoupé, sinon le nom par défaut de la langue (« Globetrotteur »). */
export const playerName = (name: string, fallback: string): string => normalizeName(name, fallback);
