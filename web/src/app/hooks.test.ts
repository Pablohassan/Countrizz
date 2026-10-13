import { describe, expect, it } from 'vitest';
import { E2E_FLAG, e2eOverrides, hooksEnabled, newSeed } from './hooks';

const stored = (v: string | null) => ({ getItem: (k: string) => (k === E2E_FLAG ? v : null), setItem() {}, removeItem() {} });

describe('crochets des e2e du jeu', () => {
  it('actifs en dev, ou avec le drapeau posé par Playwright ; jamais si le stockage lève', () => {
    expect(hooksEnabled(true, null)).toBe(true);
    expect(hooksEnabled(false, stored('1'))).toBe(true);
    expect(hooksEnabled(false, stored(null))).toBe(false);
    expect(hooksEnabled(false, null)).toBe(false);
    expect(hooksEnabled(false, { getItem() { throw new Error('bloqué'); }, setItem() {}, removeItem() {} })).toBe(false);
  });

  it('?partie= : durée nette entière de 1 000 à 60 000 ms ; ?graine= : entier positif ou nul', () => {
    expect(e2eOverrides('?partie=3000&graine=42')).toEqual({ gameMs: 3000, seed: 42 });
    expect(e2eOverrides('?graine=0')).toEqual({ seed: 0 });
    expect(e2eOverrides('')).toEqual({});
    expect(e2eOverrides('?partie=999&graine=-1')).toEqual({});
    expect(e2eOverrides('?partie=60001&graine=1.5')).toEqual({});
    expect(e2eOverrides('?partie=abc&graine=')).toEqual({});
  });

  it('graine : celle du crochet, sinon un entier aléatoire sur 32 bits', () => {
    expect(newSeed(7)).toBe(7);
    const s = newSeed();
    expect(Number.isInteger(s) && s >= 0 && s < 2 ** 32).toBe(true);
  });
});
