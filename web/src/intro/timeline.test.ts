import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { INTRO, LOGO_LETTRES, defaultTargets, frameAt, logoAngleAt, type Targets } from './timeline';
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
  return [(v.x * 0.5 + 0.5) * vp.width, (-v.y * 0.5 + 0.5) * vp.height] as const;
};
/** Centre et rayon apparents de la Terre (sphère unité) à l'écran. */
function disque(f: ReturnType<typeof frameAt>, vp: typeof phone) {
  const k = cam(f.camera, vp);
  const [x, y] = project(k, vp, [0, 0, 0]);
  const d = Math.hypot(...f.camera.position);
  const r = Math.tan(Math.asin(1 / d)) / Math.tan((f.camera.fov * Math.PI) / 360) * (vp.height / 2);
  return { x, y, r };
}

describe('chronologie de l’intro en pâte (double dézoom, 10/10)', () => {
  it('au milieu (logo), la Terre est le « o » de C🌍untrizz : centre et rayon de la cible', () => {
    for (const vp of [phone, desktop]) {
      const c = defaultTargets(vp), d = disque(frameAt(7, vp, c), vp);
      expect(Math.abs(d.x - c.logo.x)).toBeLessThan(1);
      expect(Math.abs(d.y - c.logo.y)).toBeLessThan(1);
      expect(Math.abs(d.r - c.logo.r) / c.logo.r).toBeLessThan(0.03);
    }
  });

  it('à la fin, la Terre est dans le « o » du titre de l’accueil, cible mesurée ou par défaut', () => {
    const mesurees: Targets = { logo: { x: 195, y: 420, r: 22 }, titre: { x: 98, y: 151, r: 16 } };
    for (const [vp, c] of [[phone, defaultTargets(phone)], [phone, mesurees], [desktop, defaultTargets(desktop)]] as const) {
      const d = disque(frameAt(INTRO.FIN, vp, c), vp);
      expect(Math.abs(d.x - c.titre.x)).toBeLessThan(1);
      expect(Math.abs(d.y - c.titre.y)).toBeLessThan(1);
      expect(Math.abs(d.r - c.titre.r) / c.titre.r).toBeLessThan(0.03);
    }
  });

  it('les lettres apparaissent au premier dézoom, s’envolent au rezoom', () => {
    const c = defaultTargets(phone);
    expect(frameAt(5.0, phone, c).logo.letters.every((x) => x === 0)).toBe(true);
    expect(frameAt(7.5, phone, c).logo.letters.every((x) => x === 1)).toBe(true);
    expect(frameAt(7.5, phone, c).logo.out).toBe(0);
    expect(frameAt(8.7, phone, c).logo.out).toBe(1);
    expect(LOGO_LETTRES).toEqual(['C', 'u', 'n', 't', 'r', 'i', 'z', 'z']);
  });

  it('toupie et rezoom : jamais plus de 21,6° de rotation entre deux images à 12 i/s', () => {
    const c = defaultTargets(phone);
    let max = 0;
    for (let n = Math.round(INTRO.CHUTE * 12); n < 10.5 * 12; n++) {
      const a = new THREE.Quaternion().fromArray(frameAt(n / 12, phone, c).camera.quaternion);
      const b = new THREE.Quaternion().fromArray(frameAt((n + 1) / 12, phone, c).camera.quaternion);
      max = Math.max(max, a.angleTo(b));
    }
    expect(max * 180 / Math.PI).toBeLessThanOrEqual(21.6 + 0.5);
    expect(max * 180 / Math.PI).toBeGreaterThan(15);
  });

  it('aucun saut de caméra (hors impact) : la distance à la Terre varie continûment', () => {
    for (const vp of [phone, desktop]) {
      const c = defaultTargets(vp);
      let prev = frameAt(0, vp, c);
      for (let t = 1 / 240; t <= INTRO.FIN; t += 1 / 240) {
        const f = frameAt(t, vp, c);
        const d0 = Math.hypot(...prev.camera.position), d1 = Math.hypot(...f.camera.position);
        expect(Math.abs(d1 - d0) / d0).toBeLessThan(0.04);
        prev = f;
      }
    }
  });

  it('au gros plan, Paris est au centre de l’écran, vers 51 % de la hauteur', () => {
    for (const vp of [phone, desktop]) {
      const f = frameAt(13, vp, defaultTargets(vp));
      const [x, y] = project(cam(f.camera, vp), vp, toVec([2.35, 48.86]));
      expect(Math.abs(x - vp.width / 2)).toBeLessThan(8);
      expect(Math.abs(y - (430 / 844) * vp.height)).toBeLessThan(25);
    }
  });

  it('après la chute, la Terre fait 115 px de rayon sur un téléphone', () => {
    const d = disque(frameAt(4.4, phone, defaultTargets(phone)), phone);
    expect(d.r).toBeGreaterThan(110);
    expect(d.r).toBeLessThan(120);
  });

  it('enchaîne : point (10 s), frontière (10,7 s), drapeau (12,2 s), vignette (12,9 s), tout rangé à 16,1 s', () => {
    const c = defaultTargets(phone), at = (t: number) => frameAt(t, phone, c);
    expect(at(9.9).point.visible).toBe(false);
    expect(at(10.5).point.visible).toBe(true);
    expect(at(10.6).border).toBe(0);
    expect(at(11.5).border).toBeGreaterThan(0);
    expect(at(12.1).flag.visible).toBe(false);
    expect(at(12.6).flag.visible).toBe(true);
    expect(at(13.5).label.opacity).toBe(1);
    const fin = at(16.2);
    expect([fin.point.visible, fin.flag.visible, fin.label.opacity, fin.border]).toEqual([false, false, 0, 0]);
  });

  it('le fond de nuit s’efface pendant le fondu ; la Terre en pâte, elle, reste jusqu’au bout', () => {
    const c = defaultTargets(phone);
    expect(frameAt(INTRO.FONDU - 0.1, phone, c).backdrop).toBe(1);
    expect(frameAt(INTRO.FIN, phone, c).backdrop).toBe(0);
    expect(frameAt(INTRO.FIN, phone, c).opacity).toBe(1);
  });

  it('l’angle de la Terre à la fin donne l’image de départ de la petite Terre animée du titre', () => {
    const a = logoAngleAt(INTRO.FIN);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(2 * Math.PI);
  });
});
