import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GameResult } from '../app/finish';
import type { CountryRecord } from '../data/types';
import type { KeyValueStorage } from '../game/prefs';
import { openScoreBook } from '../game/scores';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import { EndScreen } from './EndScreen';
import { bestScores, ModeScreen } from './ModeScreen';
import { ScoresScreen } from './ScoresScreen';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const records = new Map(countries.map((c) => [c.cca3, c]));
const memory = (): KeyValueStorage => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } }; };
const noop = () => {};
const result = (p: Partial<GameResult>): GameResult => ({ mode: 'country', score: 190, correct: 19, total: 24, record: true, previousBest: 160, rank: 3, saved: true, entry: { name: 'Globetrotteur', score: 190, at: 3 }, ...p });

describe('écrans hors partie (D9, D12, D13)', () => {
  it('choix du mode A : trois boutons, étoiles 1 à 3, record en pastille, « Nouveau » si jamais joué', () => {
    const book = openScoreBook(memory());
    book.write('flag', [{ name: 'Lina', score: 18, at: 1 }]);
    book.write('capital', [{ name: 'Lina', score: 0, at: 2 }]);
    expect(bestScores(book)).toEqual({ flag: 18, country: null, capital: 0 });
    const html = renderToStaticMarkup(createElement(ModeScreen, { m: fr, name: 'Globetrotteur', best: bestScores(book), onChoose: noop, onBack: noop }));
    expect(html).toContain('Choisis ton mode');
    expect(html).toContain('Joueur : <b>Globetrotteur</b>');
    expect(html.match(/class="mode-bouton"/g)).toHaveLength(3);
    expect(html).toContain('<small>Record</small> 18');
    expect(html).toContain('record record--nouveau');
    expect(html).toContain('★<span class="etoiles-off">★★</span>');
  });

  it('fin F1 : score, « 19 bonnes réponses sur 24 », ancien record, tampon, drapeaux (erreurs grisées)', () => {
    const rounds = [{ cca3: 'FRA', ok: true }, { cca3: 'EST', ok: false }];
    const html = renderToStaticMarkup(createElement(EndScreen, { m: fr, lang: 'fr', name: 'Globetrotteur', result: result({}), rounds, records, onReplay: noop, onChangeMode: noop, onScores: noop }));
    expect(html).toContain('Temps écoulé !');
    expect(html).toContain('Mode Pays · Globetrotteur');
    expect(html).toContain('<div class="fin-score">190</div>');
    expect(html).toContain('<b>19</b> bonnes réponses sur <b>24</b>');
    expect(html).toContain('Ancien record : 160');
    expect(html).toContain('Nouveau record !');
    expect(html.match(/class="fin-escale[ "]/g)).toHaveLength(2);
    expect(html).toContain('fin-escale ko');
    expect(html).not.toContain('Ton score ne peut pas');
    const lost = renderToStaticMarkup(createElement(EndScreen, { m: en, lang: 'en', name: 'Globetrotter', result: result({ record: false, previousBest: null, saved: false, score: 10, correct: 1, total: 1 }), rounds: [], records, onReplay: noop, onChangeMode: noop, onScores: noop }));
    expect(lost).not.toContain('fin-tampon');
    expect(lost).toContain(en.end.notSaved);
    expect(lost).toContain('<b>1</b>');
  });

  it('scores S2 : onglet du mode, 1ᵉʳ en jaune, la partie du joueur en violet « · toi », liste vide', () => {
    const book = openScoreBook(memory());
    // un joueur sans nom est enregistré sans nom : l'écran montre le nom par défaut de la langue, entier (« Globetrotteur »
    // a 13 caractères, un nom saisi 12 au plus : enregistré tel quel, il serait recoupé à la relecture)
    book.write('country', [{ name: 'Lina', score: 240, at: 1 }, { name: '', score: 190, at: 3 }]);
    const html = renderToStaticMarkup(createElement(ScoresScreen, { m: fr, initialMode: 'country', book, me: result({ entry: { name: '', score: 190, at: 3 } }), onBack: noop, onReplay: noop }));
    expect(html).toContain('Top scores');
    expect(html).toContain('aria-selected="true" class="onglet"><span>Pays</span>');
    expect(html).toContain('scores-ligne scores-ligne--premier');
    expect(html).toContain('scores-ligne scores-ligne--toi');
    expect(html).toContain('Globetrotteur · toi');
    const empty = renderToStaticMarkup(createElement(ScoresScreen, { m: fr, initialMode: 'flag', book, me: null, onBack: noop, onReplay: noop }));
    expect(empty).toContain('Pas encore de score dans ce mode');
  });
});
