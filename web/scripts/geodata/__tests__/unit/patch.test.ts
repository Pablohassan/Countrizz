import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import {
  buildPatch, makeProjector, patchExtentRad, rasterizePolygons, samplePatchPng, signedDistance,
} from '../../lib/patch';
import type { PatchMeta } from '../../../../src/data/types';

describe('projection du patch', () => {
  const f = { center: [0, 0] as [number, number], extentRad: (2 * Math.PI) / 180, size: 1024 };
  const p = makeProjector(f);
  it('le centre tombe au milieu', () => {
    const [x, y] = p.toPixel([0, 0]);
    expect(x).toBeCloseTo(512, 6);
    expect(y).toBeCloseTo(512, 6);
  });
  it('le nord est en haut', () => {
    expect(p.toPixel([0, 1])[1]).toBeLessThan(512);
  });
  it('aller-retour pixel ↔ lng/lat', () => {
    const [lng, lat] = p.toLngLat(...p.toPixel([0.7, -1.2]));
    expect(lng).toBeCloseTo(0.7, 6);
    expect(lat).toBeCloseTo(-1.2, 6);
  });
  it('demi-côté : 1,5 × rayon, plancher 0,02°', () => {
    expect(patchExtentRad(10, { extentFactor: 1.5, minExtentDeg: 0.02 })).toBeCloseTo((15 * Math.PI) / 180, 9);
    expect(patchExtentRad(0.001, { extentFactor: 1.5, minExtentDeg: 0.02 })).toBeCloseTo((0.02 * Math.PI) / 180, 9);
  });
});

describe('rastérisation et champ de distance', () => {
  const size = 64;
  const square: [number, number][][] = [[[16, 16], [48, 16], [48, 48], [16, 48], [16, 16]]];
  const mask = rasterizePolygons(square, size);
  const sd = signedDistance(mask, size);
  it('remplit le carré, pas l’extérieur', () => {
    expect(mask[32 * size + 32]).toBe(1);
    expect(mask[4 * size + 4]).toBe(0);
  });
  it('distance positive dedans, négative dehors, nulle au bord', () => {
    expect(sd[32 * size + 32]!).toBeGreaterThan(10);
    expect(sd[4 * size + 4]!).toBeLessThan(-10);
    expect(Math.abs(sd[32 * size + 16]!)).toBeLessThanOrEqual(0.5);
  });
  it('respecte un trou (enclave) en pair-impair', () => {
    const withHole: [number, number][][] = [...square, [[28, 28], [36, 28], [36, 36], [28, 36], [28, 28]]];
    expect(rasterizePolygons(withHole, size)[32 * size + 32]).toBe(0);
  });
});

describe('patch complet', () => {
  it('franchit l’antiméridien d’un seul tenant (fixture Fidji)', () => {
    const west = [[[178, -17], [180, -17], [180, -16], [178, -16], [178, -17]]];
    const east = [[[-180, -17], [-178, -17], [-178, -16], [-180, -16], [-180, -17]]];
    const frame = { center: [180, -16.5] as [number, number], extentRad: (3 * Math.PI) / 180, size: 256 };
    const { png, insidePixels } = buildPatch([west, east], [], frame, 32);
    const meta: PatchMeta = { sdf: '', size: 256, center: frame.center, extentRad: frame.extentRad, rangeTexels: 32 };
    const decoded = PNG.sync.read(png);
    expect(insidePixels).toBeGreaterThan(0);
    expect(samplePatchPng(decoded, meta, [179.99, -16.5])!.r).toBeGreaterThan(128);
    expect(samplePatchPng(decoded, meta, [-179.99, -16.5])!.r).toBeGreaterThan(128);
    expect(samplePatchPng(decoded, meta, [180, -18.5])!.r).toBeLessThan(128);
  });
});
