import type * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { createAccessoryHost, type Accessory } from './accessories';

const scene = () => { const objects: unknown[] = []; return { objects, add: (o: unknown) => objects.push(o), remove: (o: unknown) => objects.splice(objects.indexOf(o), 1) }; };
const acc = (name: string, log: string[]): Accessory => ({
  create: () => { log.push(`+${name}`); return { object: { name } as unknown as THREE.Object3D, update: () => log.push(`~${name}`), dispose: () => log.push(`-${name}`) }; },
});
const frame = { nowMs: 0, pose: { dir: [0, 0, 1], altitude: 1, up: [0, 1, 0], cut: false, pitch: 0, axisY: 0 }, sun: [0, 0, 1] } as const;

describe('accessoires de la scène (spec 2A §5.3)', () => {
  it('monte, met à jour à chaque image, retire et libère', () => {
    const log: string[] = [], s = scene(), host = createAccessoryHost(s);
    const a = acc('avion', log), b = acc('traînée', log);
    host.sync([a, b]);
    host.update(frame);
    host.sync([b]);
    host.dispose();
    expect(log).toEqual(['+avion', '+traînée', '~avion', '~traînée', '-avion', '-traînée']);
    expect(s.objects).toEqual([]);
  });

  it('un accessoire qui lève à la création n’empêche pas les autres', () => {
    const log: string[] = [], s = scene(), host = createAccessoryHost(s);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    host.sync([{ create: () => { throw new Error('cassé'); } }, acc('avion', log)]);
    host.update(frame);
    expect(log).toEqual(['+avion', '~avion']);
    expect(s.objects).toHaveLength(1);
    spy.mockRestore();
  });

  it('un accessoire qui lève à la mise à jour est retiré ; les autres continuent (revue finale 2A-4)', () => {
    const log: string[] = [], s = scene(), host = createAccessoryHost(s);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad: Accessory = { create: () => ({ object: { name: 'cassé' } as unknown as THREE.Object3D, update: () => { throw new Error('update'); }, dispose: () => log.push('-cassé') }) };
    host.sync([bad, acc('avion', log)]);
    expect(() => host.update(frame)).not.toThrow();
    host.update(frame);
    expect(log).toEqual(['+avion', '-cassé', '~avion', '~avion']);
    expect(s.objects).toHaveLength(1);
    spy.mockRestore();
  });

  it('un dispose() qui lève ne remonte pas (le globe n’est pas remplacé par l’écran d’erreur)', () => {
    const s = scene(), host = createAccessoryHost(s);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    host.sync([{ create: () => ({ object: {} as THREE.Object3D, dispose: () => { throw new Error('dispose'); } }) }]);
    expect(() => host.dispose()).not.toThrow();
    expect(s.objects).toEqual([]);
    spy.mockRestore();
  });
});
