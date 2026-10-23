import { describe, expect, it } from 'vitest';
import { createDprGovernor, DPR_RANGE, dprOptions } from './dynamicResolution';

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
  it('compte les fenêtres consécutives au plancher et encore lentes, remet à zéro dès qu’une ne l’est plus', () => {
    const g = createDprGovernor(o);
    run(g, 40, 30 * 5);                 // 2 → 0,75 en cinq fenêtres
    expect(g.dpr).toBe(0.75);
    expect(g.slowWindowsAtFloor).toBe(0);
    run(g, 40, 30 * 3);
    expect(g.slowWindowsAtFloor).toBe(3);
    expect(g.lastMedianMs).toBe(40);
    run(g, 18, 30);                      // sous le seuil lent : la série s'arrête
    expect(g.slowWindowsAtFloor).toBe(0);
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

describe('bornes de la densité (flou sur téléphone, 21/10 ; plafond 2,5 et 60 images/s, choix de l’utilisateur du 23/10)', () => {
  it('plafond à la densité de l’écran, jusqu’à 2,5 : un téléphone de densité 3 ne dessine plus que 69 % de ses pixels', () => {
    expect(dprOptions(3).max).toBe(2.5);
    expect(dprOptions(2.625).max).toBe(2.5);
    expect(dprOptions(2).max).toBe(2);
    expect(dprOptions(4).max).toBe(2.5);
    expect(DPR_RANGE).toEqual([1, 2.5]);
  });
  it('plancher à 1,25 (0,75 grossissait l’image quatre fois sur un téléphone), jamais sous la densité d’un écran de densité 1', () => {
    expect(dprOptions(3).min).toBe(1.25);
    expect(dprOptions(2).min).toBe(1.25);
    expect(dprOptions(1).min).toBe(1);
    expect(dprOptions(1).max).toBe(1);
    expect(dprOptions(0.5)).toMatchObject({ min: 1, max: 1 });
  });
  it('vise 60 images/s : 50 images/s (20 ms) font baisser la densité, la cadence d’un écran à 60 Hz non', () => {
    const slow = createDprGovernor(dprOptions(3));
    expect(run(slow, 20, 30)).toBe(2.25);
    const smooth = createDprGovernor(dprOptions(3));
    expect(run(smooth, 1000 / 60, 30 * 10)).toBe(2.5);
  });
});
