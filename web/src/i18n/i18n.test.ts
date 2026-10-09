import { describe, expect, it } from 'vitest';
import { detectLang, fill, messages } from './index';

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
    expect(fill(messages.fr.end.correctOf, { correct: 19, total: 24 })).toBe('19 bonnes réponses sur 24');
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
