import { describe, expect, it } from 'vitest';
import { equirectSampler, seaColor } from '../../lib/seaColor';

describe('mer de Blue Marble dans les photos de pays', () => {
  // 4 × 2 : colonnes à −135°, −45°, 45°, 135° ; lignes à 45° N et 45° S
  const rgb = new Uint8Array([0, 0, 0, 100, 0, 0, 200, 0, 0, 40, 0, 0, 0, 10, 0, 0, 10, 0, 0, 10, 0, 0, 10, 0]);
  const at = equirectSampler(rgb, 4, 2);
  it('lit le centre d’un pixel tel quel, et raccorde l’antiméridien', () => {
    expect(at(-45, 45)).toEqual([100, 0, 0]);
    expect(at(180, 45)).toEqual([20, 0, 0]);        // entre la colonne 135° (40) et −135° (0)
    expect(at(-180, 45)).toEqual([20, 0, 0]);
  });
  it('terre : la photo ; mer : Blue Marble ; côte : mêlée', () => {
    expect(seaColor([10, 20, 30], [200, 100, 0], 1)).toEqual([10, 20, 30]);
    expect(seaColor([10, 20, 30], [200, 100, 0], 0)).toEqual([200, 100, 0]);
    expect(seaColor([10, 20, 30], [200, 100, 0], 0.5)).toEqual([105, 60, 15]);
  });
});
