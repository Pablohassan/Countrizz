import { describe, expect, it } from 'vitest';
import { seaFill } from '../../lib/seaFill';

describe('mer de Blue Marble', () => {
  const day = new Uint8Array([10, 20, 30, 10, 20, 30, 10, 20, 30]);
  const bm = new Uint8Array([200, 100, 0, 200, 100, 0, 200, 100, 0]);
  it('la mer prend Blue Marble, la terre garde Sentinel-2, la côte se mêle', () => {
    const out = seaFill(day, bm, new Uint8Array([255, 0, 128]));
    expect([...out.subarray(0, 3)]).toEqual([200, 100, 0]);
    expect([...out.subarray(3, 6)]).toEqual([10, 20, 30]);
    expect([...out.subarray(6, 9)]).toEqual([105, 60, 15]);
  });
});
