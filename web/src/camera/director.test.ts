import { describe, expect, it } from 'vitest';
import { CameraDirector } from './director';
import { frameAltitude } from './framing';
import { homePose } from './home';
import { safeViewport } from './safeArea';
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

  it('flyTo rend sa durée et se résout à true à l’arrivée, pas avant', async () => {
    const d = new CameraDirector(opts);
    d.update(0);
    const t = d.flyTo(japan);
    expect(t.durationMs).toBeGreaterThanOrEqual(1500);
    expect(t.durationMs).toBeLessThanOrEqual(3500);
    let done: boolean | null = null;
    void t.arrived.then((ok) => { done = ok; });
    d.update(t.durationMs - 1);
    await Promise.resolve();
    expect(done).toBeNull();
    d.update(t.durationMs);
    await t.arrived;
    expect(done).toBe(true);
    expect(angleBetween(d.update(5000).dir, toVec(japan.cap.center))).toBeLessThan(1e-9);
  });

  it('un vol remplacé se résout à false tout de suite ; le second repart de la pose courante, sans saut', async () => {
    const d = new CameraDirector(opts);
    d.update(0);
    const first = d.flyTo(japan);
    const before = d.update(800);
    const second = d.flyTo(france);
    const after = d.update(800);
    expect(angleBetween(before.dir, after.dir)).toBeLessThan(1e-9);
    expect(await first.arrived).toBe(false);
    d.update(10_000);
    expect(await second.arrived).toBe(true);
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

  it('après une rotation de l’écran, le pays visé est recadré par un vol court (spec §5 : α recalculé)', () => {
    const d = new CameraDirector(opts);
    d.update(0);
    void d.flyTo(france);
    d.update(10_000);
    d.setViewport({ width: 390, height: 844, fovYDeg: 50 });
    const start = d.update(10_000);
    expect(start.altitude).toBeLessThan(0.3); // pas de saut au changement
    // France (θ = 4,87°) en portrait 390×844, m = 1,2 : cos θ + sin θ / tan(12,1598°/1,2) − 1 = 0,471395
    expect(d.update(10_700).altitude).toBeCloseTo(0.471395, 5);
  });

  it('pendant un vol, le recadrage attend l’arrivée', () => {
    const d = new CameraDirector(opts);
    d.update(0);
    void d.flyTo(japan);
    d.update(1000);
    d.setViewport({ width: 390, height: 844, fovYDeg: 50 });
    d.update(10_000); // arrivée sur le cadrage paysage, puis recadrage
    // Japon (θ = 8,84°) en portrait : 0,847966
    expect(d.update(10_700).altitude).toBeCloseTo(0.847966, 5);
  });

  it('à l’accueil, la vue d’ensemble suit l’orientation (1,4 paysage, 2,2 portrait)', () => {
    const d = new CameraDirector(opts);
    expect(d.update(0).altitude).toBe(1.4);
    d.setViewport({ width: 390, height: 844, fovYDeg: 50 });
    expect(d.update(700).altitude).toBeCloseTo(2.2, 9);
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
    expect(flight.durationMs).toBe(0);
    await flight.arrived;
    expect(p.cut).toBe(true);
    expect(angleBetween(p.dir, toVec(japan.cap.center))).toBeLessThan(1e-9);
  });

  it('sans vue d’accueil, le tangage reste nul', () => {
    const d = new CameraDirector(opts);
    expect(d.update(0).pitch).toBe(0);
  });

  it('démarre sur la vue d’accueil quand on la demande : pose et tangage immédiats', () => {
    const phone = { width: 390, height: 844, fovYDeg: 50 };
    const d = new CameraDirector({ ...opts, viewport: phone, startAtHome: true });
    const p = d.update(0), h = homePose(phone);
    expect(angleBetween(p.dir, h.dir)).toBeLessThan(1e-9);
    expect(p.altitude).toBe(h.altitude);
    expect(p.pitch).toBeCloseTo(h.pitch, 12);
  });

  it('un vol vers un pays depuis l’accueil ramène le tangage à 0 sans saut', async () => {
    const phone = { width: 390, height: 844, fovYDeg: 50 };
    const d = new CameraDirector({ ...opts, viewport: phone, startAtHome: true });
    const h = homePose(phone).pitch;
    d.update(0);
    const flight = d.flyTo(france);
    expect(d.update(0).pitch).toBeCloseTo(h, 9);
    const mid = d.update(800).pitch;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(h);
    d.update(10_000);
    await flight.arrived;
    expect(d.update(10_000).pitch).toBe(0);
  });

  it('flyToHome rejoint la vue d’accueil et y reste au changement de viewport', async () => {
    const phone = { width: 390, height: 844, fovYDeg: 50 };
    const d = new CameraDirector({ ...opts, viewport: phone });
    d.update(0);
    void d.flyTo(france);
    d.update(10_000);
    const home = d.flyToHome();
    d.update(20_000);
    await home.arrived;
    const p = d.update(20_000), h = homePose(phone);
    expect(angleBetween(p.dir, h.dir)).toBeLessThan(1e-9);
    expect(p.altitude).toBeCloseTo(h.altitude, 9);
    expect(p.pitch).toBeCloseTo(h.pitch, 9);
    d.setViewport({ width: 1300, height: 750, fovYDeg: 50 });
    expect(d.update(21_000).altitude).toBeCloseTo(h.altitude, 9);
  });

  it('mouvement réduit : pas de rotation lente à l’accueil (spec 2A §5.7)', () => {
    const d = new CameraDirector({ ...opts, reducedMotion: true });
    d.update(0);
    d.setIdleSpin(6);
    expect(angleBetween(d.update(0).dir, d.update(5000).dir)).toBe(0);
  });

  it('au retour d’un onglet caché, la rotation ne saute pas de toute la durée d’absence', () => {
    const d = new CameraDirector(opts);
    d.update(0);
    d.setIdleSpin(6);
    const a = toLngLat(d.update(0).dir), b = toLngLat(d.update(50_000).dir);
    expect(Math.abs(b[0] - a[0])).toBeLessThan(1);   // 6°/s × 50 s = 300° (60° modulo le tour) sans plafond ; ≤ 0,6° avec
  });

  it('la rotation lente garde le tangage de l’accueil', () => {
    const phone = { width: 390, height: 844, fovYDeg: 50 };
    const d = new CameraDirector({ ...opts, viewport: phone, startAtHome: true });
    d.update(0);
    d.setIdleSpin(1.5);
    expect(d.update(4000).pitch).toBeCloseTo(homePose(phone).pitch, 12);
  });

  it('rotation lente au repos : la caméra glisse vers l’ouest, la Terre semble tourner vers l’est', () => {
    const d = new CameraDirector(opts);
    d.update(0);
    d.setIdleSpin(6);
    const a = toLngLat(d.update(0).dir);
    for (let ms = 20; ms < 1000; ms += 20) d.update(ms);   // des images de 20 ms (le pas est plafonné à 100 ms)
    const b = toLngLat(d.update(1000).dir);
    expect(b[0] - a[0]).toBeCloseTo(-6, 9);
    expect(b[1]).toBeCloseTo(a[1], 9);
  });

  it('mouvement réduit activé à chaud : la rotation s’arrête, puis reprend quand on le retire', () => {
    const d = new CameraDirector(opts);
    d.update(0);
    d.setIdleSpin(6);
    for (let ms = 20; ms <= 500; ms += 20) d.update(ms);
    d.setReducedMotion(true);
    const a = d.update(520).dir;
    for (let ms = 540; ms <= 1500; ms += 20) d.update(ms);
    expect(angleBetween(a, d.update(1500).dir)).toBe(0);
    d.setReducedMotion(false);
    for (let ms = 1520; ms <= 2500; ms += 20) d.update(ms);
    expect(angleBetween(a, d.update(2500).dir)).toBeGreaterThan(0.05);
  });

  it('mouvement réduit activé pendant un vol : le vol finit tel quel, le suivant coupe', async () => {
    const d = new CameraDirector(opts);
    d.update(0);
    const first = d.flyTo(japan);
    const a = d.update(800);
    d.setReducedMotion(true);
    const b = d.update(816);
    expect(angleBetween(a.dir, b.dir)).toBeLessThan(2 * Math.PI / 180);   // pas de saut vers l'arrivée
    d.update(10_000);
    expect(await first.arrived).toBe(true);
    expect(d.flyTo(france).durationMs).toBe(0);
  });

  it('zone libre au repos : altitude et axe rejoignent la zone par un vol court, sans saut', () => {
    const phone = { width: 390, height: 844, fovYDeg: 50 };
    const d = new CameraDirector({ ...opts, viewport: phone });
    d.update(0);
    void d.flyTo(france);
    d.update(10_000);
    const before = d.update(10_000);
    expect(before.axisY).toBe(0);
    const { zone, axisY } = safeViewport(phone, { top: 80, bottom: 300 });
    d.setViewport(zone, axisY);
    const start = d.update(10_000);
    expect(start.axisY).toBe(0);
    expect(start.altitude).toBe(before.altitude);
    const mid = d.update(10_200).axisY;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(axisY);
    const end = d.update(11_000);
    expect(end.axisY).toBeCloseTo(axisY, 12);
    expect(end.altitude).toBeCloseTo(frameAltitude(france.cap.radiusDeg, zone, opts.framing), 9);
  });

  it('zone libre posée pendant un vol : appliquée à l’arrivée, par le recadrage', async () => {
    const phone = { width: 390, height: 844, fovYDeg: 50 };
    const d = new CameraDirector({ ...opts, viewport: phone });
    d.update(0);
    const t = d.flyTo(japan);
    const a = d.update(800);
    const { zone, axisY } = safeViewport(phone, { top: 80, bottom: 300 });
    d.setViewport(zone, axisY);
    const b = d.update(800);
    expect(b.axisY).toBe(a.axisY);
    expect(angleBetween(a.dir, b.dir)).toBeLessThan(1e-12);
    d.update(10_000);
    expect(await t.arrived).toBe(true);
    expect(d.update(11_000).axisY).toBeCloseTo(axisY, 12);
  });

  it('un vol interpole l’axe vers la zone courante', () => {
    const phone = { width: 390, height: 844, fovYDeg: 50 };
    const d = new CameraDirector({ ...opts, viewport: phone });
    const { zone, axisY } = safeViewport(phone, { top: 80, bottom: 300 });
    d.update(0);
    d.setViewport(zone, axisY);
    d.update(2000);
    const t = d.flyTo(japan);
    expect(d.update(2000).axisY).toBeCloseTo(axisY, 12);
    d.update(2000 + t.durationMs);
    expect(d.update(2000 + t.durationMs).axisY).toBeCloseTo(axisY, 12);
  });
});
