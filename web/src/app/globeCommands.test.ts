import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { createGame, initialState, type GameEvent, type GameState } from '../game/machine';
import { globeCommands, type GlobeCommand } from './globeCommands';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const reduce = createGame(countries, 3_000);

/** Rejoue les événements et rend les commandes de chaque transition. */
function play(events: GameEvent[], from: GameState = initialState('fr')) {
  let s = from;
  const steps: { s: GameState; cmds: GlobeCommand[] }[] = [];
  for (const e of events) { const n = reduce(s, e); steps.push({ s: n, cmds: globeCommands(s, n) }); s = n; }
  return steps;
}

const start: GameEvent[] = [{ type: 'PLAY' }, { type: 'CHOOSE_MODE', mode: 'country', seed: 42 }];

describe('commandes du globe à chaque changement d’état', () => {
  it('accueil → mode : rien ; 3-2-1 : entrer en partie et voler vers la première question', () => {
    const [toMode, toCountdown] = play(start);
    expect(toMode!.cmds).toEqual([]);
    expect(toCountdown!.cmds).toEqual([{ kind: 'enterGame' }, { kind: 'fly', cca3: toCountdown!.s.question!.cca3, flight: 1 }]);
  });

  it('arrivée pendant le 3-2-1 : rien ; « GO ! » passé : la question s’affiche une fois', () => {
    const steps = play([...start, { type: 'COUNTDOWN_TICK', now: 1_000 }, { type: 'ARRIVED', flight: 1, now: 1_500 },
      { type: 'COUNTDOWN_TICK', now: 2_000 }, { type: 'COUNTDOWN_TICK', now: 3_000 }, { type: 'COUNTDOWN_TICK', now: 4_000 }]);
    expect(steps.slice(2, 6).map((x) => x.cmds)).toEqual([[], [], [], []]);
    expect(steps[6]!.s.screen).toBe('question');
    expect(steps[6]!.cmds).toEqual([{ kind: 'showQuestion' }]);
  });

  it('réponse : une seule commande answer (une seconde réponse pendant la révélation est ignorée) ; puis vol suivant', () => {
    const [, , , , , , q] = play([...start, { type: 'COUNTDOWN_TICK', now: 1_000 }, { type: 'ARRIVED', flight: 1, now: 1_500 },
      { type: 'COUNTDOWN_TICK', now: 2_000 }, { type: 'COUNTDOWN_TICK', now: 3_000 }, { type: 'COUNTDOWN_TICK', now: 4_000 }]);
    const wrong = (q!.s.question!.answer + 1) % 4;
    const steps = play([{ type: 'ANSWER', index: wrong, now: 4_200 }, { type: 'ANSWER', index: q!.s.question!.answer, now: 4_250 },
      { type: 'REVEAL_DONE', now: 5_700 }], q!.s);
    expect(steps[0]!.cmds).toEqual([{ kind: 'answer', result: 'wrong' }]);
    expect(steps[1]!.cmds).toEqual([]);
    expect(steps[2]!.cmds).toEqual([{ kind: 'fly', cca3: steps[2]!.s.question!.cca3, flight: 2 }]);
    const arrived = play([{ type: 'ARRIVED', flight: 2, now: 7_000 }], steps[2]!.s);
    expect(arrived[0]!.cmds).toEqual([{ kind: 'showQuestion' }]);
    const ok = play([{ type: 'ANSWER', index: arrived[0]!.s.question!.answer, now: 7_100 }], arrived[0]!.s);
    expect(ok[0]!.cmds).toEqual([{ kind: 'answer', result: 'correct' }]);
  });

  it('fin du chrono, ou Quitter pendant le 3-2-1 : sortir de la partie (vue d’accueil)', () => {
    const toQ = play([...start, { type: 'COUNTDOWN_TICK', now: 1_000 }, { type: 'ARRIVED', flight: 1, now: 1_500 },
      { type: 'COUNTDOWN_TICK', now: 2_000 }, { type: 'COUNTDOWN_TICK', now: 3_000 }, { type: 'COUNTDOWN_TICK', now: 4_000 }]);
    const q = toQ[6]!.s;
    expect(play([{ type: 'TICK', now: 7_000 }], q)[0]!.cmds).toEqual([{ kind: 'leaveGame' }]);
    const quit = play([...start, { type: 'QUIT' }]);
    expect(quit[2]!.s.screen).toBe('home');
    expect(quit[2]!.cmds).toEqual([{ kind: 'leaveGame' }]);
  });

  it('fin → scores → fin : rien ; Rejouer : entrer en partie et voler', () => {
    const toQ = play([...start, { type: 'COUNTDOWN_TICK', now: 1_000 }, { type: 'ARRIVED', flight: 1, now: 1_500 },
      { type: 'COUNTDOWN_TICK', now: 2_000 }, { type: 'COUNTDOWN_TICK', now: 3_000 }, { type: 'COUNTDOWN_TICK', now: 4_000 },
      { type: 'TICK', now: 7_000 }]);
    const end = toQ[7]!.s;
    expect(end.screen).toBe('end');
    const steps = play([{ type: 'SHOW_SCORES' }, { type: 'BACK' }, { type: 'REPLAY', seed: 3 }], end);
    expect(steps[0]!.cmds).toEqual([]);
    expect(steps[1]!.cmds).toEqual([]);
    expect(steps[2]!.cmds).toEqual([{ kind: 'enterGame' }, { kind: 'fly', cca3: steps[2]!.s.question!.cca3, flight: steps[2]!.s.flight }]);
  });
});
