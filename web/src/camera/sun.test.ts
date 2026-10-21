import { describe, expect, it } from 'vitest';
import { SUN_ANGLE, sunAngleDeg, sunDirection } from './sun';
import { dot, northUp, toVec, angleBetween, type Vec3 } from '../geo/vec';
import { FRAMING } from './config';
import { HOME } from './home';

const pose = (lngLat: [number, number], altitude: number) => {
  const dir = toVec(lngLat);
  return { dir, altitude, up: northUp(dir) };
};

describe('soleil placé par rapport à la caméra', () => {
  it('le point visé est toujours de jour, à l’angle voulu pour son altitude', () => {
    for (const p of [pose([2.35, 48.85], 0.22), pose([-70, -35], 1.4), pose([178, -17], 0.08), pose([10, 20], 4)]) {
      expect(angleBetween(sunDirection(p), p.dir)).toBeCloseTo((sunAngleDeg(p.altitude) * Math.PI) / 180, 9);
    }
  });

  it('soleil haut au cadrage d’un pays (35°), plus rasant en vue d’ensemble (55°), passage progressif', () => {
    expect(sunAngleDeg(0.004)).toBe(SUN_ANGLE.country);
    expect(sunAngleDeg(SUN_ANGLE.from)).toBe(35);
    expect(sunAngleDeg(SUN_ANGLE.to)).toBe(55);
    expect(sunAngleDeg(10)).toBe(55);
    let prev = 0;
    for (let a = 0; a <= 4; a += 0.05) { const d = sunAngleDeg(a); expect(d).toBeGreaterThanOrEqual(prev); prev = d; }
  });

  it('altitudes réelles du jeu : 55° en vue d’ensemble (paysage, portrait) et à l’accueil, 35° au cadrage d’un pays médian', () => {
    // les bornes du passage ne se règlent pas seules : vue d'ensemble à 1,4 / 2,2 et accueil à 1,6 restaient sous 55° (21/10)
    for (const a of [FRAMING.overview.landscape, FRAMING.overview.portrait, HOME.altitude]) expect(sunAngleDeg(a)).toBe(55);
    // médianes des altitudes d'arrivée des 197 pays (arrivalAltitude, 21/10) : bureau 1440 × 900 0,234, téléphone 390 × 844 0,484
    for (const a of [0.234, 0.484]) expect(sunAngleDeg(a)).toBe(35);
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
