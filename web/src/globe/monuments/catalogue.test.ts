import { describe, expect, it } from 'vitest';
import { MAQUETTES } from './catalogue';
import lieux from './lieux.json';
import { construire, LARGEUR, triangles } from './papier';

/** Volume orienté : positif et non nul seulement si les faces regardent dehors. */
const volume = (ts: ReturnType<typeof triangles>) => ts.reduce((s, [a, b, c]) => s + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0);

describe('maquettes du pilote', () => {
  it('les dix pays demandés, chacun avec un élément retenu dans lieux.json', () => {
    expect(Object.keys(MAQUETTES).sort()).toEqual(['BRA', 'CHN', 'EGY', 'FRA', 'GBR', 'IND', 'ITA', 'JPN', 'RUS', 'USA']);
    for (const k of Object.keys(MAQUETTES)) expect((lieux as Record<string, { coord: unknown }>)[k]?.coord).toBeTruthy();
  });

  for (const [cca3, f] of Object.entries(MAQUETTES)) {
    it(`${cca3} : pièces pleines tournées vers l'extérieur, encombrement 1, légère`, () => {
      for (const p of f()) expect(volume(triangles(p))).toBeGreaterThan(0);
      const m = construire(f());
      const axe = (j: number) => { const v = Array.from(m.positions).filter((_, i) => i % 3 === j); return Math.max(...v) - Math.min(...v); };
      expect(Math.max(axe(1), LARGEUR * Math.max(axe(0), axe(2)))).toBeCloseTo(1, 5);
      expect(m.couleurs.length).toBeLessThan(3000);
    });
  }
});
