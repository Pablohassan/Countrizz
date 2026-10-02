import { describe, expect, it } from 'vitest';
import { createPatchCache } from './patchCache';

const deferred = <T,>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

describe('cache des patchs : le courant et le suivant seulement', () => {
  it('ne charge qu’une fois par clé', async () => {
    let loads = 0;
    const c = createPatchCache(async (k: string) => { loads++; return k.toUpperCase(); }, () => {});
    expect(await c.get('fra')).toBe('FRA');
    expect(await c.get('fra')).toBe('FRA');
    expect(loads).toBe(1);
  });
  it('keep libère tout le reste, une fois chargé', async () => {
    const disposed: string[] = [];
    const c = createPatchCache(async (k: string) => k, (v) => disposed.push(v));
    await Promise.all(['fra', 'jpn', 'chl'].map((k) => c.get(k)));
    c.keep(['jpn', 'chl']);
    await Promise.resolve();
    expect(disposed).toEqual(['fra']);
  });
  it('un échec n’est pas mis en cache : la clé se recharge au prochain appel', async () => {
    let attempt = 0;
    const c = createPatchCache(async (k: string) => { attempt++; if (attempt === 1) throw new Error('404'); return k; }, () => {});
    await expect(c.get('fra')).rejects.toThrow('404');
    expect(await c.get('fra')).toBe('fra');
  });
  it('libère aussi un patch dont le chargement finit après keep', async () => {
    const d = deferred<string>();
    const disposed: string[] = [];
    const c = createPatchCache((k: string) => (k === 'slow' ? d.promise : Promise.resolve(k)), (v) => disposed.push(v));
    void c.get('slow');
    c.keep(['fra']);
    d.resolve('slow');
    await d.promise; await Promise.resolve();
    expect(disposed).toEqual(['slow']);
  });
});
