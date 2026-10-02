import * as THREE from 'three/webgpu';
import { cameraPosition, clamp, cross, dot, float, length, mix, normalize, positionWorld, pow, smoothstep, uniform, vec3 } from 'three/tsl';
import type { Vec3 } from '../geo/vec';

/** Rayon extérieur de la coquille d'atmosphère (rayons terrestres). */
const SHELL = 1.06;

/**
 * Halo de limbe (spec §4.2) : bleu côté jour, orangé au crépuscule. Sphère arrière additive ; l'intensité dépend de la
 * distance h du rayon de vue au centre de la Terre (maximale au ras du limbe, h = 1, nulle au bord de la coquille).
 * Avec une intensité tirée de la normale de la coquille, l'anneau se détache du limbe (bande sombre, constaté).
 */
export function createAtmosphere(): { mesh: THREE.Mesh; setSun(dir: Vec3): void } {
  const sun = uniform(new THREE.Vector3(1, 0, 0));
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const ray = normalize(positionWorld.sub(cameraPosition));
  const h = length(cross(cameraPosition, ray));
  const glow = pow(clamp(float(SHELL).sub(h).div(SHELL - 1), 0, 1), float(2.2));
  // point du rayon le plus proche du centre : c'est lui qui décide jour ou nuit
  const closest = normalize(cameraPosition.sub(ray.mul(dot(cameraPosition, ray))));
  const lit = smoothstep(float(-0.25), float(0.35), dot(closest, sun));
  material.colorNode = mix(vec3(1.0, 0.45, 0.15), vec3(0.3, 0.6, 1.0), lit).mul(glow).mul(lit.mul(0.9).add(0.1));
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SHELL, 128, 64), material);
  return { mesh, setSun(dir) { sun.value.set(...dir); } };
}
