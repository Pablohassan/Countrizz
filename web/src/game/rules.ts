/** +10 par bonne réponse, 0 sinon ; partie de 60 s nettes (spec 2A §2). */
export const POINTS_PER_ANSWER = 10;
export const GAME_MS = 60_000;

/** Une manche répondue : le pays et la réponse (la fin de partie montre les drapeaux, erreurs grisées). */
export interface Round { cca3: string; ok: boolean }
export interface Tally { score: number; correct: number; rounds: Round[] }

export const emptyTally = (): Tally => ({ score: 0, correct: 0, rounds: [] });

export function recordAnswer(t: Tally, cca3: string, ok: boolean): Tally {
  return {
    score: t.score + (ok ? POINTS_PER_ANSWER : 0),
    correct: t.correct + (ok ? 1 : 0),
    rounds: [...t.rounds, { cca3, ok }],
  };
}
