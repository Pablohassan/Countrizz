import { describe, expect, it } from 'vitest';
import { createClock, isRunning, pauseClock, remainingMs, resumeClock, startClock } from './clock';

describe('chrono net', () => {
  it('ne tourne pas avant le départ', () => {
    const c = createClock(60_000);
    expect(remainingMs(c, 5_000)).toBe(60_000);
    expect(isRunning(c)).toBe(false);
  });
  it('décompte après le départ, jamais sous zéro', () => {
    const c = startClock(createClock(60_000), 1_000);
    expect(remainingMs(c, 11_000)).toBe(50_000);
    expect(remainingMs(c, 999_000)).toBe(0);
  });
  it('en pause pendant le vol : reprise exacte', () => {
    let c = startClock(createClock(60_000), 0);
    c = pauseClock(c, 'flight', 10_000);
    expect(remainingMs(c, 25_000)).toBe(50_000);
    c = resumeClock(c, 'flight', 25_000);
    expect(remainingMs(c, 30_000)).toBe(45_000);
  });
  it('démarré pendant un vol (premier vol pendant le 3-2-1) : attend la fin du vol', () => {
    let c = createClock(60_000, ['flight']);
    c = startClock(c, 4_000);
    expect(isRunning(c)).toBe(false);
    c = resumeClock(c, 'flight', 6_000);
    expect(remainingMs(c, 16_000)).toBe(50_000);
  });
  it('pauses qui se chevauchent : arrêté tant qu\'une cause reste (onglet caché pendant un vol)', () => {
    let c = startClock(createClock(60_000), 0);
    c = pauseClock(c, 'flight', 10_000);
    c = pauseClock(c, 'hidden', 12_000);
    c = resumeClock(c, 'flight', 14_000);      // le vol finit, l'onglet est encore caché
    expect(isRunning(c)).toBe(false);
    expect(remainingMs(c, 40_000)).toBe(50_000);
    c = resumeClock(c, 'hidden', 40_000);
    expect(remainingMs(c, 41_000)).toBe(49_000);
  });
  it('pause et reprise répétées : sans effet de bord', () => {
    let c = startClock(createClock(60_000), 0);
    c = pauseClock(c, 'reveal', 5_000);
    c = pauseClock(c, 'reveal', 6_000);
    c = resumeClock(c, 'reveal', 7_000);
    c = resumeClock(c, 'reveal', 8_000);
    expect(remainingMs(c, 9_000)).toBe(53_000);
  });
});
