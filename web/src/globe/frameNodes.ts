import type * as THREE from 'three/webgpu';
import { atan, cameraPosition, cross, dot, float, length, max, normalize, positionWorld, select, sqrt, vec2 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type UniformNode from 'three/src/nodes/core/UniformNode.js';

/** Repère tangent d'un cadre de patch (C, E, N) et son demi-côté en radians — voir le contrat de PatchMeta. */
export interface FrameUniforms {
  center: UniformNode<'vec3', THREE.Vector3>;
  east: UniformNode<'vec3', THREE.Vector3>;
  north: UniformNode<'vec3', THREE.Vector3>;
  extentRad: UniformNode<'float', number>;
}

/**
 * Point exact de la sphère unité sous le pixel (intersection du rayon de vue), et non le point de la facette : au cadrage
 * du Vatican, l'écart entre la facette (maillage 512×256) et la sphère atteint une vingtaine de texels.
 */
export function exactSpherePoint(): Node<'vec3'> {
  const rayDir = normalize(positionWorld.sub(cameraPosition));
  const b = dot(cameraPosition, rayDir);
  const c = dot(cameraPosition, cameraPosition).sub(1);
  return normalize(cameraPosition.add(rayDir.mul(b.negate().sub(sqrt(max(b.mul(b).sub(c), 0))))));
}

/** Coordonnées du point P dans le cadre, en demi-côtés (±1 au bord), y vers le SUD : x = k·(P·E), y = −k·(P·N), k = c / sin c. */
export function frameXY(P: Node<'vec3'>, u: FrameUniforms): Node<'vec2'> {
  const cosC = dot(P, u.center);
  const sinC = length(cross(P, u.center));
  const k = select(sinC.greaterThan(1e-7), atan(sinC, cosC).div(sinC), float(1));
  return vec2(k.mul(dot(P, u.east)), k.mul(dot(P, u.north)).negate()).div(u.extentRad);
}
