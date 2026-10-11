import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { projectOnScreen } from '../camera/home';
import { northUp, toVec, type Vec3 } from '../geo/vec';
import { OffsetCamera } from './offsetCamera';

const v = { width: 390, height: 844, fovYDeg: 50 };
function place(c: THREE.PerspectiveCamera, dir: Vec3, altitude: number, up: Vec3, pitch: number) {
  const d = 1 + altitude;
  c.position.set(dir[0] * d, dir[1] * d, dir[2] * d);
  c.up.set(...up);
  c.lookAt(0, 0, 0);
  if (pitch) c.rotateX(pitch);
  c.updateMatrixWorld(true);
  c.updateProjectionMatrix();
}

describe('caméra décentrée (axe optique hors du centre)', () => {
  it('à 0, identique à une PerspectiveCamera (aucune image ne change)', () => {
    const a = new OffsetCamera(50, v.width / v.height, 0.01, 100), b = new THREE.PerspectiveCamera(50, v.width / v.height, 0.01, 100);
    expect(a.projectionMatrix.elements).toEqual(b.projectionMatrix.elements);
  });

  it('le point visé tombe à la hauteur demandée, même sous la gigue du TRAA (setViewOffset)', () => {
    const c = new OffsetCamera(50, v.width / v.height, 0.01, 100);
    c.axisY = 0.3;
    place(c, [0, 0, 1], 1, [0, 1, 0], 0);
    expect(new THREE.Vector3(0, 0, 0).project(c).y).toBeCloseTo(0.3, 9);
    // ce que fait TRAANode.setViewOffset : vue pleine, décalée d'une fraction de pixel
    c.setViewOffset(v.width, v.height, 0.25, -0.25, v.width, v.height);
    expect(new THREE.Vector3(0, 0, 0).project(c).y).toBeCloseTo(0.3, 2);
    c.clearViewOffset();
    expect(new THREE.Vector3(0, 0, 0).project(c).y).toBeCloseTo(0.3, 9);
  });

  it('l’inverse suit : unproject(project(p)) = p', () => {
    const c = new OffsetCamera(50, v.width / v.height, 0.01, 100);
    c.axisY = -0.4;
    place(c, [0, 0, 1], 1, [0, 1, 0], 0);
    const p = new THREE.Vector3(0.2, -0.1, 0.5);
    expect(p.clone().project(c).unproject(c).distanceTo(p)).toBeLessThan(1e-6);
  });

  it('projectOnScreen (calcul pur) rejoint three, tangage et axe compris', () => {
    for (const [lngLat, alt, pitch, axisY] of [[[2.35, 48.85], 0.3, 0, 0.26], [[10, 19.5], 1.6, 0.416, 0], [[139.7, 35.7], 0.8, 0.2, -0.3]] as const) {
      const dir = toVec(lngLat as [number, number]), up = northUp(dir);
      const c = new OffsetCamera(v.fovYDeg, v.width / v.height, 0.001, 100);
      c.axisY = axisY;
      place(c, dir, alt, up, pitch);
      for (const q of [[2.35, 48.85], [12, 41.9], [139.7, 35.7], [5, 20]] as [number, number][]) {
        const pt = toVec(q);
        const pure = projectOnScreen({ dir, altitude: alt, up, pitch, axisY }, v, pt);
        const n = new THREE.Vector3(...pt).project(c);
        if (!pure) continue;
        expect(pure[0]).toBeCloseTo(((n.x + 1) / 2) * v.width, 6);
        expect(pure[1]).toBeCloseTo(((1 - n.y) / 2) * v.height, 6);
      }
    }
  });
});
