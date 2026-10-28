import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../game/prefs';
import { openScoreBook } from '../game/scores';
import { fr } from '../i18n/fr';
import { bestScores, Home, type EntreeAccueil } from './Home';

const memory = (): KeyValueStorage => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } }; };
const noop = () => {};
const book = openScoreBook(memory());
book.write('flag', [{ name: 'Lina', score: 18, at: 1 }]);
book.write('capital', [{ name: 'Lina', score: 0, at: 2 }]);
const home = (p: { choix?: boolean; entree?: EntreeAccueil; visible?: boolean; sortie?: boolean } = {}) => renderToStaticMarkup(createElement(Home, {
  lang: 'fr', m: fr, name: 'Globetrotteur', onLang: noop, onName: noop, canPlay: true, onPlay: noop, onScores: noop, onAbout: noop,
  logo: { angle: null, visible: p.visible ?? true, sur: null, fondu: false }, entree: p.entree ?? 'fondu', choix: p.choix ?? false, sortie: p.sortie ?? false,
  best: bestScores(book), onChoose: noop, onBack: noop,
}));
const panneau = (html: string, cls: string) => new RegExp(`<div class="${cls}"( inert="")?`).exec(html)?.[1] === undefined ? 'actif' : 'inerte';

describe('accueil : le choix du mode sur place (mise en scène du 24/10)', () => {
  it('« Jouer » : les commandes laissent la place aux trois modes, dans l’accueil (titre, décor gardés) ; l’inactif est inerte', () => {
    const a = home();
    expect([panneau(a, 'accueil-commandes'), panneau(a, 'accueil-modes')]).toEqual(['actif', 'inerte']);
    const c = home({ choix: true });
    expect([panneau(c, 'accueil-commandes'), panneau(c, 'accueil-modes')]).toEqual(['inerte', 'actif']);
    expect(c).toContain('accueil--choix');
    expect(c).toContain('aria-label="Countrizz"');   // le titre reste
    expect(c).toMatch(/<button type="button" class="ecran-retour accueil-retour"[^>]*><span>‹ Retour<\/span><\/button>/);
  });

  it('les modes : trois boutons, étoiles 1 à 3, record en pastille, « Nouveau » si jamais joué', () => {
    expect(bestScores(book)).toEqual({ flag: 18, country: null, capital: 0 });
    const c = home({ choix: true });
    expect(c.match(/class="mode-bouton"/g)).toHaveLength(3);
    expect(c).toContain('<small>Record</small> 18');
    expect(c).toContain('record record--nouveau');
    expect(c).toContain('★<span class="etoiles-off">★★</span>');
  });

  it('entrées : une seule fois (fondu depuis la vidéo, ou accueil direct), aucune ensuite ; sortie vers la partie', () => {
    expect(home({ visible: false })).toMatch(/class="accueil accueil--fondu"/);
    expect(home()).toMatch(/class="accueil accueil--fondu accueil--visible"/);
    expect(home({ entree: 'deja' })).toMatch(/class="accueil accueil--deja accueil--visible"/);
    expect(home({ entree: 'deja', sortie: true })).toContain('accueil--sortie');
  });

  it('home.css : les commandes montent toutes du même côté (plus d’entrées par quatre côtés), seulement à la première apparition', () => {
    const css = readFileSync(new URL('./home.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/accueil-gauche|accueil-entree-droite|accueil-haut/);
    expect(css).toMatch(/\.accueil--visible:not\(\.accueil--deja\) \.accueil-commandes > \* \{ animation: accueil-monte /);
  });
});
