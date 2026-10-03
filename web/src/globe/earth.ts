import * as THREE from 'three/webgpu';
import { abs, bumpMap, cameraPosition, clamp, dot, float, mix, normalize, normalWorld, output, positionWorld, pow, smoothstep, texture, uniform, uv, vec3, vec4 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type { Vec3 } from '../geo/vec';
import { exactSpherePoint } from './frameNodes';
import { createImageLayer } from './imageLayer';
import type { createClouds } from './clouds';
import type { GlobeTextures } from './textures';

/** Relief : la texture de surface porte l'altitude GEBCO_08 en R (0 → 6400 m). */
const BUMP_SCALE = 0.02;

/**
 * Terre en couches (spec §4.2) : jour (Sentinel-2, précisé par le patch image du pays visé), relief, océan (rugosité,
 * reflet du soleil), lumières de la face nocturne.
 */
export function createEarthMaterial(t: GlobeTextures, clouds: ReturnType<typeof createClouds> | null = null) {
  const sun = uniform(new THREE.Vector3(1, 0, 0));
  const material = new THREE.MeshStandardNodeMaterial();
  const image = createImageLayer(exactSpherePoint());
  // Mer (1) / terre (0) : masque de la texture de surface (4K), précisé par l'alpha du patch image là où il est
  // (agrandi ×7 au cadrage d'un petit pays, le masque 4K dessinait des côtes en escalier dans le reflet du soleil).
  const sea = mix(texture(t.surface).g, image.sea, image.weight);
  // L'océan profond est très sombre : on le relève très légèrement.
  // Nuages : blancs et mats par-dessus le sol ; leur ombre (à l'aplomb, sans décalage vers le soleil) assombrit les bords
  // effilochés ; ils voilent les lumières des villes.
  const cover = clouds ? clouds.coverageAt(uv()) : float(0);
  const ground = mix(texture(t.day).rgb, image.color, image.weight).add(vec3(0.0, 0.012, 0.035).mul(sea)).mul(cover.mul(0.35).oneMinus());
  material.colorNode = mix(ground, vec3(0.92, 0.92, 0.92), cover);
  material.normalNode = bumpMap(texture(t.surface), float(BUMP_SCALE));
  material.roughnessNode = mix(mix(float(0.92), float(0.55), sea), float(1), cover);
  material.metalnessNode = float(0);
  const nightSide = smoothstep(float(0.05), float(-0.15), dot(normalWorld, sun));
  material.emissiveNode = texture(t.night).rgb.mul(nightSide).mul(1.6).mul(cover.mul(0.6).oneMinus());
  // Voile atmosphérique côté jour (diffusion de Rayleigh approchée) : bleuit l'océan profond, presque noir dans
  // Blue Marble, et épaissit vers le limbe. Posé avant la couche pays : le jaune du pays reste exact.
  const day = clamp(dot(normalWorld, sun).mul(1.5).add(0.25), 0, 1);
  const grazing = pow(float(1).sub(abs(dot(normalWorld, normalize(cameraPosition.sub(positionWorld))))), float(3));
  const veil = day.mul(grazing.mul(0.35).add(0.03));
  const base = vec4(mix(output.rgb, vec3(0.32, 0.55, 1.0).mul(day.mul(0.9).add(0.1)), veil), output.a);
  return { material, base: base as Node<'vec4'>, image, setSun(dir: Vec3) { sun.value.set(...dir); } };
}
