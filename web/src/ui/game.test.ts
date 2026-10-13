import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { createClock, pauseClock, startClock } from '../game/clock';
import { fr } from '../i18n/fr';
import { Answers, answerStates, optionLabel } from './Answers';
import { Countdown } from './Countdown';
import { Hud, hudTime } from './Hud';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const records = new Map(countries.map((c) => [c.cca3, c]));
const q = { cca3: 'VCT', options: ['FRA', 'VCT', 'BEL', 'CHE'], answer: 1 };
const noop = () => {};
const answers = (mode: 'flag' | 'country' | 'capital', picked: number | null, hidden = false) => renderToStaticMarkup(createElement(Answers,
  { m: fr, lang: 'fr', mode, question: q, records, picked, hidden, onAnswer: noop, onPress: noop, onRelease: noop }));

describe('écran de partie (D1-D4, D10, D11)', () => {
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

  it('3-2-1 : chiffres géants, puis « GO ! » dans le pavé violet', () => {
    expect(renderToStaticMarkup(createElement(Countdown, { value: 3, m: fr }))).toContain('<span class="decompte-n">3</span>');
    expect(renderToStaticMarkup(createElement(Countdown, { value: 0, m: fr }))).toContain('<span class="decompte-go">GO !</span>');
  });

  it('grille : libellés du mode et de la langue, libellé long en plus petit ; cachée et inerte pendant le vol', () => {
    expect(optionLabel(records.get('FRA')!, 'capital', 'en')).toBe('Paris');
    expect(optionLabel(records.get('BEL')!, 'country', 'fr')).toBe('Belgique');
    const html = answers('country', null);
    expect(html).toContain('Quel est ce pays ?');
    expect(html.match(/class="reponse[ "]/g)).toHaveLength(4);
    expect(html).toContain('reponse reponse--long');            // Saint-Vincent-et-les-Grenadines
    expect(html).not.toContain('disabled');
    const vol = answers('country', null, true);
    expect(vol).toContain('jeu-bas--cache');
    expect(vol.match(/disabled=""/g)).toHaveLength(4);
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
      { m: fr, lang: 'fr', mode: 'flag', question: q2, records, picked, hidden: false, onAnswer: noop, onPress: noop, onRelease: noop }));
    const html = render(null);
    expect(html).toContain('Quel est son drapeau ?');
    expect(html).toContain('src="/data/flags/fra.svg"');
    expect(html).toContain('width:108px;height:72px');
    expect(html).toContain('class="forme"');
    expect(html).not.toContain('France');
    expect(render(0)).toContain('<span class="reponse-nom">France</span>');
  });
});
