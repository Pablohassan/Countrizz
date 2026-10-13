import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { isLongLabel, LONG_LABEL } from './answerLabel';

describe('libellés des réponses (D2)', () => {
  it('à partir de 20 caractères visibles : deux lignes, plus petit', () => {
    expect(LONG_LABEL).toBe(20);
    expect(isLongLabel('Saint-Vincent-et-les-Grenadines')).toBe(true);
    expect(isLongLabel('République centrafricaine')).toBe(true);
    expect(isLongLabel('Sri Jayawardenapura')).toBe(false); // 19 : la capitale la plus longue garde la taille normale
    expect(isLongLabel('a'.repeat(20))).toBe(true);
    expect(isLongLabel('a'.repeat(19))).toBe(false);
  });

  it('dans les données : 6 noms de pays longs en français, aucune capitale', () => {
    const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
    expect(countries.filter((c) => isLongLabel(c.name.fr))).toHaveLength(6);
    expect(countries.filter((c) => isLongLabel(c.capital.fr))).toHaveLength(0);
  });
});
