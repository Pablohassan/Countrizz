import { describe, expect, it } from 'vitest';
import { detectLang, fill, messages, plural } from './index';

type Tree = { [k: string]: string | Tree };
const leaves = (t: Tree, path = ''): [string, string][] =>
  Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [[`${path}${k}`, v] as [string, string]] : leaves(v, `${path}${k}.`)));
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('catalogues', () => {
  const fr = leaves(messages.fr as unknown as Tree);
  const en = leaves(messages.en as unknown as Tree);
  it('mêmes clés en français et en anglais', () => {
    expect(en.map(([k]) => k)).toEqual(fr.map(([k]) => k));
  });
  it('aucune chaîne vide', () => {
    for (const [k, v] of [...fr, ...en]) expect(v.trim(), k).not.toBe('');
  });
  it('mêmes emplacements {…} dans les deux langues', () => {
    const enMap = new Map(en);
    for (const [k, v] of fr) expect(holes(enMap.get(k)!), k).toEqual(holes(v));
  });
  it('textes des maquettes validées', () => {
    expect(messages.fr.prompts).toEqual({ flag: 'Quel est son drapeau ?', country: 'Quel est ce pays ?', capital: 'Quelle est sa capitale ?' });
    expect(messages.fr.modes).toEqual({ flag: 'Drapeau', country: 'Pays', capital: 'Capitale' });
    expect(messages.fr.home.about).toBe('À propos');
    expect(messages.fr.errors.unsupportedHint).toBe('Countrizz a besoin de WebGPU ou de WebGL 2. Essaie avec un navigateur récent : Chrome, Edge, Firefox ou Safari à jour.');
  });
});

describe('pluriels', () => {
  it('français : 0 et 1 au singulier ; anglais : 1 seul au singulier', () => {
    const c = (lang: 'fr' | 'en', correct: number, total: number) => fill(plural(lang, correct, messages[lang].end.correctOf), { correct, total });
    expect(c('fr', 1, 1)).toBe('1 bonne réponse sur 1');
    expect(c('fr', 0, 3)).toBe('0 bonne réponse sur 3');
    expect(c('fr', 19, 24)).toBe('19 bonnes réponses sur 24');
    expect(c('en', 1, 1)).toBe('1 right answer out of 1');
    expect(c('en', 0, 3)).toBe('0 right answers out of 3');
    expect(fill(plural('fr', 1, messages.fr.hud.secondsLeft), { seconds: 1 })).toBe('1 seconde restante');
    expect(fill(plural('en', 7, messages.en.hud.secondsLeft), { seconds: 7 })).toBe('7 seconds left');
    expect([plural('fr', 0, messages.fr.end.points), plural('en', 0, messages.en.end.points), plural('en', 1, messages.en.end.points)]).toEqual(['point', 'points', 'point']);
  });
});

describe('fill', () => {
  it('remplit les emplacements, refuse un emplacement sans valeur', () => {
    expect(fill('Mode {mode} · {name}', { mode: 'Pays', name: 'Lina' })).toBe('Mode Pays · Lina');
    expect(() => fill('Ancien record : {score}', {})).toThrow(/score/);
  });
});

describe('detectLang', () => {
  it('le choix mémorisé d\'abord, s\'il est valide', () => {
    expect(detectLang('en', ['fr-FR'])).toBe('en');
    expect(detectLang('de', ['fr-FR'])).toBe('fr');
  });
  it('puis la langue du navigateur, variantes régionales et casse comprises', () => {
    expect(detectLang(null, ['fr-CA', 'en'])).toBe('fr');
    expect(detectLang(null, ['EN-us'])).toBe('en');
    expect(detectLang(null, ['de-DE', 'fr'])).toBe('fr');
  });
  it('ni français ni anglais, ou rien : anglais', () => {
    expect(detectLang(null, ['de-DE', 'es'])).toBe('en');
    expect(detectLang(null, [])).toBe('en');
  });
});
