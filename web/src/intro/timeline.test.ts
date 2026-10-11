import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { REFERENCES, TITRES } from './cadrages';
import { BULLES, BULLES_RANGE, CADRAGES, INTRO, LOGO_ANGLE_FIN, LOGO_LETTRES, type Bulle, type Cadrage } from './temps';
import { frameAt, logoAngleAt, type IntroFrame } from './timeline';
import { toVec } from '../geo/vec';

const CADRES: Cadrage[] = ['portrait', 'paysage'];
const T_SOL = INTRO.CHUTE + INTRO.D_CHUTE;
type Ecran = { width: number; height: number };

const cam = (c: IntroFrame['camera'], vp: Ecran) => {
  const k = new THREE.PerspectiveCamera(c.fov, vp.width / vp.height, 0.01, 100);
  k.position.fromArray(c.position);
  k.quaternion.fromArray(c.quaternion);
  k.updateMatrixWorld(true);
  return k;
};
const project = (k: THREE.PerspectiveCamera, vp: Ecran, p: readonly number[]) => {
  const v = new THREE.Vector3(p[0], p[1], p[2]).project(k);
  return [(v.x * 0.5 + 0.5) * vp.width, (-v.y * 0.5 + 0.5) * vp.height] as const;
};
/** Centre et rayon apparents de la Terre (sphère unité) à l'image, en px de la vidéo. */
function disque(f: IntroFrame, cadrage: Cadrage) {
  const vp = CADRAGES[cadrage], k = cam(f.camera, vp);
  const [x, y] = project(k, vp, [0, 0, 0]);
  const d = Math.hypot(...f.camera.position);
  const r = Math.tan(Math.asin(1 / d)) / Math.tan((f.camera.fov * Math.PI) / 360) * (vp.height / 2);
  return { x, y, r };
}
/** Ordonnée à l'image du point le plus bas d'une sphère de rayon `rayon` centrée sur la Terre (tangente exacte ; Terre sur l'axe vertical de l'image). */
function bas(f: IntroFrame, cadrage: Cadrage, rayon: number): number {
  const vp = CADRAGES[cadrage], k = cam(f.camera, vp);
  const c = new THREE.Vector3(0, 0, 0).applyMatrix4(k.matrixWorldInverse);
  const a = Math.atan2(c.y, -c.z) - Math.asin(Math.min(1, rayon / c.length()));
  return vp.height / 2 - (Math.tan(a) / Math.tan((f.camera.fov * Math.PI) / 360)) * (vp.height / 2);
}

describe('chronologie de l’intro vidéo (double dézoom du 10/10, chute de 2,4 s)', () => {
  it('au milieu (logo), la Terre est le « o » de C🌍untrizz mesuré pour chaque cadrage', () => {
    for (const c of CADRES) {
      const o = TITRES[c].logo.o, d = disque(frameAt(7.8, c), c);
      expect(Math.abs(d.x - o.x)).toBeLessThan(1);
      expect(Math.abs(d.y - o.y)).toBeLessThan(1);
      expect(Math.abs(d.r - o.r) / o.r).toBeLessThan(0.03);
    }
  });

  it('à la fin, la Terre est dans le « o » du titre de fin, pour chaque cadrage', () => {
    for (const c of CADRES) {
      const o = TITRES[c].titre.o, d = disque(frameAt(INTRO.FIN, c), c);
      expect(Math.abs(d.x - o.x)).toBeLessThan(1);
      expect(Math.abs(d.y - o.y)).toBeLessThan(1);
      expect(Math.abs(d.r - o.r) / o.r).toBeLessThan(0.03);
    }
  });

  it('les lettres du logo surgissent au premier dézoom (en px de la vidéo), s’envolent au rezoom', () => {
    for (const c of CADRES) {
      expect(frameAt(5.8, c).logo.every((l) => l.alpha === 0)).toBe(true);
      expect(frameAt(6.4, c).logo[0]!.dx).toBeCloseTo(-80 * REFERENCES[c].echelle, 9);   // le « C » part de 80 px CSS à gauche
      for (const l of frameAt(8.3, c).logo) {
        expect([l.alpha, l.echelle]).toEqual([1, 1]);
        expect(Math.abs(l.dx) + Math.abs(l.dy) + Math.abs(l.rot)).toBeLessThan(1e-9);
      }
      expect(frameAt(9.5, c).logo.every((l) => l.alpha === 0)).toBe(true);
    }
    expect(LOGO_LETTRES).toEqual(['C', 'u', 'n', 't', 'r', 'i', 'z', 'z']);
  });

  it('le titre de fin surgit comme celui de l’accueil (home.css .logo-l, valeurs relevées dans Chromium)', () => {
    const t0 = INTRO.ACCUEIL + 0.5;
    expect(frameAt(t0, 'paysage').titre.every((l) => l.alpha === 0 && l.echelle === 0)).toBe(true);
    // paysage : 1 px CSS = 1 px de la vidéo, police de 54 px ; lettre 0 à 0,06 s et 0,33 s, lettre 3 (0,27 s plus tard)
    const a = frameAt(t0 + 0.06, 'paysage').titre[0]!, b = frameAt(t0 + 0.33, 'paysage').titre[0]!;
    expect([a.echelle, a.dy, a.alpha]).toEqual([expect.closeTo(0.2977, 3), expect.closeTo(11.377, 2), expect.closeTo(0.773, 3)]);
    expect([b.echelle, b.dy, b.alpha]).toEqual([expect.closeTo(1.1473, 3), expect.closeTo(-2.386, 2), 1]);
    expect(frameAt(t0 + 0.27 + 0.06, 'paysage').titre[3]!.echelle).toBeCloseTo(0.2977, 3);
    for (const c of CADRES) {
      expect(frameAt(t0, c).titre[0]!.dy).toBeCloseTo(0.3 * TITRES[c].titre.police, 9);   // 0,3 em de la police mesurée
      for (const l of frameAt(t0 + 0.09 * 7 + 0.45 + 0.01, c).titre) expect([l.alpha, l.echelle, l.dy]).toEqual([1, 1, 0]);
    }
  });

  it('la chute part plus lentement qu’avant, puis accélère de plus en plus fort jusqu’à l’impact (position en v³)', () => {
    for (const c of CADRES) {
      const hy = CADRAGES[c].height / 844;
      // courbe du 10/10 : centre de −560 à 470 px de la scène 390 × 844, en v² sur 1,6 s
      const avant = (t: number) => -560 * hy + 1030 * hy * Math.min(1, Math.max(0, (t - 1.2) / 1.6)) ** 2;
      const y = (t: number) => disque(frameAt(t, c), c).y;
      for (let n = 1; n <= 48; n++) {
        expect(y(INTRO.CHUTE + n / 120) - y(INTRO.CHUTE + (n - 1) / 120)).toBeLessThan(avant(1.2 + n / 120) - avant(1.2 + (n - 1) / 120));
      }
      let v0 = 0, a0 = 0;
      for (let n = 1; INTRO.CHUTE + n / 120 <= T_SOL; n++) {
        const v = y(INTRO.CHUTE + n / 120) - y(INTRO.CHUTE + (n - 1) / 120), a = v - v0;
        expect(v).toBeGreaterThan(v0);   // la vitesse croît…
        expect(a).toBeGreaterThan(a0);   // …et l'accélération aussi : elle flotte, puis file
        v0 = v;
        a0 = a;
      }
      // l'impact n'est pas un saut : la première image du rebond bouge moins que la dernière de la chute
      expect(Math.abs(y(T_SOL + 1 / 120) - y(T_SOL))).toBeLessThan(Math.abs(y(T_SOL) - y(T_SOL - 1 / 120)));
    }
  });

  it('avant la chute, la Terre et ses nuages sont au-dessus de l’image ; elle y entre plus d’une seconde avant l’impact', () => {
    for (const c of CADRES) {
      for (const t of [0, INTRO.CHUTE]) {
        const f = frameAt(t, c);
        expect(bas(f, c, 1.33 * Math.max(f.squash.sx, f.squash.sy))).toBeLessThan(0);   // nuages : boules à 1,24 + leur taille
      }
      expect(bas(frameAt(T_SOL - 1, c), c, 1)).toBeGreaterThan(0);
    }
  });

  it('ronde quand elle flotte, allongée juste avant l’impact, puis écrasée sans saut (images à 1/120 s)', () => {
    for (const c of CADRES) {
      expect(Math.abs(frameAt(INTRO.CHUTE + 0.4, c).squash.sy - 1)).toBeLessThan(0.005);
      expect(frameAt(T_SOL - 1 / 120, c).squash.sy).toBeGreaterThan(1.1);
      let prev = frameAt(T_SOL - 0.5, c), min = 1;
      for (let n = 1; n <= 120; n++) {
        const f = frameAt(T_SOL - 0.5 + n / 120, c);
        expect(Math.abs(f.squash.sy - prev.squash.sy)).toBeLessThan(0.02);
        expect(Math.abs(f.squash.sx - prev.squash.sx)).toBeLessThan(0.02);
        min = Math.min(min, f.squash.sy);
        prev = f;
      }
      expect(min).toBeLessThan(0.92);
    }
  });

  it('toupie et rezoom : jamais plus de 2,16° de rotation entre deux images à 120 i/s', () => {
    let max = 0;
    for (let n = Math.round(INTRO.CHUTE * 120); n < 11.3 * 120; n++) {
      const a = new THREE.Quaternion().fromArray(frameAt(n / 120, 'portrait').camera.quaternion);
      const b = new THREE.Quaternion().fromArray(frameAt((n + 1) / 120, 'portrait').camera.quaternion);
      max = Math.max(max, a.angleTo(b));
    }
    expect(max * 180 / Math.PI).toBeLessThanOrEqual(2.16 + 0.05);
    expect(max * 180 / Math.PI).toBeGreaterThan(1.5);
  });

  it('aucun saut de caméra : la distance à la Terre varie continûment', () => {
    for (const c of CADRES) {
      let prev = frameAt(0, c);
      for (let t = 1 / 240; t <= INTRO.FIN; t += 1 / 240) {
        const f = frameAt(t, c);
        const d0 = Math.hypot(...prev.camera.position), d1 = Math.hypot(...f.camera.position);
        expect(Math.abs(d1 - d0) / d0).toBeLessThan(0.04);
        prev = f;
      }
    }
  });

  it('continuité aux bornes de phase : ni la Terre ni son écrasement ne sautent', () => {
    for (const c of CADRES) {
      for (const b of [INTRO.CHUTE, T_SOL, 5.8, 8.8, 16.4]) {   // chute, impact, premier dézoom, rezoom, second dézoom
        const f0 = frameAt(b - 1e-6, c), f1 = frameAt(b + 1e-6, c), d0 = disque(f0, c), d1 = disque(f1, c);
        expect(Math.hypot(d1.x - d0.x, d1.y - d0.y)).toBeLessThan(0.5);
        expect(Math.abs(d1.r - d0.r) / d0.r).toBeLessThan(1e-3);
        expect(Math.abs(f1.squash.sy - f0.squash.sy)).toBeLessThan(1e-3);
      }
    }
  });

  it('au gros plan, Paris est au centre de l’image, vers 51 % de la hauteur', () => {
    for (const c of CADRES) {
      const vp = CADRAGES[c], f = frameAt(13.8, c);
      const [x, y] = project(cam(f.camera, vp), vp, toVec([2.35, 48.86]));
      expect(Math.abs(x - vp.width / 2)).toBeLessThan((8 / 844) * vp.height);
      expect(Math.abs(y - (430 / 844) * vp.height)).toBeLessThan((25 / 844) * vp.height);
    }
  });

  it('après la chute, la Terre fait 115 px de rayon de la scène 390 × 844', () => {
    for (const c of CADRES) {
      const vp = CADRAGES[c], r = 115 * (Math.min(vp.width, vp.height / 2) / 390);
      expect(Math.abs(disque(frameAt(5.2, c), c).r - r) / r).toBeLessThan(0.045);
    }
  });

  it('enchaîne : point (10,8 s), frontière (11,5 s), drapeau (13,0 s), tout rangé 0,7 s après BULLES_RANGE', () => {
    const at = (t: number) => frameAt(t, 'portrait');
    expect(at(10.7).point.visible).toBe(false);
    expect(at(11.3).point.visible).toBe(true);
    expect(at(11.4).border).toBe(0);
    expect(at(12.3).border).toBeGreaterThan(0);
    expect(at(12.9).flag.visible).toBe(false);
    expect(at(13.4).flag.visible).toBe(true);
    const fin = at(BULLES_RANGE + 0.8);
    expect([fin.point.visible, fin.flag.visible, fin.border, fin.bead]).toEqual([false, false, 0, null]);
  });

  it('bulles : Capitale, Pays, Drapeau 0,3 s après leur objet, retournées dans le même ordre, rangées avec le reste', () => {
    const ordre: Bulle[] = ['capitale', 'pays', 'drapeau'];
    expect(Object.keys(BULLES)).toEqual(ordre);
    for (let i = 1; i < ordre.length; i++) {
      expect(BULLES[ordre[i]!].apparait).toBeGreaterThan(BULLES[ordre[i - 1]!].apparait);
      expect(BULLES[ordre[i]!].retourne).toBeGreaterThan(BULLES[ordre[i - 1]!].retourne);
    }
    expect(BULLES.capitale.retourne).toBeGreaterThan(BULLES.drapeau.apparait);   // elles se retournent quand les trois sont là
    expect(BULLES.drapeau.retourne).toBeLessThan(BULLES_RANGE);
    const objet: Record<Bulle, (f: IntroFrame) => boolean> = { capitale: (f) => f.point.visible, pays: (f) => f.border > 0, drapeau: (f) => f.flag.visible };
    for (const b of ordre) {
      const t = BULLES[b].apparait - 0.3;
      expect(objet[b](frameAt(t - 0.01, 'portrait'))).toBe(false);
      expect(objet[b](frameAt(t + 0.01, 'portrait'))).toBe(true);
      expect(objet[b](frameAt(BULLES_RANGE - 0.01, 'portrait'))).toBe(true);
      expect(objet[b](frameAt(BULLES_RANGE + 0.71, 'portrait'))).toBe(false);
    }
  });

  it('étoiles : 46 billes fixes (graine de l’intro du 10/10) dans l’image, qui surgissent entre 0,2 et 1,6 s', () => {
    for (const c of CADRES) {
      const { width: W, height: H } = CADRAGES[c], e = REFERENCES[c].echelle;
      const avant = frameAt(0.1, c).etoiles, apres = frameAt(2, c).etoiles;
      expect(apres).toHaveLength(46);
      expect(avant.every((s) => s.alpha === 0 && s.echelle === 0)).toBe(true);
      for (const s of apres) {
        expect(s.x - s.r).toBeGreaterThanOrEqual(0);
        expect(s.x - s.r).toBeLessThan(W);
        expect(s.y - s.r).toBeGreaterThanOrEqual(0);
        expect(s.y - s.r).toBeLessThan(H);
        expect(s.r).toBeGreaterThanOrEqual(0.75 * e);
        expect(s.r).toBeLessThanOrEqual(2.5 * e);
        expect(s.alpha).toBeGreaterThan(0);
        expect(s.alpha).toBeLessThanOrEqual(0.9);
      }
    }
    // la première bille du générateur d'Intro.tsx (graine 12345, × 16807 mod 2³¹ − 1) : diamètre 1,838 px CSS, bord
    // gauche à 83,4 % de la largeur, bord haut à 94,8 % de la hauteur
    const s0 = frameAt(2, 'portrait').etoiles[0]!;
    expect((s0.r * 2) / REFERENCES.portrait.echelle).toBeCloseTo(1.838158, 6);
    expect([(s0.x - s0.r) / 1080, (s0.y - s0.r) / 2340]).toEqual([expect.closeTo(0.833995, 6), expect.closeTo(0.947702, 6)]);
  });

  it('durée de la vidéo ≈ 20 s, dans les 20-25 s du 09/10 (à 1 s près) ; étapes dans l’ordre', () => {
    expect(INTRO.FIN).toBeGreaterThanOrEqual(20 - 1);
    expect(INTRO.FIN).toBeLessThanOrEqual(25);
    const etapes = [INTRO.CHUTE, T_SOL, INTRO.ACCUEIL, INTRO.FONDU, INTRO.FIN];
    expect(etapes).toEqual([...etapes].sort((a, b) => a - b));
  });

  it('l’angle de la Terre à la fin (LOGO_ANGLE_FIN) donne l’image de départ de la petite Terre animée du titre', () => {
    expect(Math.abs(LOGO_ANGLE_FIN - logoAngleAt(INTRO.FIN))).toBeLessThan(1e-12);
    expect(LOGO_ANGLE_FIN).toBeGreaterThanOrEqual(0);
    expect(LOGO_ANGLE_FIN).toBeLessThan(2 * Math.PI);
  });
});
