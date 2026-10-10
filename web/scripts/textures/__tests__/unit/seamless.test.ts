import { describe, expect, it } from 'vitest';
import { seamless } from '../../lib/seamless';

/** Une image dont les bords gauche et droit ne se raccordent pas : une rampe 0 → 250 sur chaque ligne. */
function rampe(w: number, h: number): Buffer {
  const b = Buffer.alloc(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b[y * w + x] = Math.round((x / (w - 1)) * 250);
  return b;
}

describe('raccord des nuages au 180ᵉ méridien', () => {
  it('rend le passage du dernier au premier pixel aussi doux qu’entre deux voisins', () => {
    const w = 400, h = 3, B = 20, img = rampe(w, h);
    expect(Math.abs(img[w - 1]! - img[0]!)).toBe(250);   // la cassure avant
    const out = seamless(img, w, h, B);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let maxStep = 0;
      for (let x = 0; x < w; x++) maxStep = Math.max(maxStep, Math.abs(out[row + ((x + 1) % w)]! - out[row + x]!));
      // 250 étalés sur 2·B = 40 colonnes, lissage cubique : pente maximale 1,5 × 250 / 40 ≈ 9,4, au raccord même
      expect(Math.abs(out[row + w - 1]! - out[row]!)).toBeLessThanOrEqual(10);
      expect(maxStep).toBeLessThanOrEqual(10);
    }
  });

  it('ne touche à rien hors de la bande', () => {
    const w = 400, h = 2, B = 20, img = rampe(w, h), out = seamless(img, w, h, B);
    for (let x = B; x < w - B; x++) expect(out[x]).toBe(img[x]);
  });
});
