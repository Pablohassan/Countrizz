import { describe, expect, it } from 'vitest';
import { insertScore, openScoreBook, TOP, type KeyValueStorage, type ScoreEntry } from './scores';

const e = (name: string, score: number, at: number): ScoreEntry => ({ name, score, at });

function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
}

describe('top 10 par mode', () => {
  it('score décroissant, à égalité le plus ancien d\'abord ; rang de la nouvelle entrée', () => {
    const r = insertScore([e('Lina', 240, 1), e('Tom', 150, 2)], e('Zoé', 150, 3));
    expect(r.list.map((x) => x.name)).toEqual(['Lina', 'Tom', 'Zoé']);
    expect(r.rank).toBe(3);
  });
  it('au plus 10 ; hors du top : rang null', () => {
    const full = Array.from({ length: TOP }, (_, i) => e(`J${i}`, 100 + i, i));
    const r = insertScore(full, e('Bas', 10, 99));
    expect(r.list).toHaveLength(10);
    expect(r.rank).toBeNull();
  });
  it('« Nouveau record ! » : meilleur strictement battu ; égaler ne suffit pas ; première partie > 0 = record', () => {
    expect(insertScore([e('A', 160, 1)], e('B', 190, 2))).toMatchObject({ record: true, previousBest: 160 });
    expect(insertScore([e('A', 160, 1)], e('B', 160, 2)).record).toBe(false);
    expect(insertScore([], e('B', 30, 2))).toMatchObject({ record: true, previousBest: null });
    expect(insertScore([], e('B', 0, 2)).record).toBe(false);
  });
});

describe('carnet de scores sur l\'appareil', () => {
  it('écrit puis relit, un tableau par mode', () => {
    const s = memory();
    const book = openScoreBook(s);
    book.write('flag', [e('Lina', 240, 1)]);
    expect(openScoreBook(s).read('flag')).toEqual([e('Lina', 240, 1)]);
    expect(openScoreBook(s).read('capital')).toEqual([]);
    expect(book.persistent).toBe(true);
  });
  it('données abîmées ou étrangères : liste propre, jamais d\'exception', () => {
    const s = memory();
    s.data.set('countrizz:scores:flag', '{pas du json');
    s.data.set('countrizz:scores:country', JSON.stringify({ a: 1 }));
    s.data.set('countrizz:scores:capital', JSON.stringify([
      e('Ok', 50, 1), { name: 3, score: 'x' }, null, e('Nom bien trop long pour tenir', 40, 2),
      ...Array.from({ length: 12 }, (_, i) => e(`J${i}`, i, 10 + i)),
    ]));
    const book = openScoreBook(s);
    expect(book.read('flag')).toEqual([]);
    expect(book.read('country')).toEqual([]);
    const cap = book.read('capital');
    expect(cap).toHaveLength(10);
    expect(cap[0]).toEqual(e('Ok', 50, 1));
    expect(cap[1]!.name).toBe('Nom bien tro');
  });
  it('stockage indisponible (navigation privée, écriture refusée) : en mémoire le temps de la visite', () => {
    const refusing: KeyValueStorage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    const book = openScoreBook(refusing);
    expect(book.persistent).toBe(false);
    book.write('flag', [e('A', 10, 1)]);
    expect(book.read('flag')).toEqual([e('A', 10, 1)]);
    const none = openScoreBook(null);
    expect(none.persistent).toBe(false);
    none.write('country', [e('B', 20, 1)]);
    expect(none.read('country')).toEqual([e('B', 20, 1)]);
  });
});
