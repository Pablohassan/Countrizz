import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { createClock, pauseClock, startClock } from '../game/clock';
import { fr } from '../i18n/fr';
import { Answers, answerStates, optionLabel, type GridState } from './Answers';
import { GameScreen, gridState } from './GameScreen';
import { createGame, initialState, type GameEvent } from '../game/machine';
import { Hud, hudTime } from './Hud';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const records = new Map(countries.map((c) => [c.cca3, c]));
const q = { cca3: 'VCT', options: ['FRA', 'VCT', 'BEL', 'CHE'], answer: 1 };
const noop = () => {};
const answers = (mode: 'flag' | 'country' | 'capital', picked: number | null, etat: GridState = 'actif') => renderToStaticMarkup(createElement(Answers,
  { m: fr, lang: 'fr', mode, question: q, records, picked, etat, onAnswer: noop, onPress: noop, onRelease: noop }));

describe('écran de partie (D1-D4, D10)', () => {
  it('HUD : secondes arrondies au-dessus, part de la jauge ; pause et 10 dernières secondes', () => {
    const c = startClock(createClock(60_000), 1_000);
    expect(hudTime(c, 19_000)).toEqual({ seconds: 42, fraction: 0.7 });
    expect(hudTime(c, 60_500).seconds).toBe(1);
    const countdown = renderToStaticMarkup(createElement(Hud, { m: fr, lang: 'fr', clock: createClock(60_000, ['flight']), score: 0, plus: false, onQuit: noop }));
    expect(countdown).toContain('hud-sec--pause');
    expect(countdown).toContain('❚❚ 60');
    expect(countdown).toContain('hud-jauge--pause');
    const t = performance.now();
    const late = renderToStaticMarkup(createElement(Hud, { m: fr, lang: 'fr', clock: startClock(createClock(60_000), t - 52_500), score: 190, plus: true, onQuit: noop }));
    expect(late).toContain('hud-sec--urgent');
    expect(late).toContain('★ 190');
    expect(late).toContain('+10');
    const paused = renderToStaticMarkup(createElement(Hud, { m: fr, lang: 'fr', clock: pauseClock(startClock(createClock(60_000), t - 22_000), 'flight', t), score: 0, plus: false, onQuit: noop }));
    expect(paused).toContain('❚❚ 38');
  });

  it('grille : libellés du mode et de la langue, libellé long en plus petit ; cachée et inerte au premier vol', () => {
    expect(optionLabel(records.get('FRA')!, 'capital', 'en')).toBe('Paris');
    expect(optionLabel(records.get('BEL')!, 'country', 'fr')).toBe('Belgique');
    const html = answers('country', null);
    expect(html).toContain('Quel est ce pays ?');
    expect(html.match(/class="reponse[ "]/g)).toHaveLength(4);
    expect(html).toContain('reponse reponse--long');            // Saint-Vincent-et-les-Grenadines
    expect(html).not.toContain('disabled');
    const cache = answers('country', null, 'cache');
    expect(cache).toContain('jeu-bas--cache');
    expect(cache.match(/disabled=""/g)).toHaveLength(4);
  });

  it('grille en vol (entre deux questions) : en place, estompée, inerte, sans les libellés suivants (le chrono est arrêté)', () => {
    for (const mode of ['country', 'capital', 'flag'] as const) {
      const vol = answers(mode, null, 'vol');
      expect(vol).toContain('jeu-bas--vol');
      expect(vol).not.toContain('jeu-bas--cache');
      expect(vol.match(/disabled=""/g)).toHaveLength(4);
      for (const mot of ['Belgique', 'Bruxelles', 'Saint-Vincent', 'flags/']) expect(vol, mode).not.toContain(mot);
    }
    expect(answers('country', null, 'vol')).toContain('Quel est ce pays ?');
  });

  it('état de la grille : cachée au premier vol, en vol entre deux questions, active sinon', () => {
    expect(gridState('flight', 1)).toBe('cache');
    expect(gridState('flight', 2)).toBe('vol');
    expect(gridState('question', 1)).toBe('actif');
    expect(gridState('reveal', 3)).toBe('actif');
  });

  it('vol suivant : l\'étiquette « Pays · capitale » reste sur le pays quitté (elle part avec lui), puis disparaît à l\'arrivée', () => {
    const reduce = createGame(countries);
    const run = (events: GameEvent[]) => events.reduce(reduce, initialState('fr'));
    const q1: GameEvent[] = [{ type: 'PLAY' }, { type: 'CHOOSE_MODE', mode: 'country', seed: 42 }, { type: 'ARRIVED', flight: 1, now: 4_000 }];
    const first = run(q1);
    const quitte = records.get(first.question!.cca3)!;
    const vol = run([...q1, { type: 'ANSWER', index: 0, now: 5_000 }, { type: 'REVEAL_DONE', now: 6_500 }]);
    expect(vol.screen).toBe('flight');
    const page = (state: typeof vol) => renderToStaticMarkup(createElement(GameScreen,
      { m: fr, lang: 'fr', state, records, globe: null, haptics: { play: () => 'none' } as never, onAnswer: noop, onQuit: noop }));
    expect(page(vol)).toContain(`${quitte.name.fr} · <small>${quitte.capital.fr}</small>`);
    expect(page(reduce(vol, { type: 'ARRIVED', flight: 2, now: 9_000 }))).not.toContain('class="etiquette"');
  });

  it('révélation R3 : bon vert ✓, choisi faux rouge ✗, autres estompés, tous inertes', () => {
    expect(answerStates(q, null)).toEqual(['idle', 'idle', 'idle', 'idle']);
    expect(answerStates(q, 0)).toEqual(['ko', 'ok', 'dim', 'dim']);
    expect(answerStates(q, 1)).toEqual(['dim', 'ok', 'dim', 'dim']);
    const html = answers('country', 0);
    expect(html).toContain('reponse--ko');
    expect(html).toContain('reponse--ok');
    expect(html.match(/reponse--estompe/g)).toHaveLength(2);
    expect(html).toContain('✓');
    expect(html).toContain('✗');
  });

  it('drapeaux P1 : aire égale, Népal en forme, nom montré à la révélation seulement', () => {
    const q2 = { cca3: 'FRA', options: ['NPL', 'QAT', 'FRA', 'CHE'], answer: 2 };
    const render = (picked: number | null) => renderToStaticMarkup(createElement(Answers,
      { m: fr, lang: 'fr', mode: 'flag', question: q2, records, picked, etat: 'actif', onAnswer: noop, onPress: noop, onRelease: noop }));
    const html = render(null);
    expect(html).toContain('Quel est son drapeau ?');
    expect(html).toContain('src="/data/flags/fra.svg"');
    expect(html).toContain('width:108px;height:72px');
    expect(html).toContain('class="forme"');
    expect(html).not.toContain('France');
    expect(render(0)).toContain('<span class="reponse-nom">France</span>');
  });
});
