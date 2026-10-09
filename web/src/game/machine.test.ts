import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { remainingMs } from './clock';
import { createGame, initialState, type GameEvent, type GameState } from './machine';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const reduce = createGame(countries);
const run = (events: GameEvent[], from: GameState = initialState('fr')) => events.reduce(reduce, from);

/** Jusqu'à la première question : premier vol arrivé pendant le décompte. */
const toQuestion: GameEvent[] = [
  { type: 'PLAY' }, { type: 'CHOOSE_MODE', mode: 'country', seed: 42 },
  { type: 'COUNTDOWN_TICK', now: 1_000 }, { type: 'ARRIVED', now: 1_500 },
  { type: 'COUNTDOWN_TICK', now: 2_000 }, { type: 'COUNTDOWN_TICK', now: 3_000 }, { type: 'COUNTDOWN_TICK', now: 4_000 },
];

describe('machine d\'états du jeu', () => {
  it('accueil → mode → 3-2-1 : la première manche est tirée et son vol part pendant le décompte', () => {
    const s = run([{ type: 'PLAY' }, { type: 'CHOOSE_MODE', mode: 'flag', seed: 7 }]);
    expect(s.screen).toBe('countdown');
    expect(s.countdown).toBe(3);
    expect(s.question?.options).toHaveLength(4);
    expect(s.asked).toEqual([s.question!.cca3]);
  });

  it('premier vol arrivé avant « GO ! » : la question arrive juste après, chrono lancé', () => {
    const s = run(toQuestion);
    expect(s.screen).toBe('question');
    expect(remainingMs(s.clock, 14_000)).toBe(50_000);
  });

  it('premier vol plus long que le décompte : écran de vol, chrono en pause jusqu\'à l\'arrivée', () => {
    const s = run([
      { type: 'PLAY' }, { type: 'CHOOSE_MODE', mode: 'country', seed: 42 },
      { type: 'COUNTDOWN_TICK', now: 1_000 }, { type: 'COUNTDOWN_TICK', now: 2_000 },
      { type: 'COUNTDOWN_TICK', now: 3_000 }, { type: 'COUNTDOWN_TICK', now: 4_000 },
    ]);
    expect(s.screen).toBe('flight');
    expect(remainingMs(s.clock, 9_000)).toBe(60_000);
    const q = reduce(s, { type: 'ARRIVED', now: 9_000 });
    expect(q.screen).toBe('question');
    expect(remainingMs(q.clock, 19_000)).toBe(50_000);
  });

  it('bonne réponse : révélation, +10, série +1, chrono en pause ; puis manche suivante en vol', () => {
    const q = run(toQuestion);
    const r = reduce(q, { type: 'ANSWER', index: q.question!.answer, now: 10_000 });
    expect(r.screen).toBe('reveal');
    expect([r.tally.score, r.tally.correct, r.streak, r.picked]).toEqual([10, 1, 1, q.question!.answer]);
    expect(remainingMs(r.clock, 11_500)).toBe(54_000);
    const f = reduce(r, { type: 'REVEAL_DONE', now: 11_500 });
    expect(f.screen).toBe('flight');
    expect(f.asked).toHaveLength(2);
    expect(f.question!.cca3).not.toBe(q.question!.cca3);
    expect(remainingMs(f.clock, 14_000)).toBe(54_000);
  });

  it('mauvaise réponse : 0 point, série remise à zéro', () => {
    const q = run(toQuestion);
    const wrong = (q.question!.answer + 1) % 4;
    const r = reduce({ ...q, streak: 5 }, { type: 'ANSWER', index: wrong, now: 10_000 });
    expect([r.tally.score, r.tally.correct, r.tally.rounds.length, r.streak]).toEqual([0, 0, 1, 0]);
  });

  it('temps écoulé pendant une question : fin, la question en cours n\'est pas comptée', () => {
    const q = run(toQuestion);
    expect(reduce(q, { type: 'TICK', now: 63_999 }).screen).toBe('question');
    const end = reduce(q, { type: 'TICK', now: 64_000 });
    expect(end.screen).toBe('end');
    expect(end.tally.rounds).toHaveLength(0);
  });

  it('onglet caché et téléphone tourné : chrono en pause, reprise exacte', () => {
    let s = run(toQuestion);
    s = reduce(s, { type: 'PAUSE', reason: 'hidden', now: 10_000 });
    s = reduce(s, { type: 'PAUSE', reason: 'rotate', now: 11_000 });
    s = reduce(s, { type: 'RESUME', reason: 'hidden', now: 30_000 });
    expect(reduce(s, { type: 'TICK', now: 70_000 }).screen).toBe('question');
    s = reduce(s, { type: 'RESUME', reason: 'rotate', now: 40_000 });
    expect(remainingMs(s.clock, 41_000)).toBe(53_000);
  });

  it('événements en double ou à contretemps : ignorés', () => {
    const q = run(toQuestion);
    const r = reduce(q, { type: 'ANSWER', index: q.question!.answer, now: 10_000 });
    expect(reduce(r, { type: 'ANSWER', index: q.question!.answer, now: 10_050 })).toBe(r);   // double appui
    const f = reduce(r, { type: 'REVEAL_DONE', now: 11_500 });
    expect(reduce(f, { type: 'REVEAL_DONE', now: 11_600 })).toBe(f);                         // fin de révélation en double
    expect(reduce(f, { type: 'ANSWER', index: 0, now: 11_700 })).toBe(f);                     // réponse pendant un vol
    const a = reduce(f, { type: 'ARRIVED', now: 13_000 });
    expect(reduce(a, { type: 'ARRIVED', now: 13_100 })).toBe(a);                              // arrivée en double
    expect(reduce(q, { type: 'ANSWER', index: 7, now: 10_000 })).toBe(q);                     // index hors grille
  });

  it('Quitter sans confirmation : retour à l\'accueil, langue gardée', () => {
    const s = run([...toQuestion, { type: 'QUIT' }], initialState('en'));
    expect(s.screen).toBe('home');
    expect(s.lang).toBe('en');
  });

  it('fin : Rejouer (nouvelle graine, même mode), Changer de mode, Scores puis Retour à la fin', () => {
    const end = reduce(run(toQuestion), { type: 'TICK', now: 64_000 });
    const again = reduce(end, { type: 'REPLAY', seed: 99 });
    expect([again.screen, again.mode, again.seed, again.tally.rounds.length, again.asked.length]).toEqual(['countdown', 'country', 99, 0, 1]);
    expect(reduce(end, { type: 'CHANGE_MODE' }).screen).toBe('mode');
    const scores = reduce(end, { type: 'SHOW_SCORES' });
    expect(scores.screen).toBe('scores');
    expect(reduce(scores, { type: 'BACK' }).screen).toBe('end');
  });

  it('accueil : langue changeable, Scores puis Retour à l\'accueil ; Retour depuis le choix du mode', () => {
    let s = reduce(initialState('fr'), { type: 'SET_LANG', lang: 'en' });
    expect(s.lang).toBe('en');
    s = reduce(s, { type: 'SHOW_SCORES' });
    expect(reduce(s, { type: 'BACK' }).screen).toBe('home');
    expect(run([{ type: 'PLAY' }, { type: 'BACK' }]).screen).toBe('home');
  });

  it('même graine et mêmes événements : même partie', () => {
    expect(run(toQuestion)).toEqual(run(toQuestion));
  });
});
