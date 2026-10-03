import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { Globe } from './globe';

describe('Globe.dispose', () => {
  it('libère ses géométries et ses matériaux, pas les textures prêtées par l’appelant', () => {
    const textures = { day: new THREE.Texture(), night: new THREE.Texture(), surface: new THREE.Texture(), clouds: new THREE.Texture() };
    const globe = new Globe('game', { textures, borders: [[[0, 0], [1, 1], [2, 1]]] });
    const owned: { dispatchEvent: unknown; addEventListener(type: 'dispose', cb: () => void): void }[] = [];
    globe.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) owned.push(m.geometry);
      for (const mat of [m.material].flat()) if (mat) owned.push(mat as THREE.Material);
    });
    expect(owned.length).toBeGreaterThanOrEqual(8); // Terre, halo, étoiles, frontières, balise : géométrie + matériau
    let disposed = 0;
    for (const o of owned) o.addEventListener('dispose', () => { disposed++; });
    let lent = 0;
    for (const t of Object.values(textures)) t.addEventListener('dispose', () => { lent++; });
    globe.dispose();
    expect(disposed).toBe(owned.length);
    expect(lent).toBe(0);
  });
});
