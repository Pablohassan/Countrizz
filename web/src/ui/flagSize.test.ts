import { describe, expect, it } from 'vitest';
import { FLAG_BOX, flagSize, SHAPED_FLAGS } from './flagSize';

const px = (r: number) => { const s = flagSize(r); return [Math.round(s.width), Math.round(s.height)]; };

describe('drapeaux à aire égale bornée (D3 · P1)', () => {
  it('zone utile 150 × 88, aire 7776 : les cinq formes de la maquette', () => {
    expect(FLAG_BOX).toEqual({ width: 150, height: 88, area: 7776 });
    expect(px(0.8203)).toEqual([72, 88]);   // Népal
    expect(px(1)).toEqual([88, 88]);        // Suisse
    expect(px(1.5)).toEqual([108, 72]);     // France
    expect(px(2)).toEqual([125, 62]);       // 2:1
    expect(px(2.5455)).toEqual([141, 55]);  // Qatar
  });

  it('jamais plus grand que la zone, proportions gardées', () => {
    for (const r of [0.5, 0.8203, 1, 1.25, 1.5, 1.9, 2.5455, 4]) {
      const s = flagSize(r);
      expect(s.width).toBeLessThanOrEqual(150 + 1e-9);
      expect(s.height).toBeLessThanOrEqual(88 + 1e-9);
      expect(s.width / s.height).toBeCloseTo(r, 9);
    }
  });

  it('seul le Népal suit sa forme (contour en drop-shadow)', () => {
    expect([...SHAPED_FLAGS]).toEqual(['NPL']);
  });
});
