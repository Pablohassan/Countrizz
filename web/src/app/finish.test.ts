import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../game/prefs';
import { emptyTally, recordAnswer } from '../game/rules';
import { openScoreBook } from '../game/scores';
import { finishGame, playerName } from './finish';

const memory = (): KeyValueStorage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
};
const blocked: KeyValueStorage = { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); }, removeItem: () => {} };
const tally = (oks: boolean[]) => oks.reduce((t, ok, i) => recordAnswer(t, `P${i}`, ok), emptyTally());

describe('fin de partie (spec 2A §3 « Fin », section 5)', () => {
  it('première partie : record, rang 1, gardée ; « 2 bonnes réponses sur 3 »', () => {
    const r = finishGame(openScoreBook(memory()), 'country', tally([true, false, true]), 'Lina', 1000);
    expect(r).toMatchObject({ mode: 'country', score: 20, correct: 2, total: 3, record: true, previousBest: null, rank: 1, saved: true });
    expect(r.entry).toEqual({ name: 'Lina', score: 20, at: 1000 });
  });

  it('partie suivante plus faible : pas de record, ancien record affiché, rang 2', () => {
    const book = openScoreBook(memory());
    finishGame(book, 'flag', tally([true, true, true]), 'Lina', 1000);
    const r = finishGame(book, 'flag', tally([true]), 'Malik', 2000);
    expect(r).toMatchObject({ record: false, previousBest: 30, rank: 2, saved: true });
    expect(book.read('flag').map((e) => e.name)).toEqual(['Lina', 'Malik']);
  });

  it('stockage bloqué : la partie est gardée le temps de la visite, `saved` faux', () => {
    const book = openScoreBook(blocked);
    const r = finishGame(book, 'capital', tally([true]), 'Zoé', 1000);
    expect(r.saved).toBe(false);
    expect(book.read('capital')).toEqual([{ name: 'Zoé', score: 10, at: 1000 }]);
  });

  it('nom du joueur : saisi et recoupé, sinon le nom par défaut', () => {
    expect(playerName('', 'Globetrotteur')).toBe('Globetrotteur');
    expect(playerName('   ', 'Globe-trotter')).toBe('Globe-trotter');
    expect(playerName(' Lina  B ', 'Globetrotteur')).toBe('Lina B');
  });
});
