import { createClock, pauseClock, remainingMs, resumeClock, startClock, type Clock } from './clock';
import { drawQuestion } from './draw';
import { createRng } from './rng';
import { emptyTally, GAME_MS, recordAnswer, type Tally } from './rules';
import type { DrawCountry, Lang, Mode, Question } from './types';

/** Écrans du parcours (spec 2A §2) ; « À propos », erreurs et « Tourne ton téléphone » sont des calques de l'interface. */
export type Screen = 'home' | 'mode' | 'countdown' | 'flight' | 'question' | 'reveal' | 'end' | 'scores';

export const REVEAL_MS = 1500;
export const COUNTDOWN_FROM = 3;

export interface GameState {
  screen: Screen;
  lang: Lang;
  mode: Mode | null;
  seed: number;
  /** État du générateur après le dernier tirage (réducteur pur). */
  rngState: number;
  /** Pays déjà demandés, dans l'ordre. */
  asked: string[];
  question: Question | null;
  /** Bonnes réponses d'affilée en cours (difficulté). */
  streak: number;
  tally: Tally;
  clock: Clock;
  /** 3, 2, 1, puis 0 = « GO ! ». */
  countdown: number;
  /** Le vol de la manche en cours est arrivé. */
  arrived: boolean;
  /** Réponse choisie, pendant la révélation. */
  picked: number | null;
  /** Écran d'où l'on est venu aux scores (accueil ou fin). */
  scoresFrom: 'home' | 'end' | null;
}

export type GameEvent =
  | { type: 'SET_LANG'; lang: Lang }
  | { type: 'PLAY' }
  | { type: 'BACK' }
  | { type: 'SHOW_SCORES' }
  | { type: 'CHOOSE_MODE'; mode: Mode; seed: number }
  | { type: 'COUNTDOWN_TICK'; now: number }
  | { type: 'ARRIVED'; now: number }
  | { type: 'ANSWER'; index: number; now: number }
  | { type: 'REVEAL_DONE'; now: number }
  | { type: 'TICK'; now: number }
  | { type: 'PAUSE'; reason: 'hidden' | 'rotate'; now: number }
  | { type: 'RESUME'; reason: 'hidden' | 'rotate'; now: number }
  | { type: 'QUIT' }
  | { type: 'REPLAY'; seed: number }
  | { type: 'CHANGE_MODE' };

export const initialState = (lang: Lang): GameState => ({
  screen: 'home', lang, mode: null, seed: 0, rngState: 0, asked: [], question: null, streak: 0,
  tally: emptyTally(), clock: createClock(GAME_MS), countdown: COUNTDOWN_FROM, arrived: false, picked: null, scoresFrom: null,
});

const IN_GAME: readonly Screen[] = ['countdown', 'flight', 'question', 'reveal'];

export function createGame(countries: DrawCountry[]): (s: GameState, e: GameEvent) => GameState {
  /** Nouvelle partie : première manche tirée, son vol part pendant le 3-2-1 (chrono pas encore lancé, cause « vol »). */
  function newGame(s: GameState, mode: Mode, seed: number): GameState {
    const rng = createRng(seed);
    const question = drawQuestion(countries, new Set(), 0, mode, s.lang, rng);
    if (!question) throw new Error('jeu : aucun pays à demander');
    return {
      ...s, screen: 'countdown', mode, seed, rngState: rng.state, asked: [question.cca3], question, streak: 0,
      tally: emptyTally(), clock: createClock(GAME_MS, ['flight']), countdown: COUNTDOWN_FROM, arrived: false, picked: null,
    };
  }

  return function reduce(s: GameState, e: GameEvent): GameState {
    switch (e.type) {
      case 'SET_LANG':
        return s.screen === 'home' && s.lang !== e.lang ? { ...s, lang: e.lang } : s;
      case 'PLAY':
        return s.screen === 'home' ? { ...s, screen: 'mode' } : s;
      case 'SHOW_SCORES':
        return s.screen === 'home' || s.screen === 'end' ? { ...s, screen: 'scores', scoresFrom: s.screen } : s;
      case 'BACK':
        if (s.screen === 'mode') return { ...s, screen: 'home' };
        if (s.screen === 'scores') return { ...s, screen: s.scoresFrom ?? 'home', scoresFrom: null };
        return s;
      case 'CHOOSE_MODE':
        return s.screen === 'mode' ? newGame(s, e.mode, e.seed) : s;
      case 'COUNTDOWN_TICK': {
        if (s.screen !== 'countdown') return s;
        if (s.countdown > 0) return { ...s, countdown: s.countdown - 1 };
        return { ...s, clock: startClock(s.clock, e.now), screen: s.arrived ? 'question' : 'flight' };
      }
      case 'ARRIVED':
        if (s.screen === 'countdown' && !s.arrived) return { ...s, arrived: true, clock: resumeClock(s.clock, 'flight', e.now) };
        if (s.screen !== 'flight') return s;
        return { ...s, screen: 'question', arrived: true, clock: resumeClock(s.clock, 'flight', e.now) };
      case 'ANSWER': {
        if (s.screen !== 'question' || !s.question || !Number.isInteger(e.index) || e.index < 0 || e.index > 3) return s;
        const ok = e.index === s.question.answer;
        return {
          ...s, screen: 'reveal', picked: e.index, streak: ok ? s.streak + 1 : 0,
          tally: recordAnswer(s.tally, s.question.cca3, ok), clock: pauseClock(s.clock, 'reveal', e.now),
        };
      }
      case 'REVEAL_DONE': {
        if (s.screen !== 'reveal' || !s.mode) return s;
        const rng = createRng(s.rngState);
        const question = drawQuestion(countries, new Set(s.asked), s.streak, s.mode, s.lang, rng);
        const resumed = resumeClock(s.clock, 'reveal', e.now);
        if (!question) return { ...s, screen: 'end', clock: resumed, picked: null, question: null };
        return {
          ...s, screen: 'flight', rngState: rng.state, asked: [...s.asked, question.cca3], question, arrived: false,
          picked: null, clock: pauseClock(resumed, 'flight', e.now),
        };
      }
      case 'TICK':
        // Le chrono ne tourne que pendant une question : c'est là seulement qu'il peut atteindre zéro.
        if (s.screen !== 'question' || remainingMs(s.clock, e.now) > 0) return s;
        return { ...s, screen: 'end', question: null, picked: null };
      case 'PAUSE':
        return IN_GAME.includes(s.screen) ? { ...s, clock: pauseClock(s.clock, e.reason, e.now) } : s;
      case 'RESUME':
        return IN_GAME.includes(s.screen) ? { ...s, clock: resumeClock(s.clock, e.reason, e.now) } : s;
      case 'QUIT':
        return IN_GAME.includes(s.screen) ? initialState(s.lang) : s;
      case 'REPLAY':
        return s.screen === 'end' && s.mode ? newGame(s, s.mode, e.seed) : s;
      case 'CHANGE_MODE':
        return s.screen === 'end' ? { ...s, screen: 'mode' } : s;
    }
  };
}
