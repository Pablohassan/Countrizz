import { createClock, pauseClock, remainingMs, resumeClock, startClock, type Clock } from './clock';
import { drawQuestion } from './draw';
import { createRng } from './rng';
import { emptyTally, GAME_MS, recordAnswer, type Tally } from './rules';
import type { DrawCountry, Lang, Mode, Question } from './types';

/** Écrans du parcours (spec 2A §2) ; « À propos », erreurs et « Tourne ton téléphone » sont des calques de l'interface. */
export type Screen = 'home' | 'mode' | 'flight' | 'question' | 'reveal' | 'end' | 'scores';

export const REVEAL_MS = 1500;

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
  /** Le vol de la manche en cours est arrivé. */
  arrived: boolean;
  /** Réponse choisie, pendant la révélation. */
  picked: number | null;
  /** Numéro du vol en cours, croissant d'une partie à l'autre (Quitter compris) : ARRIVED doit le rappeler. */
  flight: number;
}

export type GameEvent =
  | { type: 'SET_LANG'; lang: Lang }
  | { type: 'PLAY' }
  | { type: 'BACK' }
  | { type: 'SHOW_SCORES' }
  | { type: 'CHOOSE_MODE'; mode: Mode; seed: number }
  | { type: 'ARRIVED'; flight: number; now: number }
  | { type: 'ANSWER'; index: number; now: number }
  | { type: 'REVEAL_DONE'; now: number }
  | { type: 'TICK'; now: number }
  | { type: 'PAUSE'; reason: 'hidden' | 'rotate'; now: number }
  | { type: 'RESUME'; reason: 'hidden' | 'rotate'; now: number }
  | { type: 'QUIT' }
  | { type: 'REPLAY'; seed: number; mode?: Mode }
  | { type: 'CHANGE_MODE' };

export const initialState = (lang: Lang): GameState => ({
  screen: 'home', lang, mode: null, seed: 0, rngState: 0, asked: [], question: null, streak: 0,
  tally: emptyTally(), clock: createClock(GAME_MS), arrived: false, picked: null, flight: 0,
});

const IN_GAME: readonly Screen[] = ['flight', 'question', 'reveal'];

/**
 * Manche suivante, telle que `REVEAL_DONE` la tirera : connue dès la révélation (la réponse a fixé la série), ce qui laisse
 * précharger ses photos pendant la révélation et le vol (19/10). `null` hors révélation, ou s'il ne reste aucun pays.
 */
export function drawNext(countries: DrawCountry[], s: GameState): { question: Question; rngState: number } | null {
  if (s.screen !== 'reveal' || !s.mode) return null;
  const rng = createRng(s.rngState);
  const question = drawQuestion(countries, new Set(s.asked), s.streak, s.mode, s.lang, rng);
  return question ? { question, rngState: rng.state } : null;
}

/** `gameMs` : durée nette d'une partie (60 s ; plus courte seulement par le crochet `?partie=` des e2e). */
export function createGame(countries: DrawCountry[], gameMs: number = GAME_MS): (s: GameState, e: GameEvent) => GameState {
  /**
   * Nouvelle partie : première manche tirée, son vol part tout de suite ; il tient lieu de 3-2-1 (retiré le 24/10 : il
   * doublait le vol, chacun sur son horloge). Chrono pas encore lancé, en pause « vol » : il démarre à l'arrivée.
   */
  function newGame(s: GameState, mode: Mode, seed: number): GameState {
    const rng = createRng(seed);
    const question = drawQuestion(countries, new Set(), 0, mode, s.lang, rng);
    if (!question) throw new Error('jeu : aucun pays à demander');
    return {
      ...s, screen: 'flight', mode, seed, rngState: rng.state, asked: [question.cca3], question, streak: 0,
      tally: emptyTally(), clock: createClock(gameMs, ['flight']), arrived: false, picked: null,
      flight: s.flight + 1,
    };
  }

  return function reduce(s: GameState, e: GameEvent): GameState {
    switch (e.type) {
      case 'SET_LANG':
        return s.screen === 'home' && s.lang !== e.lang ? { ...s, lang: e.lang } : s;
      case 'PLAY':
        return s.screen === 'home' ? { ...s, screen: 'mode' } : s;
      case 'SHOW_SCORES':
        return s.screen === 'home' || s.screen === 'end' ? { ...s, screen: 'scores' } : s;
      case 'BACK':
        if (s.screen === 'mode') return { ...s, screen: 'home' };
        // des scores, toujours l'accueil : y revenir par la fin la rejouait (tampon compris), sans rien apporter (24/10)
        if (s.screen === 'scores') return { ...s, screen: 'home' };
        return s;
      case 'CHOOSE_MODE':
        return s.screen === 'mode' ? newGame(s, e.mode, e.seed) : s;
      case 'ARRIVED':
        if (e.flight !== s.flight) return s; // un vol remplacé (partie quittée, manche suivante) n'arrive plus
        if (s.screen !== 'flight') return s;
        // le premier vol arrivé lance le chrono ; les suivants le reprennent
        return { ...s, screen: 'question', arrived: true, clock: resumeClock(startClock(s.clock, e.now), 'flight', e.now) };
      case 'ANSWER': {
        if (s.screen !== 'question' || !s.question || !Number.isInteger(e.index) || e.index < 0 || e.index > 3) return s;
        // Réponse arrivée après zéro (TICK pas encore reçu) : la question en cours n'est pas comptée.
        if (remainingMs(s.clock, e.now) <= 0) return { ...s, screen: 'end', question: null, picked: null };
        const ok = e.index === s.question.answer;
        return {
          ...s, screen: 'reveal', picked: e.index, streak: ok ? s.streak + 1 : 0,
          tally: recordAnswer(s.tally, s.question.cca3, ok), clock: pauseClock(s.clock, 'reveal', e.now),
        };
      }
      case 'REVEAL_DONE': {
        if (s.screen !== 'reveal' || !s.mode) return s;
        const next = drawNext(countries, s);
        const resumed = resumeClock(s.clock, 'reveal', e.now);
        if (!next) return { ...s, screen: 'end', clock: resumed, picked: null, question: null };
        const { question, rngState } = next;
        return {
          ...s, screen: 'flight', rngState, asked: [...s.asked, question.cca3], question, arrived: false,
          picked: null, clock: pauseClock(resumed, 'flight', e.now), flight: s.flight + 1,
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
        return IN_GAME.includes(s.screen) ? { ...initialState(s.lang), flight: s.flight } : s;
      case 'REPLAY': {
        // Depuis la fin (même mode) ou l'écran des scores (mode de l'onglet ouvert).
        const mode = e.mode ?? s.mode;
        return (s.screen === 'end' || s.screen === 'scores') && mode ? newGame(s, mode, e.seed) : s;
      }
      case 'CHANGE_MODE':
        return s.screen === 'end' ? { ...s, screen: 'mode' } : s;
    }
  };
}
