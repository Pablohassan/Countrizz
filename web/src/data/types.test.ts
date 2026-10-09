import { describe, expectTypeOf, it } from 'vitest';
import type { CountryRecord, Libelle, LngLat } from './types';

describe('contrat CountryRecord', () => {
  it('expose la calotte, la balise et le patch en [lng, lat]', () => {
    expectTypeOf<CountryRecord['cap']['center']>().toEqualTypeOf<LngLat>();
    expectTypeOf<CountryRecord['beacon']>().toEqualTypeOf<LngLat>();
    expectTypeOf<CountryRecord['beaconClearanceKm']>().toEqualTypeOf<number>();
    expectTypeOf<CountryRecord['patch']['center']>().toEqualTypeOf<LngLat>();
    expectTypeOf<CountryRecord['outlineSource']>().toEqualTypeOf<'geoboundaries' | 'naturalearth'>();
    expectTypeOf<CountryRecord['name']>().toEqualTypeOf<Libelle>();
    expectTypeOf<CountryRecord['capital']>().toEqualTypeOf<Libelle>();
    expectTypeOf<CountryRecord['capitalLngLat']>().toEqualTypeOf<LngLat>();
  });
});
