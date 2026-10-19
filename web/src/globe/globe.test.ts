import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { Globe } from './globe';

describe('patchs retirés (pays suivant pas prêt, 404)', () => {
  it('setPatch(null) et setImageLevels(null, null) délient les textures : le cache peut les libérer sans réenvoi', () => {
    // 03/10 (revue finale) : la texture retirée restait liée au matériau (opacité 0) pendant que le cache la libérait ;
    // three la réenvoyait (SDF depuis un ImageBitmap fermé : erreur à chaque vol ; KTX2 recréé, jamais libéré).
    const textures = { day: new THREE.Texture(), night: new THREE.Texture(), surface: new THREE.Texture(), clouds: new THREE.Texture() };
    const globe = new Globe('game', { textures });
    const sdf = new THREE.Texture(), big = new THREE.Texture(), fine = new THREE.Texture();
    globe.setPatch({ sdf: 'patches/sdf/jpn.png', size: 1024, center: [137.1, 38], extentRad: 0.23, rangeTexels: 32 }, sdf);
    globe.setImageLevels({ meta: { center: [137.1, 38], extentRad: 0.4 }, tex: big, opacity: 1 }, { meta: { center: [137.1, 38], extentRad: 0.1 }, tex: fine, opacity: 0.5 });
    expect([globe.country.texture, globe.images[0]!.texture, globe.images[1]!.texture]).toEqual([sdf, big, fine]);
    expect(globe.images[1]!.uniforms.opacity.value).toBe(0.5);
    globe.setPatch(null, null);
    globe.setImageLevels(null, null);
    expect(globe.country.texture).not.toBe(sdf);
    expect([globe.images[0]!.texture, globe.images[1]!.texture]).not.toContain(big);
    expect([globe.images[0]!.texture, globe.images[1]!.texture]).not.toContain(fine);
    // Jamais le même objet Texture dans deux couches (03/10, FRA → JPN → FJI sous SwiftShader) : chaque couche a sa texture vide.
    const empties = [globe.country.texture, globe.images[0]!.texture, globe.images[1]!.texture];
    expect(new Set(empties).size).toBe(3);
  });

  it('première photo du pays en fondu ; le relais d’un niveau à l’autre sans fondu', () => {
    const textures = { day: new THREE.Texture(), night: new THREE.Texture(), surface: new THREE.Texture(), clouds: new THREE.Texture() };
    const globe = new Globe('game', { textures });
    const l0 = new THREE.Texture(), l1 = new THREE.Texture();
    const slot = (tex: THREE.Texture, extentRad: number, opacity = 1) => ({ meta: { center: [0, 0] as [number, number], extentRad }, tex, opacity });
    globe.setImageLevels(slot(l0, 0.4), null, 0.4);
    globe.setTime(10);
    expect(globe.images[0]!.uniforms.opacity.value).toBe(0);
    globe.setTime(10.2);
    expect(globe.images[0]!.uniforms.opacity.value).toBeCloseTo(0.5, 9);
    globe.setTime(10.5);
    globe.setImageLevels(slot(l0, 0.4), slot(l1, 0.1, 0.25), 0.4);
    expect(globe.images[1]!.uniforms.opacity.value).toBe(0.25);
    globe.setImageLevels(slot(l1, 0.1), null, 0.4);           // relais : l1 devient le courant
    expect(globe.images[0]!.uniforms.opacity.value).toBe(1);
    expect(globe.images[0]!.uniforms.extentRad.value).toBe(0.1);
  });

  it('setDayNight remplace les textures de jour et de nuit du matériau', () => {
    const textures = { day: new THREE.Texture(), night: new THREE.Texture(), surface: new THREE.Texture(), clouds: new THREE.Texture() };
    const globe = new Globe('game', { textures });
    const day = new THREE.Texture(), night = new THREE.Texture();
    globe.setDayNight(day, night);
    expect(globe.dayNight).toEqual([day, night]);
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
