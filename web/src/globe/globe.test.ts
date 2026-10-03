import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { Globe } from './globe';

describe('patchs retirés (pays suivant pas prêt, 404)', () => {
  it('setPatch(null) et setImagePatch(null) délient les textures : le cache peut les libérer sans réenvoi', () => {
    // 03/10 (revue finale) : la texture retirée restait liée au matériau (opacité 0) pendant que le cache la libérait ;
    // three la réenvoyait (SDF depuis un ImageBitmap fermé : erreur à chaque vol ; KTX2 recréé, jamais libéré).
    const textures = { day: new THREE.Texture(), night: new THREE.Texture(), surface: new THREE.Texture(), clouds: new THREE.Texture() };
    const globe = new Globe('game', { textures });
    const sdf = new THREE.Texture(), img = new THREE.Texture();
    globe.setPatch({ sdf: 'patches/sdf/jpn.png', size: 1024, center: [137.1, 38], extentRad: 0.23, rangeTexels: 32 }, sdf);
    globe.setImagePatch({ center: [137.1, 38], extentRad: 0.4 }, img);
    expect([globe.country.texture, globe.image!.texture]).toEqual([sdf, img]);
    globe.setPatch(null, null);
    globe.setImagePatch(null, null);
    expect(globe.country.texture).not.toBe(sdf);
    expect(globe.image!.texture).not.toBe(img);
  });
});

describe('Globe.dispose', () => {
  it('libère ses géométries et ses matériaux, pas les textures prêtées par l’appelant', () => {
    const textures = { day: new THREE.Texture(), night: new THREE.Texture(), surface: new THREE.Texture(), clouds: new THREE.Texture() };
    const globe = new Globe('game', { textures, borders: [[[0, 0], [1, 1], [2, 1]]] });
    // Ressources distinctes : les sprites (balise, soleil) partagent la géométrie statique de three.
    const owned = new Set<{ addEventListener(type: 'dispose', cb: () => void): void }>();
    globe.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) owned.add(m.geometry);
      for (const mat of [m.material].flat()) if (mat) owned.add(mat as THREE.Material);
    });
    expect(owned.size).toBeGreaterThanOrEqual(8); // Terre, halo, étoiles, frontières, balise : géométrie + matériau
    let disposed = 0;
    for (const o of owned) o.addEventListener('dispose', () => { disposed++; });
    let lent = 0;
    for (const t of Object.values(textures)) t.addEventListener('dispose', () => { lent++; });
    globe.dispose();
    expect(disposed).toBe(owned.size); // une fois chacune
    expect(lent).toBe(0);
  });
});
