import { describe, expect, it } from 'vitest';
import type { LngLat } from '../../../../src/data/types';
import { byCca3, loadCountries, sample } from './helpers';

const all = loadCountries();
const lit = (cca3: string, p: LngLat) => sample(byCca3(all, cca3), p).r > 128;

// Frontières internationalement reconnues (décision de l'utilisateur, 02/10/2026) :
// Crimée → Ukraine ; Golan → Syrie ; Palestine dans les lignes de 1967 (Jérusalem-Est comprise) ;
// Sahara occidental et Cachemire (toutes parties) neutres.
describe('zones disputées', () => {
  it.each([
    ['Simferopol (Crimée)', [34.10, 44.95], 'UKR', 'RUS'],
    ['Golan', [35.75, 33.0], 'SYR', 'ISR'],
    ['Jérusalem-Est', [35.235, 31.78], 'PSE', 'ISR'],
  ] as const)('%s : allumé avec le bon pays, pas avec l’autre', (_, p, owner, other) => {
    expect(lit(owner, [p[0], p[1]])).toBe(true);
    expect(lit(other, [p[0], p[1]])).toBe(false);
  });

  it.each([
    ['Laâyoune (Sahara occidental)', [-13.20, 27.15], 'MAR'],
    ['Srinagar (Cachemire)', [74.80, 34.08], 'IND'],
    ['Leh (Ladakh)', [77.58, 34.16], 'IND'],
    ['Gilgit (Cachemire)', [74.31, 35.92], 'PAK'],
    ['Muzaffarabad (Azad Cachemire)', [73.47, 34.37], 'PAK'],
    ['Aksai Chin', [79.5, 35.2], 'CHN'],
  ] as const)('%s : neutre, éteint dans le pays qui l’administre', (_, p, cca3) => {
    expect(lit(cca3, [p[0], p[1]])).toBe(false);
  });

  it.each([
    ['Gaza', [34.45, 31.5], 'PSE'],
    ['Ramallah', [35.20, 31.90], 'PSE'],
    ['Kyiv', [30.52, 50.45], 'UKR'],
    ['Tel Aviv', [34.78, 32.08], 'ISR'],
    ['Damas', [36.29, 33.51], 'SYR'],
    ['Fès', [-5.00, 34.03], 'MAR'],
    ['New Delhi', [77.21, 28.61], 'IND'],
    ['Islamabad', [73.05, 33.68], 'PAK'],
  ] as const)('%s reste allumé avec son pays', (_, p, cca3) => {
    expect(lit(cca3, [p[0], p[1]])).toBe(true);
  });
});
