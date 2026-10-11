import { describe, expect, it } from 'vitest';
import { createProgress } from './loading';

describe('progression du chargement du globe (D15)', () => {
  it('moyenne des fractions, sans recul, 1 quand tout est fini', () => {
    const seen: number[] = [];
    const p = createProgress(4, (x) => seen.push(x));
    p.update(0, 0.5);
    p.update(0, 0.2);          // un recul d'un fichier est ignoré
    p.update(1, 1);
    p.update(2, 1); p.update(3, 1); p.update(0, 1);
    expect(seen).toEqual([0.125, 0.375, 0.625, 0.875, 1]);
  });

  it('fraction hors bornes ou non finie : bornée, sans NaN', () => {
    const seen: number[] = [];
    const p = createProgress(2, (x) => seen.push(x));
    p.update(0, Number.NaN);
    p.update(0, 7);
    p.update(5, 1);            // fichier inconnu : ignoré
    expect(seen).toEqual([0.5]);
  });
});
