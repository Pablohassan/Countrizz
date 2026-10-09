import { describe, expect, it } from 'vitest';
import { capitalOfGame } from '../../lib/capitals';

const wd = { FRA: ['Paris'], ZAF: ['Pretoria', 'Le Cap', 'Bloemfontein'], LKA: ['Sri Jayawardenapura', 'Colombo'], XXX: [] as string[] };
const ZAF = { fr: 'Pretoria', en: 'Pretoria' };

describe('capitalOfGame', () => {
  it('une capitale de chaque côté : retenue dans les deux langues', () => {
    expect(capitalOfGame('FRA', wd, ['Paris'], {})).toEqual({
      capital: { fr: 'Paris', en: 'Paris' }, capitals: { fr: ['Paris'], en: ['Paris'] },
    });
  });
  it('arbitrage { fr, en } : retenu, listes triées, EN ajouté à la liste mledoze', () => {
    expect(capitalOfGame('LKA', wd, ['Colombo'], { LKA: { fr: 'Sri Jayawardenapura', en: 'Sri Jayawardenepura Kotte' } })).toEqual({
      capital: { fr: 'Sri Jayawardenapura', en: 'Sri Jayawardenepura Kotte' },
      capitals: { fr: ['Colombo', 'Sri Jayawardenapura'], en: ['Colombo', 'Sri Jayawardenepura Kotte'] },
    });
  });
  it('plusieurs capitales françaises sans arbitrage : erreur explicite', () => {
    expect(() => capitalOfGame('ZAF', wd, ['Pretoria'], {})).toThrow(/arbitrer dans overrides\.capitals\.ZAF/);
  });
  it('plusieurs capitales anglaises sans arbitrage : erreur explicite', () => {
    expect(() => capitalOfGame('FRA', wd, ['Paris', 'Versailles'], {})).toThrow(/capitales anglaises.*overrides\.capitals\.FRA/);
  });
  it('arbitrage FR absent de la liste Wikidata : erreur (faute de frappe)', () => {
    expect(() => capitalOfGame('ZAF', wd, ['Pretoria'], { ZAF: { fr: 'Pretoria ', en: 'Pretoria' } })).toThrow(/absente de la liste/);
  });
  it('arbitrage incomplet (en vide) : erreur', () => {
    expect(() => capitalOfGame('ZAF', wd, ['Pretoria'], { ZAF: { fr: 'Pretoria', en: ' ' } })).toThrow(/incomplet/);
  });
  it('arbitrage avec espaces en tête ou en fin, en EN comme en FR : erreur', () => {
    expect(() => capitalOfGame('ZAF', wd, ['Pretoria'], { ZAF: { fr: 'Pretoria', en: 'Pretoria ' } })).toThrow(/overrides\.capitals\.ZAF/);
    expect(() => capitalOfGame('LKA', wd, ['Colombo'], { LKA: { fr: ' Sri Jayawardenapura', en: 'Kotte' } })).toThrow(/overrides\.capitals\.LKA/);
  });
  it('aucune capitale : erreur explicite', () => {
    expect(() => capitalOfGame('XXX', wd, [], {})).toThrow(/Aucune capitale/);
  });
  it('arbitrage ZAF : capitale de jeu Pretoria', () => {
    expect(capitalOfGame('ZAF', wd, ['Pretoria', 'Bloemfontein', 'Cape Town'], { ZAF }).capital).toEqual(ZAF);
  });
});
