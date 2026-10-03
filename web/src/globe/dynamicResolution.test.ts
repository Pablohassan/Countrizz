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
  it('écran à 60 Hz : l’intervalle entre images ne descend jamais sous 16,7 ms, et la densité remonte quand même', () => {
    // 03/10 (revue finale) : la remontée exigeait < 14 ms, impossible sous la synchro verticale à 60 Hz ; chaque
    // fenêtre lente (compilation, décodage d'un patch) coûtait un pas pour toujours.
    const g = createDprGovernor(o);
    run(g, 40, 30 * 10);
    expect(run(g, 1000 / 60, 30 * 40)).toBe(2);
  });
  it('un GPU qui ne tient pas la densité maximale : retentée de plus en plus rarement, sans oscillation', () => {
    const g = createDprGovernor(o);
    const frameMs = (dpr: number) => (dpr > 1.75 ? 25 : 1000 / 60); // lent à 2, à la cadence de l'écran à 1,75
    let changes = 0, at175 = 0;
    for (let w = 0; w < 200; w++) {
      const before = g.dpr;
      for (let f = 0; f < 30; f++) g.update(frameMs(g.dpr));
      if (g.dpr !== before) changes++;
      if (g.dpr === 1.75) at175++;
    }
    // ≈ 100 s simulées : retentée après 2, 4, 8, 16, 32, 64 s → une douzaine de changements (sans attente : 200)
    expect(changes).toBeLessThanOrEqual(16);
    expect(at175).toBeGreaterThanOrEqual(180);
  });
  it('entre la cadence de l’écran et le seuil lent : ne bouge pas', () => {
    const g = createDprGovernor(o);
    run(g, 1000 / 60, 30 * 4); // cadence de l'écran apprise : 16,7 ms
    run(g, 40, 60);
    expect(run(g, 20.5, 30 * 10)).toBe(1.5);
  });
  it('une frame aberrante (onglet revenu, compilation) ne fait pas tout chuter', () => {
    const g = createDprGovernor(o);
    g.update(2000);
    expect(run(g, 10, 29)).toBe(2);
  });
});
