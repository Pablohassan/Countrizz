import { describe, expect, it } from 'vitest';
import { angleBetween, northUp, slerp, toLngLat, toVec } from './vec';

const close = (a: readonly number[], b: readonly number[], digits = 9) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

describe('repère du globe (même convention que SphereGeometry + texture équirectangulaire)', () => {
  it('place les points cardinaux', () => {
    close(toVec([0, 0]), [1, 0, 0]);
    close(toVec([90, 0]), [0, 0, -1]);
    close(toVec([-90, 0]), [0, 0, 1]);
    close(toVec([180, 0]), [-1, 0, 0]);
    close(toVec([0, 90]), [0, 1, 0]);
  });
  it('aller-retour lng/lat, antiméridien compris', () => {
    for (const p of [[2.35, 48.85], [-179.5, -16], [179.5, 65], [0, -89]] as [number, number][]) close(toLngLat(toVec(p)), p);
  });
});

describe('angles et interpolation sphérique', () => {
  it('angle droit et très petit angle', () => {
    expect(angleBetween(toVec([0, 0]), toVec([90, 0]))).toBeCloseTo(Math.PI / 2, 12);
    // 1e-6° : acos perdrait tout, atan2(|a×b|, a·b) garde la précision
    expect(angleBetween(toVec([12.45, 41.9]), toVec([12.45 + 1e-6, 41.9])) / ((1e-6 * Math.PI) / 180)).toBeCloseTo(Math.cos((41.9 * Math.PI) / 180), 4);
  });
  it('slerp suit le grand cercle et franchit l’antiméridien par le court chemin', () => {
    close(toLngLat(slerp(toVec([0, 0]), toVec([90, 0]), 0.5)), [45, 0]);
    expect(Math.abs(toLngLat(slerp(toVec([179, 0]), toVec([-179, 0]), 0.5))[0])).toBeCloseTo(180, 9);
    close(slerp(toVec([10, 20]), toVec([30, 40]), 0), toVec([10, 20]));
    close(slerp(toVec([10, 20]), toVec([30, 40]), 1), toVec([30, 40]));
    close(slerp(toVec([10, 20]), toVec([10, 20]), 0.3), toVec([10, 20]));
  });
  it('le nord en haut est tangent et pointe vers le pôle', () => {
    const d = toVec([2.35, 48.85]);
    const u = northUp(d);
    expect(u[0] * d[0] + u[1] * d[1] + u[2] * d[2]).toBeCloseTo(0, 12);
    expect(u[1]).toBeGreaterThan(0);
    close(northUp(toVec([0, 0])), [0, 1, 0]);
  });
});
