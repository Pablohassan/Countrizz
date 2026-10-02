import { describe, expect, it } from 'vitest';
import { planFlight, type Pose } from './flight';
import { angleBetween, northUp, toVec, type Vec3 } from '../geo/vec';

const deg = Math.PI / 180;
const params = { alphaRad: 25 * deg, rho: Math.SQRT2, timeScale: 1, minMs: 1500, maxMs: 3500 };
const pose = (lngLat: [number, number], altitude: number): Pose => {
  const dir = toVec(lngLat);
  return { dir, altitude, up: northUp(dir) };
};
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sample = (f: ReturnType<typeof planFlight>, n = 2000) => Array.from({ length: n + 1 }, (_, i) => f.at(i / n));

describe('vol de van Wijk sur la sphère', () => {
  const paris = pose([2.35, 48.85], 0.22), tokyo = pose([139.7, 35.7], 0.39);
  const f = planFlight(paris, tokyo, params);

  it('part de la pose de départ et arrive exactement sur la cible', () => {
    const [a, b] = [f.at(0), f.at(1)];
    expect(angleBetween(a.dir, paris.dir)).toBeLessThan(1e-9);
    expect(a.altitude).toBeCloseTo(0.22, 9);
    expect(angleBetween(b.dir, tokyo.dir)).toBeLessThan(1e-9);
    expect(b.altitude).toBeCloseTo(0.39, 9);
    expect(angleBetween(b.up, tokyo.up)).toBeLessThan(1e-9);
  });

  it('monte puis redescend quand la distance est grande', () => {
    const top = Math.max(...sample(f).map((p) => p.altitude));
    expect(top).toBeGreaterThan(1);
  });

  it('reste continu : ni saut de direction ni saut d’altitude', () => {
    const s = sample(f);
    for (let i = 1; i < s.length; i++) {
      expect(angleBetween(s[i - 1]!.dir, s[i]!.dir)).toBeLessThan(0.5 * deg);
      expect(Math.abs(s[i]!.altitude - s[i - 1]!.altitude)).toBeLessThan(0.01);
    }
  });

  it('durée bornée à [1500 ; 3500] ms', () => {
    expect(f.durationMs).toBeGreaterThanOrEqual(1500);
    expect(f.durationMs).toBeLessThanOrEqual(3500);
    expect(planFlight(pose([6.1, 49.6], 0.02), pose([4.5, 50.6], 0.06), params).durationMs).toBeGreaterThanOrEqual(1500);
  });
});

describe('le haut de la caméra', () => {
  it('ne se retourne pas d’un coup en passant au-dessus du pôle', () => {
    // (−100°, 70°) → (80°, 70°) : le grand cercle passe par le pôle Nord
    const f = planFlight(pose([-100, 70], 0.9), pose([80, 70], 1.3), params);
    const s = sample(f);
    let worst = 0;
    for (let i = 1; i < s.length; i++) worst = Math.max(worst, angleBetween(s[i - 1]!.up, s[i]!.up));
    expect(worst).toBeLessThan(1 * deg);
    for (const p of s) expect(Math.abs(dot(p.up, p.dir))).toBeLessThan(1e-9);
    expect(angleBetween(f.at(1).up, northUp(toVec([80, 70])))).toBeLessThan(1e-9);
  });

  it('un vol sur place garde le nord en haut', () => {
    const a = pose([2.35, 48.85], 0.22);
    const f = planFlight(a, { ...a, altitude: 0.5 }, params);
    expect(angleBetween(f.at(0.5).up, a.up)).toBeLessThan(1e-9);
    expect(f.at(1).altitude).toBeCloseTo(0.5, 9);
  });
});

describe('mouvement réduit', () => {
  it('coupe : durée nulle, arrivée immédiate', () => {
    const f = planFlight(pose([0, 0], 0.5), pose([90, 0], 0.3), { ...params, reducedMotion: true });
    expect(f.durationMs).toBe(0);
    expect(angleBetween(f.at(0).dir, toVec([90, 0]))).toBeLessThan(1e-9);
  });
});
