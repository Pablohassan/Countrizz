import { describe, expect, it } from 'vitest';
import { makeProjector } from '../../scripts/geodata/lib/patch';
import { inFrame, patchUV, tangentFrame } from './patchFrame';
import { toVec } from '../geo/vec';

// Le miroir CPU du shader doit donner exactement le (u, v) du contrat, c'est-à-dire px/size et py/size de makeProjector.
const frames = [
  { name: 'France', center: [1.864664845934693, 46.59912566826888] as [number, number], extentRad: 0.1274035272001625 },
  { name: 'Fidji (antiméridien)', center: [178.99365421768584, -17.648547737653985] as [number, number], extentRad: 0.04686673105884556 },
  { name: 'Vatican', center: [12.452131618080582, 41.90320239981395] as [number, number], extentRad: 0.00034906585039886593 },
  { name: 'USA', center: [-96.1114029478092, 42.02130917542055] as [number, number], extentRad: 0.556378183096189 },
];

describe('projection du patch, miroir CPU du shader', () => {
  for (const fr of frames) {
    it(`patchUV = makeProjector / size — ${fr.name}`, () => {
      const size = 1024;
      const proj = makeProjector({ center: fr.center, extentRad: fr.extentRad, size });
      const f = tangentFrame(fr.center);
      const span = (fr.extentRad * 180) / Math.PI;
      for (let i = -4; i <= 4; i++) {
        for (let j = -4; j <= 4; j++) {
          const p: [number, number] = [fr.center[0] + (i / 4) * span, Math.max(-89, Math.min(89, fr.center[1] + (j / 4) * span))];
          const [px, py] = proj.toPixel(p);
          const [u, v] = patchUV(fr, f, toVec(p));
          expect(Math.abs(u - px / size), `u en ${p}`).toBeLessThan(1e-9);
          expect(Math.abs(v - py / size), `v en ${p}`).toBeLessThan(1e-9);
        }
      }
    });
  }

  it('le repère tangent est orthonormé, est vers les longitudes croissantes, nord vers le pôle', () => {
    const f = tangentFrame([30, 50]);
    const d = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    expect(d(f.center, f.east)).toBeCloseTo(0, 12);
    expect(d(f.center, f.north)).toBeCloseTo(0, 12);
    expect(d(f.east, f.north)).toBeCloseTo(0, 12);
    expect(d(f.east, toVec([31, 50]))).toBeGreaterThan(0);
    expect(f.north[1]).toBeGreaterThan(0);
  });

  it('hors cadre dès que u ou v sort de [0, 1]', () => {
    expect(inFrame([0, 1])).toBe(true);
    expect(inFrame([0.5, 1.0001])).toBe(false);
    expect(inFrame([-0.0001, 0.5])).toBe(false);
  });
});
