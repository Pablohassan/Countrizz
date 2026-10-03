import * as THREE from 'three/webgpu';
import { abs, dot, float, select, smoothstep, texture, uniform } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import { frameXY } from './frameNodes';

/** Largeur du fondu au bord du cadre, en demi-côtés : le patch se fond dans la texture globale sur ses 15 % extérieurs. */
export const IMAGE_FEATHER = 0.15;

/**
 * Patch image (Sentinel-2) lu au point exact P de la sphère, dans son propre cadre azimutal (contrat de PatchMeta, sans
 * retournement) : `weight` vaut 1 au cœur, 0 hors du cadre et sur l'hémisphère opposé ; `color` (sRGB décodé) et `sea`
 * (alpha : mer = 1, terre = 0) se mêlent à la texture globale et à son masque d'océan.
 */
export function createImageLayer(P: Node<'vec3'>) {
  const u = {
    center: uniform(new THREE.Vector3(1, 0, 0)),
    east: uniform(new THREE.Vector3(0, 0, -1)),
    north: uniform(new THREE.Vector3(0, 1, 0)),
    extentRad: uniform(0.1),
    /** 0 = aucun patch ; monte à 1 en fondu quand le patch arrive. */
    opacity: uniform(0),
  };
  const empty = new THREE.Texture();
  const node = texture(empty);
  const xy = frameXY(P, u);
  const edge = (t: Node<'float'>) => smoothstep(float(1 - IMAGE_FEATHER), float(1), abs(t)).oneMinus();
  const front = select(dot(P, u.center).greaterThan(0), float(1), float(0));
  const weight = edge(xy.x).mul(edge(xy.y)).mul(front).mul(u.opacity);
  const sample = node.sample(xy.add(1).mul(0.5));
  return {
    uniforms: u, weight, color: sample.rgb, sea: sample.a,
    setTexture(t: THREE.Texture) { node.value = t; },
    /** Revient à la texture vide de la couche (patch retiré, avant que le cache ne le libère). */
    clear() { node.value = empty; },
    dispose() { empty.dispose(); },
    /** Texture liée au matériau. */
    get texture() { return node.value as THREE.Texture; },
  };
}
