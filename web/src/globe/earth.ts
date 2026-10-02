import * as THREE from 'three/webgpu';
import { abs, bumpMap, cameraPosition, clamp, dot, float, mix, normalize, normalWorld, output, positionWorld, pow, smoothstep, texture, uniform, vec3, vec4 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type { Vec3 } from '../geo/vec';
import type { GlobeTextures } from './textures';

/** Relief : la texture de surface porte l'altitude GEBCO_08 en R (0 → 6400 m). */
const BUMP_SCALE = 0.02;

/** Terre en couches (spec §4.2) : jour, relief, océan (rugosité, reflet du soleil), lumières de la face nocturne. */
export function createEarthMaterial(t: GlobeTextures): { material: THREE.MeshStandardNodeMaterial; base: Node<'vec4'>; setSun(dir: Vec3): void } {
  const sun = uniform(new THREE.Vector3(1, 0, 0));
  const material = new THREE.MeshStandardNodeMaterial();
  // L'océan profond de Blue Marble est un bleu uniforme presque noir : on le relève très légèrement (masque G).
  material.colorNode = texture(t.day).rgb.add(vec3(0.0, 0.012, 0.035).mul(texture(t.surface).g));
  material.normalNode = bumpMap(texture(t.surface), float(BUMP_SCALE));
  material.roughnessNode = mix(float(0.92), float(0.55), texture(t.surface).g);
  material.metalnessNode = float(0);
  const nightSide = smoothstep(float(0.05), float(-0.15), dot(normalWorld, sun));
  material.emissiveNode = texture(t.night).rgb.mul(nightSide).mul(1.6);
  // Voile atmosphérique côté jour (diffusion de Rayleigh approchée) : bleuit l'océan profond, presque noir dans
  // Blue Marble, et épaissit vers le limbe. Posé avant la couche pays : le jaune du pays reste exact.
  const day = clamp(dot(normalWorld, sun).mul(1.5).add(0.25), 0, 1);
  const grazing = pow(float(1).sub(abs(dot(normalWorld, normalize(cameraPosition.sub(positionWorld))))), float(3));
  const veil = day.mul(grazing.mul(0.35).add(0.03));
  const base = vec4(mix(output.rgb, vec3(0.32, 0.55, 1.0).mul(day.mul(0.9).add(0.1)), veil), output.a);
  return { material, base, setSun(dir) { sun.value.set(...dir); } };
}
