import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CADRAGES, INTRO, type Cadrage } from '../../../../src/intro/temps';
import { TITRES } from '../../../../src/intro/cadrages';
import { frameAt } from '../../../../src/intro/timeline';
import { cameraThree, matriceEcrasement, memeSigne, projeter, quatBlender, signesContinus, versCamera } from '../../lib/axes';

const CAS: Cadrage[] = ['portrait', 'paysage'];

describe('quaternions three → Blender', () => {
  it('ordre [w, x, y, z]', () => {
    expect(quatBlender([0.1, 0.2, 0.3, 0.9])).toEqual([0.9, 0.1, 0.2, 0.3]);
  });

  it('signe continu : opposé au précédent, il est retourné (même rotation, plus court chemin)', () => {
    const prec: [number, number, number, number] = [0.9, 0.1, 0.2, 0.3];
    expect(quatBlender([-0.1, -0.2, -0.3, -0.9], prec)).toEqual(prec);
    expect(quatBlender([0.1, 0.2, 0.3, 0.9], prec)).toEqual(prec);
    expect(memeSigne([0.2, 0.9, 0.1, 0.3], prec)).toEqual([0.2, 0.9, 0.1, 0.3]);     // produit scalaire 0,38 : gardé
    expect(memeSigne([-0.9, 0.1, 0.2, 0.3], prec)).toEqual([0.9, -0.1, -0.2, -0.3]); // −0,67 : retourné
  });

  it('signesContinus : une piste dont le signe saute est remise d’un seul côté, sur place', () => {
    const v = [1, 0, 0, 0, -0.99, -0.1, 0, 0, 0.98, 0.2, 0, 0, -0.97, -0.24, 0, 0];
    signesContinus(v);
    expect(v.map((x) => x + 0)).toEqual([1, 0, 0, 0, 0.99, 0.1, 0, 0, 0.98, 0.2, 0, 0, 0.97, 0.24, 0, 0]);   // + 0 : −0 → 0
  });
});

describe('projection d’un point three en px de la vidéo', () => {
  it('le centre de la Terre tombe au centre du « o » du logo puis du titre (placement), à 1e-6 px', () => {
    for (const c of CAS) {
      const logo = projeter([0, 0, 0], frameAt(8.0, c).camera, CADRAGES[c]);
      expect(Math.abs(logo[0] - TITRES[c].logo.o.x)).toBeLessThan(1e-6);
      expect(Math.abs(logo[1] - TITRES[c].logo.o.y)).toBeLessThan(1e-6);
      for (const t of [INTRO.FONDU + 0.4, INTRO.FIN]) {
        const titre = projeter([0, 0, 0], frameAt(t, c).camera, CADRAGES[c]);
        expect(Math.abs(titre[0] - TITRES[c].titre.o.x)).toBeLessThan(1e-6);
        expect(Math.abs(titre[1] - TITRES[c].titre.o.y)).toBeLessThan(1e-6);
      }
    }
  });

  it('un point posé par versCamera retombe sur son px, à toute profondeur', () => {
    for (const c of CAS)
      for (const t of [0.5, 4, 12, INTRO.FIN]) {
        const cam = frameAt(t, c).camera, k = cameraThree(cam, CADRAGES[c]);
        for (const [x, y, D] of [[100, 200, 2], [CADRAGES[c].width - 3, 7, 1000], [CADRAGES[c].width / 2, CADRAGES[c].height / 2, 50]] as const) {
          const w = new THREE.Vector3(...versCamera(x, y, D, cam.fov, CADRAGES[c])).applyMatrix4(k.matrixWorld);
          const p = projeter([w.x, w.y, w.z], cam, CADRAGES[c]);
          expect(Math.abs(p[0] - x)).toBeLessThan(1e-6);
          expect(Math.abs(p[1] - y)).toBeLessThan(1e-6);
        }
      }
  });

  it('écrasement B·S·Bᵀ : sy le long de l’axe vertical de l’image, sx sur les deux autres', () => {
    const cam = frameAt(4, 'portrait').camera, q = new THREE.Quaternion().fromArray(cam.quaternion);
    const M = matriceEcrasement(cam, { sx: 1.1, sy: 0.8 });
    const haut = new THREE.Vector3(0, 1, 0).applyQuaternion(q), droite = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    expect(haut.clone().applyMatrix4(M).distanceTo(haut.clone().multiplyScalar(0.8))).toBeLessThan(1e-12);
    expect(droite.clone().applyMatrix4(M).distanceTo(droite.clone().multiplyScalar(1.1))).toBeLessThan(1e-12);
  });
});
