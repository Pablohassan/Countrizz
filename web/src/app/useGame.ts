import { useEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react';
import type { CountryRecord } from '../data/types';
import { createGame, initialState, REVEAL_MS, type GameEvent, type GameState } from '../game/machine';
import type { ScoreBook } from '../game/scores';
import type { Lang } from '../game/types';
import type { GlobeHandle } from '../globe/GlobeView';
import type { Haptics } from '../ui/haptics';
import { answerIndexFromKey } from '../ui/keys';
import { finishGame, type GameResult } from './finish';
import { globeCommands } from './globeCommands';

declare global {
  interface Window {
    /** Crochet des e2e (drapeau `countrizz:e2e` ou dev) : l'état du jeu et le résultat de la dernière partie. */
    __game?: { state: GameState; result: GameResult | null };
  }
}

export interface GameOptions {
  countries: CountryRecord[];
  lang: Lang;
  globe: RefObject<GlobeHandle | null>;
  haptics: Haptics;
  book: ScoreBook;
  /** Nom affiché et enregistré (le nom par défaut de la langue s'il est vide). */
  name: string;
  /** Téléphone en paysage : chrono en pause (D5, D16). */
  rotated: boolean;
  /** Durée nette d'une partie (crochet `?partie=` ; 60 s sinon). */
  gameMs?: number;
  /** Rotation de l'accueil, rendue au globe en sortie de partie. */
  homeSpin: number;
  hooks: boolean;
}

/**
 * Le jeu branché (contrat 2A-3 de l'appelant) : la machine pure, ses minuteries (3-2-1 à la seconde, `TICK` pendant la
 * question, révélation de 1,5 s), l'onglet caché et le téléphone tourné (pauses), le globe (`globeCommands`, ticket de vol :
 * `ARRIVED` seulement sur `true`), l'haptique et l'enregistrement du score à l'entrée en fin (une fois par partie).
 */
export function useGame(o: GameOptions) {
  const reduce = useMemo(() => createGame(o.countries, o.gameMs), [o.countries, o.gameMs]);
  const [state, dispatch] = useReducer(reduce, o.lang, initialState);
  const records = useMemo(() => new Map(o.countries.map((c) => [c.cca3, c])), [o.countries]);
  const [result, setResult] = useState<{ flight: number; value: GameResult } | null>(null);
  const opts = useRef(o);
  opts.current = o;
  const prev = useRef(state);
  const now = () => performance.now();

  // langue : la machine ne la change qu'à l'accueil
  useEffect(() => { dispatch({ type: 'SET_LANG', lang: o.lang }); }, [o.lang]);

  // le globe suit chaque changement d'écran ou de vol
  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    const g = opts.current.globe.current;
    if (!g) return;
    for (const c of globeCommands(before, state)) {
      if (c.kind === 'enterGame') g.setIdleSpin(0);
      else if (c.kind === 'fly') {
        const rec = records.get(c.cca3);
        if (rec) void g.flyTo(rec).arrived.then((ok) => { if (ok) dispatch({ type: 'ARRIVED', flight: c.flight, now: now() }); });
      } else if (c.kind === 'showQuestion') g.showQuestion();
      else if (c.kind === 'answer') { g.answer(c.result); opts.current.haptics.play(c.result); }
      else { g.setSafeArea(null); g.clear(); g.home(); g.setIdleSpin(opts.current.homeSpin); }
    }
  }, [state, records]);

  // 3-2-1 : un pas par seconde ; une vibration par chiffre, plus forte à « GO ! »
  useEffect(() => {
    if (state.screen !== 'countdown') return;
    opts.current.haptics.play(state.countdown > 0 ? 'countdown' : 'go');
    const t = setTimeout(() => dispatch({ type: 'COUNTDOWN_TICK', now: now() }), 1000);
    return () => clearTimeout(t);
  }, [state.screen, state.countdown, state.flight]);

  // question : le chrono peut atteindre zéro
  useEffect(() => {
    if (state.screen !== 'question') return;
    const t = setInterval(() => dispatch({ type: 'TICK', now: now() }), 200);
    return () => clearInterval(t);
  }, [state.screen]);

  // L1 : au clavier, une réponse par touche 1 à 4 (une touche tenue ne répond qu'une fois)
  useEffect(() => {
    if (state.screen !== 'question') return;
    const on = (e: KeyboardEvent) => {
      const i = answerIndexFromKey(e);
      if (i === null || e.repeat) return;
      e.preventDefault();
      dispatch({ type: 'ANSWER', index: i, now: now() });
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [state.screen]);

  // révélation : 1,5 s, puis la manche suivante
  useEffect(() => {
    if (state.screen !== 'reveal') return;
    const t = setTimeout(() => dispatch({ type: 'REVEAL_DONE', now: now() }), REVEAL_MS);
    return () => clearTimeout(t);
  }, [state.screen, state.asked.length]);

  // onglet caché : chrono en pause
  useEffect(() => {
    const on = () => dispatch({ type: document.hidden ? 'PAUSE' : 'RESUME', reason: 'hidden', now: now() });
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  // téléphone tourné : chrono en pause
  useEffect(() => { dispatch({ type: o.rotated ? 'PAUSE' : 'RESUME', reason: 'rotate', now: now() }); }, [o.rotated]);

  // fin : la partie entre au top 10, une fois (le numéro du vol la désigne)
  useEffect(() => {
    if (state.screen !== 'end' || !state.mode || result?.flight === state.flight) return;
    const value = finishGame(opts.current.book, state.mode, state.tally, opts.current.name, Date.now());
    setResult({ flight: state.flight, value });
    if (value.record) opts.current.haptics.play('record');
  }, [state.screen, state.mode, state.flight, state.tally, result]);

  const current = result?.value ?? null;
  useEffect(() => { if (o.hooks) window.__game = { state, result: current }; }, [o.hooks, state, current]);

  return {
    state,
    /** Résultat de la partie qui vient de finir (`null` tant qu'il n'est pas calculé) ; ailleurs, la dernière partie de la visite. */
    result: state.screen === 'end' ? (result?.flight === state.flight ? current : null) : current,
    records,
    dispatch: dispatch as (e: GameEvent) => void,
    answer: (index: number) => dispatch({ type: 'ANSWER', index, now: now() }),
  };
}
