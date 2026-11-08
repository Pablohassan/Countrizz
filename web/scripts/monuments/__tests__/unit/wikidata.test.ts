import { describe, expect, it } from 'vitest';
import { claimIds, coordOf, yearOf } from '../../lib/wikidata';

const claim = (datavalue: { value: unknown }, rank = 'normal') => ({ rank, mainsnak: { snaktype: 'value', datavalue } });

describe('lecture des déclarations Wikidata', () => {
  it('année d\'une date, avant notre ère comprise', () => {
    expect(yearOf({ claims: { P571: [claim({ value: { time: '+1887-01-28T00:00:00Z' } })] } }, 'P571')).toBe(1887);
    expect(yearOf({ claims: { P571: [claim({ value: { time: '-2560-00-00T00:00:00Z' } })] } }, 'P571')).toBe(-2560);
    expect(yearOf({ claims: {} }, 'P571')).toBeNull();
  });

  it('la déclaration préférée passe avant les autres, les dépréciées sont ignorées', () => {
    const e = { claims: { P570: [claim({ value: { time: '+1900-00-00T00:00:00Z' } }, 'deprecated'), claim({ value: { time: '+1923-12-27T00:00:00Z' } }), claim({ value: { time: '+1924-00-00T00:00:00Z' } }, 'preferred')] } };
    expect(yearOf(e, 'P570')).toBe(1924);
  });

  it('coordonnées [longitude, latitude]', () => {
    expect(coordOf({ claims: { P625: [claim({ value: { latitude: 48.8584, longitude: 2.2945 } })] } })).toEqual([2.2945, 48.8584]);
    expect(coordOf({ claims: {} })).toBeNull();
  });

  it('identifiants cités par une propriété (architectes), sans les valeurs inconnues', () => {
    const e = { claims: { P84: [claim({ value: { id: 'Q20882' } }), { rank: 'normal', mainsnak: { snaktype: 'somevalue' } }] } };
    expect(claimIds(e, 'P84')).toEqual(['Q20882']);
  });
});
