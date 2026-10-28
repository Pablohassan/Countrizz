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
/** Le premier vol arrive : la première question (plus de 3-2-1, 24/10). */
const toQuestion: GameEvent[] = [...start, { type: 'ARRIVED', flight: 1, now: 1_500 }];

describe('commandes du globe à chaque changement d’état', () => {
  it('accueil → mode : rien ; choix du mode : entrer en partie et voler vers la première question', () => {
    const [toMode, toFlight] = play(start);
    expect(toMode!.cmds).toEqual([]);
    expect(toFlight!.s.screen).toBe('flight');
    expect(toFlight!.cmds).toEqual([{ kind: 'enterGame' }, { kind: 'fly', cca3: toFlight!.s.question!.cca3, flight: 1 }]);
  });

  it('arrivée du premier vol : la question s’affiche une fois', () => {
    const steps = play(toQuestion);
    expect(steps[2]!.s.screen).toBe('question');
    expect(steps[2]!.cmds).toEqual([{ kind: 'showQuestion' }]);
  });

  it('réponse : une seule commande answer (une seconde réponse pendant la révélation est ignorée) ; puis vol suivant', () => {
    const q = play(toQuestion)[2]!.s;
    const wrong = (q.question!.answer + 1) % 4;
    const steps = play([{ type: 'ANSWER', index: wrong, now: 1_700 }, { type: 'ANSWER', index: q.question!.answer, now: 1_750 },
      { type: 'REVEAL_DONE', now: 3_200 }], q);
    expect(steps[0]!.cmds).toEqual([{ kind: 'answer', result: 'wrong' }]);
    expect(steps[1]!.cmds).toEqual([]);
    expect(steps[2]!.cmds).toEqual([{ kind: 'fly', cca3: steps[2]!.s.question!.cca3, flight: 2 }]);
    const arrived = play([{ type: 'ARRIVED', flight: 2, now: 5_000 }], steps[2]!.s);
    expect(arrived[0]!.cmds).toEqual([{ kind: 'showQuestion' }]);
    const ok = play([{ type: 'ANSWER', index: arrived[0]!.s.question!.answer, now: 5_100 }], arrived[0]!.s);
    expect(ok[0]!.cmds).toEqual([{ kind: 'answer', result: 'correct' }]);
  });

  it('fin du chrono, ou Quitter pendant le premier vol : sortir de la partie (vue d’accueil)', () => {
    const q = play(toQuestion)[2]!.s;
    expect(play([{ type: 'TICK', now: 4_500 }], q)[0]!.cmds).toEqual([{ kind: 'leaveGame' }]);
    const quit = play([...start, { type: 'QUIT' }]);
    expect(quit[2]!.s.screen).toBe('home');
    expect(quit[2]!.cmds).toEqual([{ kind: 'leaveGame' }]);
  });

  it('fin → scores : rien ; Rejouer depuis les scores : entrer en partie et voler ; scores → Retour → accueil : rien', () => {
    const end = play([...toQuestion, { type: 'TICK', now: 4_500 }])[3]!.s;
    expect(end.screen).toBe('end');
    const steps = play([{ type: 'SHOW_SCORES' }, { type: 'REPLAY', seed: 3 }], end);
    expect(steps[0]!.cmds).toEqual([]);
    expect(steps[1]!.cmds).toEqual([{ kind: 'enterGame' }, { kind: 'fly', cca3: steps[1]!.s.question!.cca3, flight: steps[1]!.s.flight }]);
    const back = play([{ type: 'SHOW_SCORES' }, { type: 'BACK' }], end);
    expect(back[1]!.s.screen).toBe('home');
    expect(back[1]!.cmds).toEqual([]);
  });
});
