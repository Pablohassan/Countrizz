import { describe, expect, it } from 'vitest';
import { createDprGovernor } from './dynamicResolution';

const o = { min: 0.75, max: 2, step: 0.25, slowMs: 22, fastMs: 14, window: 30 };
const run = (g: ReturnType<typeof createDprGovernor>, frameMs: number, frames: number) => {
  let dpr = g.dpr;
  for (let i = 0; i < frames; i++) dpr = g.update(frameMs);
  return dpr;
};

describe('résolution dynamique (spec §4.1, niveau standard)', () => {
  it('commence au maximum et ne bouge pas avant une fenêtre complète', () => {
    const g = createDprGovernor(o);
    expect(g.dpr).toBe(2);
    expect(run(g, 40, 29)).toBe(2);
  });
  it('frames lentes : un pas par fenêtre, jusqu’au minimum', () => {
    const g = createDprGovernor(o);
    expect(run(g, 40, 30)).toBe(1.75);
    expect(run(g, 40, 30 * 10)).toBe(0.75);
  });
  it('frames rapides : remonte jusqu’au maximum', () => {
    const g = createDprGovernor(o);
    run(g, 40, 30 * 10);
    expect(run(g, 8, 30 * 10)).toBe(2);
  });
  it('entre les deux seuils : ne bouge pas (pas d’oscillation)', () => {
    const g = createDprGovernor(o);
    run(g, 40, 60);
    expect(run(g, 18, 30 * 10)).toBe(1.5);
  });
  it('une frame aberrante (onglet revenu, compilation) ne fait pas tout chuter', () => {
    const g = createDprGovernor(o);
    g.update(2000);
    expect(run(g, 10, 29)).toBe(2);
  });
});
