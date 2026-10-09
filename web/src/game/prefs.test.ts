import { describe, expect, it } from 'vitest';
import { NAME_MAX, normalizeName, PREF_KEYS, readPref, writePref } from './prefs';

describe('nom du joueur', () => {
  it('12 caractères au plus, espaces nettoyés, nom par défaut si vide', () => {
    expect(NAME_MAX).toBe(12);
    expect(normalizeName('  Lina  ', 'Globetrotteur')).toBe('Lina');
    expect(normalizeName('Jean   Pierre', 'X')).toBe('Jean Pierre');
    expect(normalizeName('Maximilienne-Augustine', 'X')).toBe('Maximilienne');
    expect(normalizeName('   ', 'Globetrotteur')).toBe('Globetrotteur');
  });
  it('coupé par caractère visible : un émoji n\'est jamais coupé en deux', () => {
    const name = normalizeName('🌍🌍🌍🌍🌍🌍🌍🌍🌍🌍🌍🌍🌍', 'X');
    expect(Array.from(name)).toHaveLength(12);
    expect(name).toBe('🌍'.repeat(12));
    expect(normalizeName('Zoé👍🏽abcdefghij', 'X')).toBe('Zoé👍🏽abcdefgh');
  });
});

describe('préférences', () => {
  it('lecture et écriture ; stockage absent ou qui lève : null / false, jamais d\'exception', () => {
    const data = new Map<string, string>();
    const s = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
    expect(writePref(s, PREF_KEYS.lang, 'en')).toBe(true);
    expect(readPref(s, PREF_KEYS.lang)).toBe('en');
    const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); }, removeItem: () => {} };
    expect(readPref(broken, PREF_KEYS.name)).toBeNull();
    expect(writePref(broken, PREF_KEYS.name, 'A')).toBe(false);
    expect(readPref(null, PREF_KEYS.name)).toBeNull();
  });
});
