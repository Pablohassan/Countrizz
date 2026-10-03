import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { CLOUD_FADE_MS, cloudOpacity } from './clouds';
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
    c.attach({ setPatch() {}, setBeacon() {}, setImagePatch() {} } as unknown as Globe);
    expect(c.cloudOpacityAt(now)).toBe(1);
    const flight = c.flyTo(fra);
    c.director.update(0);
    now = 10_000;
    c.director.update(now);
    await flight;
    expect(c.cloudOpacityAt(now)).toBe(1);
    expect(c.cloudOpacityAt(now + CLOUD_FADE_MS)).toBe(0);
    now += 2 * CLOUD_FADE_MS;
    void c.flyTo(fra);
    expect(c.cloudOpacityAt(now)).toBe(0);
    expect(c.cloudOpacityAt(now + CLOUD_FADE_MS)).toBe(1);
  });
});
