import { describe, expect, it } from 'vitest';
import { polarFill } from '../../lib/polarFill';

// grille de 1 × 180 pixels : la ligne y a pour latitude 89,5° − y
const H = 180;
const column = (rgb: number[]) => new Uint8Array(Array.from({ length: H }, () => rgb).flat());
const at = (img: Uint8Array, lat: number) => [...img.subarray(Math.floor(89.5 - lat) * 3, Math.floor(89.5 - lat) * 3 + 3)];

describe('glaces polaires : le blanc plat de Sentinel-2 cède la place à Blue Marble', () => {
  const bm = column([180, 190, 200]);
  it('au-delà de 62°, un blanc plat prend la glace de Blue Marble', () => {
    const out = polarFill(column([255, 255, 255]), bm, 1, H);
    expect(at(out, 75.5)).toEqual([180, 190, 200]);
    expect(at(out, -80.5)).toEqual([180, 190, 200]);
  });
  it('sous 58°, la neige reste celle de Sentinel-2 (Alpes, Himalaya)', () => {
    expect(at(polarFill(column([255, 255, 255]), bm, 1, H), 45.5)).toEqual([255, 255, 255]);
  });
  it('une terre colorée près du pôle reste celle de Sentinel-2', () => {
    expect(at(polarFill(column([90, 80, 60]), bm, 1, H), 75.5)).toEqual([90, 80, 60]);
  });
  it('transition continue entre 58° et 62°', () => {
    const out = polarFill(column([255, 255, 255]), bm, 1, H);
    const r = at(out, 60.5)[0]!;
    expect(r).toBeGreaterThan(180);
    expect(r).toBeLessThan(255);
  });
});
