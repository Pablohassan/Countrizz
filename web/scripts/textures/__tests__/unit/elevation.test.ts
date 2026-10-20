import { describe, expect, it } from 'vitest';
import { encodeElevation } from '../../lib/elevation';

describe('altitude GEBCO_2026 codée sur 8 bits', () => {
  // 4 × 2 → 2 × 1 : chaque pixel de sortie moyenne un carré de 2 × 2
  const src = new Int16Array([1000, 3000, 8850, 9000, 2000, 2000, 8850, 8850]);
  it('moyenne de surface, puis 0 → maxM sur 0 → 255, écrêtée au-delà', () => {
    expect([...encodeElevation(src, 4, 2, 2, 1, 8850, new Uint8Array([1, 1]))]).toEqual([Math.round((2000 / 8850) * 255), 255]);
  });
  it('la mer vaut 0, et une profondeur négative ne fait pas descendre la côte sous 0', () => {
    expect([...encodeElevation(src, 4, 2, 2, 1, 8850, new Uint8Array([0, 1]))][0]).toBe(0);
    expect([...encodeElevation(new Int16Array([-4000, 1000, -4000, 1000]), 2, 2, 1, 1, 1000, new Uint8Array([1]))]).toEqual([Math.round(0.5 * 255)]);
  });
});
