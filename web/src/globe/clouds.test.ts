import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { CLOUD_FADE_MS, CLOUD_RELIEF, CLOUD_TOP_MAX, cloudOpacity, henyeyGreenstein, parallaxShift, SILVER_LINING } from './clouds';
import { LIFT_MAX, RELIEF_LIFT } from './relief';
import { GlobeController } from './controller';
import type { Globe } from './globe';

describe('opacité des nuages (spec §4.2 : ils s’effacent à l’arrivée sur un pays)', () => {
  it('fondu lissé d’une valeur à l’autre, puis constant', () => {
    const f = { from: 1, to: 0, atMs: 1000 };
    expect(cloudOpacity(f, 1000)).toBe(1);
    expect(cloudOpacity(f, 1000 + CLOUD_FADE_MS / 2)).toBeCloseTo(0.5, 9);
    expect(cloudOpacity(f, 1000 + CLOUD_FADE_MS)).toBe(0);
    expect(cloudOpacity(f, 99_999)).toBe(0);
  });

  it('le contrôleur les efface à l’arrivée et les rend au vol suivant, sans saut', async () => {
    let now = 0;
    const fra = (JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[]).find((c) => c.cca3 === 'FRA')!;
    const c = new GlobeController('/', false, () => now);
    c.attach({ setPatch() {}, setBeacon() {}, setImageLevels() {} } as unknown as Globe);
    expect(c.cloudOpacityAt(now)).toBe(1);
    const flight = c.flyTo(fra);
    c.director.update(0);
    now = 10_000;
    c.director.update(now);
    await flight.arrived;
    expect(c.cloudOpacityAt(now)).toBe(1);
    expect(c.cloudOpacityAt(now + CLOUD_FADE_MS)).toBe(0);
    now += 2 * CLOUD_FADE_MS;
    void c.flyTo(fra);
    expect(c.cloudOpacityAt(now)).toBe(0);
    expect(c.cloudOpacityAt(now + CLOUD_FADE_MS)).toBe(1);
  });
});

describe('nuages en relief (spec nuages §3)', () => {
  it('sommet le plus haut : 16 km exagérés comme le relief, au-dessus de l’Everest soulevé', () => {
    expect(CLOUD_RELIEF.exaggeration).toBe(RELIEF_LIFT.exaggeration);
    expect(CLOUD_TOP_MAX).toBeCloseTo((10 * 16_000) / 6_371_000, 12);
    expect(CLOUD_TOP_MAX).toBeGreaterThan(LIFT_MAX);
  });
  it('parallaxe : nulle à la verticale, z · tan θ ensuite, bornée en visée rasante', () => {
    expect(parallaxShift(0.01, 1)).toBe(0);
    expect(parallaxShift(0.01, Math.cos(Math.PI / 4))).toBeCloseTo(0.01, 9);
    const max = parallaxShift(0.01, CLOUD_RELIEF.minCos);
    expect(parallaxShift(0.01, 0.05)).toBe(max);
    expect(parallaxShift(0.01, 0)).toBe(max);
    let prev = 0;
    for (let c = 1; c >= CLOUD_RELIEF.minCos; c -= 0.01) { const s = parallaxShift(0.01, c); expect(s).toBeGreaterThanOrEqual(prev); prev = s; }
  });
});

describe('liseré à contre-jour (spec atmosphère §2.5)', () => {
  it('Henyey-Greenstein : normalisée sur la sphère, maximale vers l’avant', () => {
    const { g } = SILVER_LINING;
    let integral = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) { const c = -1 + (2 * (i + 0.5)) / n; integral += henyeyGreenstein(g, c) * 2 * Math.PI * (2 / n); }
    expect(integral).toBeCloseTo(1, 4);
    expect(henyeyGreenstein(g, 1)).toBeGreaterThan(henyeyGreenstein(g, 0) * 10);
    expect(henyeyGreenstein(0, 0.3)).toBeCloseTo(1 / (4 * Math.PI), 12);
  });
});
