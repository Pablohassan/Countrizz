import { describe, expect, it } from 'vitest';
import { EOX } from '../../scripts/imagery/config';
import { eoxAttribution } from './credits';

describe('crédit de l’imagerie', () => {
  it('l’interface affiche l’attribution du pipeline, mot pour mot (spec §9)', () => {
    expect(eoxAttribution()).toBe(EOX.attribution);
  });
});
