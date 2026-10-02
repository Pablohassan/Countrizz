import { describe, expect, it } from 'vitest';
import { rasterizeLandMask } from '../../lib/landMask';

const W = 360, H = 180; // 1 pixel = 1° ; le pixel (x, y) a pour centre (x − 179,5° ; 89,5° − y)
const at = (mask: Uint8Array, lng: number, lat: number) => mask[Math.floor(89.999 - lat) * W + Math.floor(lng + 180)];
const square = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

describe('masque terre/mer équirectangulaire', () => {
  it('remplit un polygone, pas la mer autour', () => {
    const m = rasterizeLandMask([[square(0, 0, 10, 10)]], W, H);
    expect(at(m, 5.5, 5.5)).toBe(1);
    expect(at(m, 15.5, 5.5)).toBe(0);
    expect(at(m, 5.5, -5.5)).toBe(0);
  });
  it('respecte un trou (lac, enclave) en pair-impair', () => {
    const m = rasterizeLandMask([[square(0, 0, 10, 10), square(3, 3, 7, 7)]], W, H);
    expect(at(m, 5.5, 5.5)).toBe(0);
    expect(at(m, 1.5, 1.5)).toBe(1);
  });
  it('deux polygones qui se recouvrent restent de la terre (OU, pas pair-impair entre polygones)', () => {
    const m = rasterizeLandMask([[square(0, 0, 10, 10)], [square(5, 5, 15, 15)]], W, H);
    expect(at(m, 7.5, 7.5)).toBe(1);
  });
  it('va jusqu’aux bords ±180° (polygones coupés à l’antiméridien)', () => {
    const m = rasterizeLandMask([[square(170, -20, 180, -10)], [square(-180, -20, -170, -10)]], W, H);
    expect(at(m, 179.5, -15.5)).toBe(1);
    expect(at(m, -179.5, -15.5)).toBe(1);
  });
});
