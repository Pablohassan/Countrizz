import { describe, expect, it } from 'vitest';
import { emptyTally, GAME_MS, POINTS_PER_ANSWER, recordAnswer } from './rules';

describe('score', () => {
  it('+10 par bonne réponse, 0 sinon ; « bonnes / total » ; drapeaux de la partie dans l\'ordre', () => {
    let t = emptyTally();
    t = recordAnswer(t, 'FRA', true);
    t = recordAnswer(t, 'JPN', false);
    t = recordAnswer(t, 'BRA', true);
    expect(t.score).toBe(20);
    expect(t.correct).toBe(2);
    expect(t.rounds).toEqual([{ cca3: 'FRA', ok: true }, { cca3: 'JPN', ok: false }, { cca3: 'BRA', ok: true }]);
  });
  it('constantes du spec', () => {
    expect([POINTS_PER_ANSWER, GAME_MS]).toEqual([10, 60_000]);
  });
});
