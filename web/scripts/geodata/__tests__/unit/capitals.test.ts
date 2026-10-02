import { describe, expect, it } from 'vitest';
import { capitalOfGame } from '../../lib/capitals';

const wd = { FRA: ['Paris'], ZAF: ['Pretoria', 'Le Cap', 'Bloemfontein'], XXX: [] as string[] };

describe('capitalOfGame', () => {
  it('une seule capitale : retenue', () => {
    expect(capitalOfGame('FRA', wd, {})).toEqual({ capital: 'Paris', capitals: ['Paris'] });
  });
  it('plusieurs capitales avec arbitrage : retenue, liste triée', () => {
    expect(capitalOfGame('ZAF', wd, { ZAF: 'Pretoria' })).toEqual({
      capital: 'Pretoria', capitals: ['Bloemfontein', 'Le Cap', 'Pretoria'],
    });
  });
  it('plusieurs capitales sans arbitrage : erreur explicite', () => {
    expect(() => capitalOfGame('ZAF', wd, {})).toThrow(/arbitrer dans overrides\.capitals\.ZAF/);
  });
  it('arbitrage absent de la liste Wikidata : erreur (faute de frappe)', () => {
    expect(() => capitalOfGame('ZAF', wd, { ZAF: 'Pretoria ' })).toThrow(/absente de la liste/);
  });
  it('aucune capitale : erreur explicite', () => {
    expect(() => capitalOfGame('XXX', wd, {})).toThrow(/Aucune capitale/);
  });
});
