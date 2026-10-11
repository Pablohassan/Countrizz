import * as THREE from 'three';
import type { IntroFrame } from '../../../src/intro/timeline';

/**
 * Du repère three de la chronologie (`src/intro/timeline.ts`) à la scène Blender et à l'image de la vidéo. Blender reçoit
 * les valeurs three telles quelles : sa racine `monde` est tournée de +90° sur X, et les deux caméras regardent leur −Z
 * local avec Y en haut ; seul l'ordre des quaternions change (three `[x, y, z, w]`, Blender `[w, x, y, z]`).
 */
export type Vec3 = readonly [number, number, number];
/** Quaternion three : `[x, y, z, w]`. */
export type QuatThree = readonly [number, number, number, number];
/** Quaternion Blender : `[w, x, y, z]`. */
export type QuatBlender = [number, number, number, number];
export type IntroCamera = IntroFrame['camera'];
export interface Video { width: number; height: number }

/**
 * `q` ou `−q` (la même rotation), celui qui est du côté de `prec` : Blender interpole les clés composante par
 * composante, le signe doit suivre l'image précédente pour que l'interpolation prenne le plus court chemin.
 */
export function memeSigne(q: QuatBlender, prec: QuatBlender): QuatBlender {
  return q[0] * prec[0] + q[1] * prec[1] + q[2] * prec[2] + q[3] * prec[3] < 0 ? [-q[0], -q[1], -q[2], -q[3]] : q;
}

/** Quaternion three → Blender, de signe continu avec `prec` (le quaternion Blender de l'image précédente) s'il est donné. */
export function quatBlender(q: QuatThree, prec?: QuatBlender | null): QuatBlender {
  const b: QuatBlender = [q[3], q[0], q[1], q[2]];
  return prec ? memeSigne(b, prec) : b;
}

/** Rend continue en signe, sur place, une piste de quaternions Blender (`[w, x, y, z]` à la suite, image après image). */
export function signesContinus(valeurs: number[]): void {
  for (let k = 4; k + 4 <= valeurs.length; k += 4) {
    const q = memeSigne(valeurs.slice(k, k + 4) as QuatBlender, valeurs.slice(k - 4, k) as QuatBlender);
    for (let d = 0; d < 4; d++) valeurs[k + d] = q[d]!;
  }
}

/** La caméra three d'une image de la chronologie, réglée comme scene.ts:212-219 (sans le tremblé du stop motion). */
export function cameraThree(c: IntroCamera, video: Video): THREE.PerspectiveCamera {
  const k = new THREE.PerspectiveCamera(c.fov, video.width / video.height);
  k.position.fromArray(c.position);
  k.quaternion.fromArray(c.quaternion);
  const dist = k.position.length();
  k.near = Math.max(0.01, (dist - 1.3) * 0.5);
  k.far = dist + 3;
  k.updateProjectionMatrix();
  k.updateMatrixWorld(true);
  return k;
}

/** Point three (repère du monde) → px de la vidéo (x vers la droite, y vers le bas), comme scene.ts:263-264. */
export function projeter(p: Vec3, c: IntroCamera, video: Video): [number, number] {
  const v = new THREE.Vector3(p[0], p[1], p[2]).project(cameraThree(c, video));
  return [(v.x * 0.5 + 0.5) * video.width, (-v.y * 0.5 + 0.5) * video.height];
}

/** Écrasement de l'impact, scene.ts:228-230 : B·S·Bᵀ, B = l'orientation de la caméra, S = (sx, sy, sx). */
export function matriceEcrasement(c: IntroCamera, squash: { sx: number; sy: number }): THREE.Matrix4 {
  const B = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().fromArray(c.quaternion));
  return B.clone().multiply(new THREE.Matrix4().makeScale(squash.sx, squash.sy, squash.sx)).multiply(B.clone().transpose());
}

/** Unités de la scène par px de la vidéo, à la profondeur `D` devant la caméra (champ vertical `fovY` en degrés). */
export const unitesParPx = (D: number, fovY: number, video: Video) => (D * Math.tan((fovY * Math.PI) / 360)) / (video.height / 2);

/** Point de l'image (px de la vidéo) → coordonnées locales de la caméra, à la profondeur `D` (la caméra regarde −Z, Y en haut). */
export function versCamera(x: number, y: number, D: number, fovY: number, video: Video): [number, number, number] {
  const k = unitesParPx(D, fovY, video);
  return [(x - video.width / 2) * k, -(y - video.height / 2) * k, -D];
}
