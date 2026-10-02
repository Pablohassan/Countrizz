import { describe, expect, it } from 'vitest';
import { selectPlayable, type MledozeCountry } from '../../lib/playable';

const c = (cca3: string, unMember: boolean): MledozeCountry => ({
  cca2: cca3.slice(0, 2),
  cca3,
  unMember,
  name: { common: cca3 },
  translations: { fra: { common: cca3, official: cca3 } },
  capital: [],
  region: 'Europe',
  subregion: 'Western Europe',
  borders: [],
  area: 1,
  latlng: [0, 0],
});

describe('selectPlayable', () => {
  const all = [c('FRA', true), c('GRL', false), c('PSE', false), c('VAT', true), c('UNK', false), c('PRI', false)];

  it('garde les membres ONU et les ajouts explicites, trié par cca3', () => {
    expect(selectPlayable(all, ['PSE', 'UNK']).map((x) => x.cca3)).toEqual(['FRA', 'PSE', 'UNK', 'VAT']);
  });

  it('exclut les territoires non listés', () => {
    const codes = selectPlayable(all, ['PSE']).map((x) => x.cca3);
    expect(codes).not.toContain('GRL');
    expect(codes).not.toContain('PRI');
  });
});
