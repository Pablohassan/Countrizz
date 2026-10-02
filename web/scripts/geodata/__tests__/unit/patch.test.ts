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

/** Forme close du contrat de `PatchMeta` (src/data/types.ts), écrite sans d3 : c'est elle que le shader calcule. */
function closedForm(f: { center: [number, number]; extentRad: number; size: number }, [lng, lat]: [number, number]) {
  const r = Math.PI / 180;
  const phi0 = f.center[1] * r, phi = lat * r, dLambda = (lng - f.center[0]) * r;
  const cosC = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(dLambda);
  const c = Math.acos(Math.min(1, Math.max(-1, cosC)));
  const k = c < 1e-9 ? 1 : c / Math.sin(c);
  const x = k * Math.cos(phi) * Math.sin(dLambda);
  const y = -k * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(dLambda));
  return [(x / f.extentRad + 1) * (f.size / 2), (y / f.extentRad + 1) * (f.size / 2)];
}

describe('contrat de projection du patch (forme close de types.ts)', () => {
  it('valeur calculée à la main : centre (10°, 50°), point (20°, 60°)', () => {
    // c = 0,200711 rad, k = c / sin c = 1,006746 ; x = 0,087410 ; y (vers le sud) = −0,180678.
    const [px, py] = makeProjector({ center: [10, 50], extentRad: 0.25, size: 1000 }).toPixel([20, 60]);
    expect(px).toBeCloseTo(674.8196, 3);
    expect(py).toBeCloseTo(138.6444, 3);
  });

  const frames: { name: string; center: [number, number]; extentRad: number }[] = [
    { name: 'France', center: [2.5, 46.5], extentRad: 0.15 },
    { name: 'antiméridien (Fidji)', center: [180, -16.5], extentRad: 0.05 },
    { name: 'haute latitude', center: [0, 80], extentRad: 0.5 },
    { name: 'hémisphère sud, ouest', center: [-70, -35], extentRad: 0.4 },
  ];
  for (const fr of frames) {
    it(`makeProjector suit la forme close partout dans le cadre — ${fr.name}`, () => {
      const f = { ...fr, size: 1024 };
      const p = makeProjector(f);
      const spanDeg = (fr.extentRad * 180) / Math.PI;
      for (let i = -4; i <= 4; i++) {
        for (let j = -4; j <= 4; j++) {
          const pt: [number, number] = [fr.center[0] + (i / 4) * spanDeg, Math.max(-89, Math.min(89, fr.center[1] + (j / 4) * spanDeg))];
          const [ex, ey] = closedForm(f, pt);
          const [px, py] = p.toPixel(pt);
          expect(Math.abs(px - ex), `x en ${pt}`).toBeLessThan(1e-6);
          expect(Math.abs(py - ey), `y en ${pt}`).toBeLessThan(1e-6);
        }
      }
    });
  }

  it('hors cadre, le patch ne dit rien : pas d’extension du texel de bord', () => {
    // Un pays qui déborde du cadre (9 des 197 patchs, dont USA et Timor oriental) a R > 128 au bord.
    const everywhere = [[[[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]]];
    const frame = { center: [0, 0] as [number, number], extentRad: (1 * Math.PI) / 180, size: 64 };
    const decoded = PNG.sync.read(buildPatch(everywhere, [], frame, 8).png);
    const meta: PatchMeta = { sdf: '', size: 64, center: frame.center, extentRad: frame.extentRad, rangeTexels: 8 };
    expect(samplePatchPng(decoded, meta, [0.99, 0])!.r).toBeGreaterThan(128);
    expect(samplePatchPng(decoded, meta, [1.01, 0])).toBeNull();
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
