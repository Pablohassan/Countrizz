import { readFileSync } from 'node:fs';
import type * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import type { ImageryIndex } from '../data/imagery';
import type { CountryRecord } from '../data/types';
import { GlobeController, IMAGE_FADE_S } from './controller';
import type { Globe } from './globe';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const by = (cca3: string) => countries.find((c) => c.cca3 === cca3)!;
const meta = (extentRad: number) => ({ center: [0, 0] as [number, number], extentRad, files: {} });
const index = { countries: { FRA: meta(0.5), JPN: meta(0.4), FJI: meta(0.3) } } as unknown as ImageryIndex;
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(load: (url: string) => Promise<THREE.Texture>) {
  const calls: [number | null, unknown, number | undefined][] = [];
  const globe = {
    setPatch() {}, setBeacon() {},
    setImagePatch(m: { extentRad: number } | null, t: unknown, fade?: number) { calls.push([m?.extentRad ?? null, t, fade]); },
  };
  const c = new GlobeController('/');
  c.attach(globe as unknown as Globe);
  const urls: string[] = [];
  c.setImagery(index, { size: 2048, load: (url) => { urls.push(url); return load(url); } });
  return { c, calls, urls };
}
const tex = (name: string, disposed: string[] = []) => ({ name, dispose: () => disposed.push(name) }) as unknown as THREE.Texture;

describe('patch image du pays visé (GlobeController)', () => {
  it('le vol demande le patch à la taille du niveau, puis le pose en fondu', async () => {
    const t = tex('fra');
    const { c, calls, urls } = setup(async () => t);
    void c.flyTo(by('FRA'));
    await flush();
    expect(urls).toEqual(['/data/patches/img/fra-2048.ktx2']);
    expect(calls.at(-1)).toEqual([0.5, t, IMAGE_FADE_S]);
  });

  it('patch en échec : retiré, et la manche continue (rien ne lève)', async () => {
    const { c, calls } = setup(async () => { throw new Error('404'); });
    void c.flyTo(by('FRA'));
    await flush();
    expect(calls.at(-1)).toEqual([null, null, IMAGE_FADE_S]);
  });

  it('pays absent de l’index (ou index absent) : aucune requête', async () => {
    const { c, urls, calls } = setup(async () => tex('x'));
    void c.flyTo(by('LUX'));
    await flush();
    expect(urls).toEqual([]);
    expect(calls.at(-1)![0]).toBeNull();
  });

  it('précharge le suivant ; ne garde que le courant et le suivant', async () => {
    const disposed: string[] = [];
    const { c, urls } = setup(async (url) => tex(url.split('/').pop()!.slice(0, 3), disposed));
    c.prefetch(by('JPN'));
    void c.flyTo(by('FRA'));
    await flush();
    expect(urls).toEqual(['/data/patches/img/jpn-2048.ktx2', '/data/patches/img/fra-2048.ktx2']);
    c.prefetch(by('FJI'));
    void c.flyTo(by('JPN'));
    await flush();
    expect(disposed).toEqual(['fra']);
  });
});

describe('ticket de vol (GlobeController)', () => {
  it('clear() pendant le vol : l’arrivée ne compte pas', async () => {
    const { c } = setup(async () => tex('x'));
    c.director.update(0);
    const t = c.flyTo(by('FRA'));
    c.clear();
    c.director.update(10_000);
    expect(await t.arrived).toBe(false);
  });

  it('perte du GPU pendant le vol (globe détaché puis rattaché) : l’arrivée compte', async () => {
    const { c } = setup(async () => tex('x'));
    c.director.update(0);
    const t = c.flyTo(by('FRA'));
    c.director.update(500);
    c.attach(null);
    c.attach({ setPatch() {}, setBeacon() {}, setImagePatch() {} } as unknown as Globe);
    c.director.update(10_000);
    expect(await t.arrived).toBe(true);
  });
});

describe('rappels à chaque image (GlobeController.onFrame)', () => {
  it('appelle chaque abonné après la pose, même si l’un d’eux lève ; se désinscrit', () => {
    const c = new GlobeController('/');
    const calls: string[] = [];
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((e) => { errors.push(e); });
    c.onFrame(() => { throw new Error('calque cassé'); });
    const off = c.onFrame(() => calls.push(c.project([2.35, 30]) ? 'ok' : 'vide'));
    expect(c.project([2.35, 30])).toBeNull();          // avant la première image
    c.notePose(c.director.update(0));
    expect(calls).toEqual(['ok']);
    expect(errors).toHaveLength(1);
    off();
    c.notePose(c.director.update(16));
    expect(calls).toEqual(['ok']);
    spy.mockRestore();
  });
});

describe('registre des accessoires (GlobeController)', () => {
  it('mount ajoute, le retour retire, les abonnés sont prévenus', () => {
    const c = new GlobeController('/');
    const a = { create: () => { throw new Error('non appelé ici'); } };
    let changes = 0;
    c.onAccessories(() => changes++);
    const off = c.mount(a);
    expect(c.accessories()).toEqual([a]);
    off();
    off();
    expect(c.accessories()).toEqual([]);
    expect(changes).toBe(2);
  });
});
