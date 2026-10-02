import { describe, expect, it } from 'vitest';
import { CameraDirector } from './director';
import { angleBetween, toLngLat, toVec } from '../geo/vec';

const opts = {
  viewport: { width: 1300, height: 750, fovYDeg: 50 },
  framing: { k: 1, margin: 1.2, floor: 0.0005, overview: { landscape: 1.4, portrait: 2.2 } },
  flight: { rho: Math.SQRT2, timeScale: 1, minMs: 1500, maxMs: 3500 },
  reducedMotion: false,
  start: [2.35, 48.85] as [number, number],
};
const japan = { cap: { center: [137.5, 36.2] as [number, number], radiusDeg: 8.84 } };
const france = { cap: { center: [1.86, 46.6] as [number, number], radiusDeg: 4.87 } };

describe('CameraDirector', () => {
  it('démarre en vue d’ensemble au-dessus du point de départ', () => {
    const d = new CameraDirector(opts);
    const p = d.update(0);
    expect(p.altitude).toBe(1.4);
    expect(angleBetween(p.dir, toVec([2.35, 48.85]))).toBeLessThan(1e-9);
  });

  it('flyTo se résout à l’arrivée, pas avant', async () => {
    const d = new CameraDirector(opts);
    d.update(0);
    let done = false;
    const flight = d.flyTo(japan).then(() => { done = true; });
    d.update(100);
    await Promise.resolve();
    expect(done).toBe(false);
    d.update(100 + 3500);
    await flight;
    expect(done).toBe(true);
    expect(angleBetween(d.update(5000).dir, toVec(japan.cap.center))).toBeLessThan(1e-9);
  });

  it('un second flyTo repart de la pose courante, sans saut, et libère le premier', async () => {
    const d = new CameraDirector(opts);
    d.update(0);
    const first = d.flyTo(japan);
    d.update(800);
    const before = d.update(800);
    const second = d.flyTo(france);
    const after = d.update(800);
    expect(angleBetween(before.dir, after.dir)).toBeLessThan(1e-9);
    await first;
    d.update(10_000);
    await second;
  });

  it('le cadrage suit le viewport courant', () => {
    const d = new CameraDirector(opts);
    d.update(0);
    void d.flyTo(france);
    d.update(10_000);
    const desktopAlt = d.update(10_000).altitude;
    d.setViewport({ width: 390, height: 844, fovYDeg: 50 });
    void d.flyTo(france);
    d.update(30_000);
    expect(d.update(30_000).altitude).toBeGreaterThan(desktopAlt);
  });

  it('un changement de viewport pendant un vol ne fait pas sauter la caméra', () => {
    const d = new CameraDirector(opts);
    d.update(0);
    void d.flyTo(japan);
    const a = d.update(1000);
    d.setViewport({ width: 390, height: 844, fovYDeg: 50 });
    const b = d.update(1000);
    expect(angleBetween(a.dir, b.dir)).toBeLessThan(1e-12);
    expect(b.altitude).toBe(a.altitude);
  });

  it('setFraming change le cadrage des vols suivants', () => {
    const d = new CameraDirector(opts);
    d.update(0);
    void d.flyTo(france);
    d.update(10_000);
    const before = d.update(10_000).altitude;
    d.setFraming({ ...opts.framing, margin: 2.4 });
    void d.flyTo(france);
    d.update(30_000);
    expect(d.update(30_000).altitude).toBeGreaterThan(before);
  });

  it('mouvement réduit : coupe à la frame suivante, signalée', async () => {
    const d = new CameraDirector({ ...opts, reducedMotion: true });
    d.update(0);
    const flight = d.flyTo(japan);
    const p = d.update(16);
    await flight;
    expect(p.cut).toBe(true);
    expect(angleBetween(p.dir, toVec(japan.cap.center))).toBeLessThan(1e-9);
  });

  it('rotation lente au repos : la caméra glisse vers l’ouest, la Terre semble tourner vers l’est', () => {
    const d = new CameraDirector(opts);
    d.update(0);
    d.setIdleSpin(6);
    const a = toLngLat(d.update(0).dir), b = toLngLat(d.update(1000).dir);
    expect(b[0] - a[0]).toBeCloseTo(-6, 9);
    expect(b[1]).toBeCloseTo(a[1], 9);
  });
});
