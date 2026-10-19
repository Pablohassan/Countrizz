import { readFileSync } from 'node:fs';
import type * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import type { ImageryIndex } from '../data/imagery';
import type { CountryRecord } from '../data/types';
import { GlobeController, IMAGE_FADE_S } from './controller';
import type { Globe, ImageSlot } from './globe';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const by = (cca3: string) => countries.find((c) => c.cca3 === cca3)!;
const meta = (...extents: number[]) => ({ center: [0, 0] as [number, number], levels: extents.map((extentRad) => ({ extentRad, files: {} })) });
const index = { viewFactor: 2.2, levelRatio: 4, countries: { FRA: meta(0.5), JPN: meta(0.4), FJI: meta(0.3), VAT: meta(0.03, 0.0075, 0.0019) } } as unknown as ImageryIndex;
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(load: (url: string) => Promise<THREE.Texture>) {
  const calls: [number | null, unknown, number | null, unknown, number, number | undefined][] = [];
  const globe = {
    setPatch() {}, setBeacon() {},
    setImageLevels(c: ImageSlot | null, f: ImageSlot | null, fade?: number) {
      calls.push([c?.meta.extentRad ?? null, c?.tex ?? null, f?.meta.extentRad ?? null, f?.tex ?? null, f?.opacity ?? 0, fade]);
    },
  };
  const c = new GlobeController('/');
  c.attach(globe as unknown as Globe);
  const urls: string[] = [];
  c.setImagery(index, { size: 2048, load: (url) => { urls.push(url); return load(url); } });
  return { c, calls, urls };
}
const pose = (altitude: number) => ({ dir: [1, 0, 0] as [number, number, number], altitude, up: [0, 1, 0] as [number, number, number], cut: false, pitch: 0, axisY: 0 });
const tex = (name: string, disposed: string[] = []) => ({ name, dispose: () => disposed.push(name) }) as unknown as THREE.Texture;

describe('photos emboîtées du pays visé (GlobeController)', () => {
  it('le vol demande chaque niveau à la taille du niveau de qualité, du plus large au plus fin', async () => {
    const { c, urls } = setup(async (u) => tex(u));
    void c.flyTo(by('VAT'));
    await flush();
    expect(urls).toEqual(['/data/patches/img/vat-0-2048.ktx2', '/data/patches/img/vat-1-2048.ktx2', '/data/patches/img/vat-2-2048.ktx2']);
  });

  it('de haut, le niveau 0 ; de près, le plus fin ; première photo en fondu', async () => {
    const t = ['l0', 'l1', 'l2'].map((n) => tex(n));
    const { c, calls } = setup(async (u) => t[Number(u.split('-')[1])]!);
    void c.flyTo(by('VAT'));
    await flush();
    c.notePose(pose(2.2));
    expect(calls.at(-1)!.slice(0, 2)).toEqual([0.03, t[0]]);
    expect(calls.at(-1)![5]).toBe(IMAGE_FADE_S);
    c.notePose(pose(1e-6));
    expect(calls.at(-1)!.slice(0, 4)).toEqual([0.0019, t[2], null, null]);
    expect(c.imageSlots).toEqual({ coarse: 2, fine: null, fineOpacity: 0 });
  });

  it('le plus fin en échec (404) : le niveau plus large reste, rien ne lève', async () => {
    const t = ['l0', 'l1'].map((n) => tex(n));
    const { c, calls } = setup(async (u) => { const i = Number(u.split('-')[1]); if (i === 2) throw new Error('404'); return t[i]!; });
    void c.flyTo(by('VAT'));
    await flush();
    c.notePose(pose(1e-6));
    expect(calls.at(-1)!.slice(0, 4)).toEqual([0.0075, t[1], null, null]);
  });

  it('précharge tous les niveaux du suivant ; ne garde que le courant et le suivant', async () => {
    const disposed: string[] = [];
    const { c, urls } = setup(async (url) => tex(url.split('/').pop()!, disposed));
    c.prefetch(by('VAT'));
    void c.flyTo(by('FRA'));
    await flush();
    expect(urls).toEqual(['/data/patches/img/vat-0-2048.ktx2', '/data/patches/img/vat-1-2048.ktx2', '/data/patches/img/vat-2-2048.ktx2', '/data/patches/img/fra-0-2048.ktx2']);
    c.prefetch(by('JPN'));
    void c.flyTo(by('VAT'));
    await flush();
    expect(disposed).toEqual(['fra-0-2048.ktx2']);
  });

  it('pays absent de l’index : aucune requête, emplacements vides', async () => {
    const { c, urls, calls } = setup(async () => tex('x'));
    void c.flyTo(by('LUX'));
    await flush();
    expect(urls).toEqual([]);
    expect(calls.at(-1)!.slice(0, 4)).toEqual([null, null, null, null]);
  });

  it('changement de taille (repli en qualité standard) : les photos 2048 sont retirées avant d’être libérées', async () => {
    const disposed: string[] = [];
    const { c, calls, urls } = setup(async (url) => tex(url.split('/').pop()!, disposed));
    void c.flyTo(by('FRA'));
    await flush();
    c.notePose(pose(0.5));
    c.setImagery(index, { size: 1024, load: async (url) => { urls.push(url); return tex(url.split('/').pop()!, disposed); } });
    expect(calls.at(-1)!.slice(0, 2)).toEqual([null, null]);       // délié tout de suite
    await flush();
    expect(disposed).toEqual(['fra-0-2048.ktx2']);                  // libéré ensuite
    expect(urls.at(-1)).toBe('/data/patches/img/fra-0-1024.ktx2');
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
    c.attach({ setPatch() {}, setBeacon() {}, setImageLevels() {} } as unknown as Globe);
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
