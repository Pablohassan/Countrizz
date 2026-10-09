import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

const take = (seed: number, n: number) => { const r = createRng(seed); return Array.from({ length: n }, () => r.next()); };

describe('createRng (mulberry32)', () => {
  it('même graine, même suite', () => {
    expect(take(42, 50)).toEqual(take(42, 50));
  });
  it('graines différentes, suites différentes', () => {
    expect(take(42, 5)).not.toEqual(take(43, 5));
  });
  it('valeurs dans [0, 1)', () => {
    for (const v of take(7, 10_000)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('l\'état exposé permet de reprendre exactement la suite (réducteur pur)', () => {
    const a = createRng(1234);
    a.next(); a.next(); a.next();
    const b = createRng(a.state);
    expect([b.next(), b.next()]).toEqual([a.next(), a.next()]);
  });
});
