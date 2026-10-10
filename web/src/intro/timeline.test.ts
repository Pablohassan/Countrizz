import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { INTRO, frameAt, homeCamera } from './timeline';
import { toVec } from '../geo/vec';

const phone = { width: 390, height: 844 };
const desktop = { width: 1280, height: 800 };

const cam = (c: { position: number[]; quaternion: number[]; fov: number }, vp: typeof phone) => {
  const k = new THREE.PerspectiveCamera(c.fov, vp.width / vp.height, 0.01, 100);
  k.position.fromArray(c.position);
  k.quaternion.fromArray(c.quaternion);
  k.updateMatrixWorld(true);
  return k;
};
const project = (k: THREE.PerspectiveCamera, vp: typeof phone, p: readonly number[]) => {
  const v = new THREE.Vector3(p[0], p[1], p[2]).project(k);
  return [(v.x * 0.5 + 0.5) * vp.width, (-v.y * 0.5 + 0.5) * vp.height];
};

describe('chronologie de l’intro en pâte', () => {
  it('finit exactement sur la caméra de la vue d’accueil du globe', () => {
    for (const vp of [phone, desktop]) {
      const f = frameAt(INTRO.FIN, vp), h = homeCamera(vp);
      expect(f.camera.fov).toBeCloseTo(h.fov, 9);
      f.camera.position.forEach((x, i) => expect(x).toBeCloseTo(h.position[i]!, 9));
      expect(Math.abs(new THREE.Quaternion().fromArray(f.camera.quaternion).dot(new THREE.Quaternion().fromArray(h.quaternion)))).toBeCloseTo(1, 9);
    }
  });

  it('toupie : jamais plus de 21,6° de rotation entre deux images à 12 i/s', () => {
    let max = 0;
    for (let n = Math.round(2 * 12); n < 9.5 * 12; n++) {
      const a = new THREE.Quaternion().fromArray(frameAt(n / 12, phone).camera.quaternion);
      const b = new THREE.Quaternion().fromArray(frameAt((n + 1) / 12, phone).camera.quaternion);
      max = Math.max(max, a.angleTo(b));
    }
    expect(max * 180 / Math.PI).toBeLessThanOrEqual(21.6 + 0.5);
    expect(max * 180 / Math.PI).toBeGreaterThan(15);   // elle tourne vraiment vite
  });

  it('aucun saut de caméra (hors impact) : la distance à la Terre varie continûment', () => {
    for (const vp of [phone, desktop]) {
      let prev = frameAt(0, vp);
      for (let t = 1 / 240; t <= INTRO.FIN; t += 1 / 240) {
        const f = frameAt(t, vp);
        const d0 = Math.hypot(...prev.camera.position), d1 = Math.hypot(...f.camera.position);
        expect(Math.abs(d1 - d0) / d0).toBeLessThan(0.04);
        expect(Math.abs(f.camera.fov - prev.camera.fov)).toBeLessThan(0.5);
        prev = f;
      }
    }
  });

  it('au gros plan, Paris est au centre de l’écran, vers 51 % de la hauteur', () => {
    for (const vp of [phone, desktop]) {
      const f = frameAt(13, vp);
      const [x, y] = project(cam(f.camera, vp), vp, toVec([2.35, 48.86]));
      expect(Math.abs(x! - vp.width / 2)).toBeLessThan(8);
      expect(Math.abs(y! - (430 / 844) * vp.height)).toBeLessThan(25);
    }
  });

  it('en vue d’ensemble, la Terre fait 115 px de rayon sur un téléphone (30 % de moins que la v3)', () => {
    const f = frameAt(6, phone);
    const k = cam(f.camera, phone);
    const d = Math.hypot(...f.camera.position);
    const rho = Math.asin(1 / d);   // demi-angle apparent de la sphère
    const rpx = Math.tan(rho) / Math.tan((f.camera.fov * Math.PI) / 360) * (phone.height / 2);
    expect(rpx).toBeGreaterThan(110);
    expect(rpx).toBeLessThan(120);
    expect(k.fov).toBe(f.camera.fov);
  });

  it('enchaîne : point (10 s), frontière (10,7 s), drapeau (12,2 s), vignette (12,9 s), tout rangé à 16,1 s', () => {
    expect(frameAt(9.9, phone).point.visible).toBe(false);
    expect(frameAt(10.5, phone).point.visible).toBe(true);
    expect(frameAt(10.6, phone).border).toBe(0);
    expect(frameAt(11.5, phone).border).toBeGreaterThan(0);
    expect(frameAt(12.1, phone).flag.visible).toBe(false);
    expect(frameAt(12.6, phone).flag.visible).toBe(true);
    expect(frameAt(12.8, phone).label.opacity).toBe(0);
    expect(frameAt(13.5, phone).label.opacity).toBe(1);
    const fin = frameAt(16.2, phone);
    expect([fin.point.visible, fin.flag.visible, fin.label.opacity, fin.border]).toEqual([false, false, 0, 0]);
  });

  it('le calque de l’intro s’efface de 19,6 à 21 s', () => {
    expect(frameAt(19.5, phone).layerOpacity).toBe(1);
    expect(frameAt(20.3, phone).layerOpacity).toBeGreaterThan(0);
    expect(frameAt(20.3, phone).layerOpacity).toBeLessThan(1);
    expect(frameAt(21.1, phone).layerOpacity).toBe(0);
  });
});
