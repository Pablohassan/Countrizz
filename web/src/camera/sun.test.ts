import { describe, expect, it } from 'vitest';
import { sunDirection } from './sun';
import { dot, northUp, toVec, angleBetween, type Vec3 } from '../geo/vec';

const pose = (lngLat: [number, number], altitude: number) => {
  const dir = toVec(lngLat);
  return { dir, altitude, up: northUp(dir) };
};

describe('soleil placé par rapport à la caméra', () => {
  it('le point visé est toujours de jour, à 55° du soleil', () => {
    for (const p of [pose([2.35, 48.85], 0.22), pose([-70, -35], 1.4), pose([178, -17], 0.08)]) {
      expect(angleBetween(sunDirection(p), p.dir)).toBeCloseTo((55 * Math.PI) / 180, 9);
    }
  });

  it('en vue d’ensemble, le terminateur passe dans la partie visible du globe', () => {
    const p = pose([10, 20], 1.4);
    const sun = sunDirection(p);
    const camera: Vec3 = [p.dir[0] * 2.4, p.dir[1] * 2.4, p.dir[2] * 2.4];
    let day = 0, night = 0;
    for (let i = 0; i < 4000; i++) {
      const z = (i / 4000) * 2 - 1, a = i * 2.399963;
      const q: Vec3 = [Math.sqrt(1 - z * z) * Math.cos(a), z, Math.sqrt(1 - z * z) * Math.sin(a)];
      const visible = dot(q, camera) > 1; // en avant de l'horizon
      if (!visible) continue;
      if (dot(q, sun) > 0) day++; else night++;
    }
    expect(day).toBeGreaterThan(0);
    expect(night).toBeGreaterThan(0);
  });

  it('le soleil vient du haut à gauche de l’image', () => {
    const p = pose([2.35, 48.85], 0.22);
    const sun = sunDirection(p);
    const right: Vec3 = [p.up[1] * p.dir[2] - p.up[2] * p.dir[1], p.up[2] * p.dir[0] - p.up[0] * p.dir[2], p.up[0] * p.dir[1] - p.up[1] * p.dir[0]];
    expect(dot(sun, p.up)).toBeGreaterThan(0);
    expect(dot(sun, right)).toBeLessThan(0);
  });
});
