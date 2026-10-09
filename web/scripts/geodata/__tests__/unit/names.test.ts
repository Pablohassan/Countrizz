import { describe, expect, it } from 'vitest';
import { nameOf } from '../../lib/names';

const cod = { cca3: 'COD', name: { common: 'DR Congo' }, translations: { fra: { common: 'Congo (Rép. dém.)', official: '' } } };
const fra = { cca3: 'FRA', name: { common: 'France' }, translations: { fra: { common: 'France', official: '' } } };

describe('nameOf', () => {
  it('FR de mledoze, EN mledoze tel quel', () => {
    expect(nameOf(fra, {})).toEqual({ fr: 'France', en: 'France' });
  });
  it('FR raccourci par overrides.names.fr, EN inchangé', () => {
    expect(nameOf(cod, { COD: 'RD Congo' })).toEqual({ fr: 'RD Congo', en: 'DR Congo' });
  });
  it('sans traduction française ni arbitrage : erreur qui nomme la clé', () => {
    expect(() => nameOf({ cca3: 'XXX', name: { common: 'X' }, translations: {} }, {})).toThrow(/overrides\.names\.fr\.XXX/);
  });
});
