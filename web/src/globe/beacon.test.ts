import { describe, expect, it } from 'vitest';
import { needsBeacon, screenAreaPx } from './beacon';

const landscape = { width: 960, height: 600, fovYDeg: 50 };
const framing = { k: 1, margin: 1.6, floor: 0.0003, overview: { landscape: 1.4, portrait: 2.2 } };
const rec = (areaKm2: number, radiusDeg: number) => ({ areaKm2, cap: { center: [0, 0] as [number, number], radiusDeg } });

describe('balise des micro-États et des archipels', () => {
  it('surface à l’écran au centre de l’image', () => {
    // à 0,1 rayon, la hauteur de l'image couvre 2·tan 25° · 0,1 · 6371,0088 km = 594,2 km sur 600 px
    const kmPerPx = (2 * Math.tan((25 * Math.PI) / 180) * 0.1 * 6371.0088) / 600;
    expect(screenAreaPx(1000, 0.1, landscape)).toBeCloseTo(1000 / kmPerPx ** 2, 9);
  });
  it('Tuvalu (26 km² sur une calotte de 4,1°) a sa balise, la France non', () => {
    expect(needsBeacon(rec(26, 4.1), landscape, framing)).toBe(true);
    expect(needsBeacon(rec(551695, 4.87), landscape, framing)).toBe(false);
  });
  it('un pays cadré au plancher a sa balise', () => {
    expect(needsBeacon(rec(0.49, 0.001), landscape, framing)).toBe(true);
  });
});
