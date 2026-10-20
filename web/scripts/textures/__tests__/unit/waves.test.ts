import { describe, expect, it } from 'vitest';
import { slopeAt, waveSet, waveTexture } from '../../lib/waves';

describe('pentes de vagues répétables', () => {
  const waves = waveSet(48);
  it('se raccordent bord à bord (période = côté de la texture)', () => {
    for (const [x, y] of [[0, 0], [3.5, 17], [100, 250]] as const) {
      const a = slopeAt(waves, x, y, 256), b = slopeAt(waves, x + 256, y - 256, 256);
      expect(b[0]).toBeCloseTo(a[0], 6);
      expect(b[1]).toBeCloseTo(a[1], 6);
    }
  });
  it('même graine, mêmes vagues ; pente moyenne nulle sur la texture', () => {
    expect(waveSet(48)).toEqual(waves);
    const { rg } = waveTexture(64, waves);
    let mx = 0, my = 0;
    for (let i = 0; i < rg.length; i += 2) { mx += rg[i]! - 127.5; my += rg[i + 1]! - 127.5; }
    expect(Math.abs(mx / (rg.length / 2))).toBeLessThan(2);
    expect(Math.abs(my / (rg.length / 2))).toBeLessThan(2);
  });
});
