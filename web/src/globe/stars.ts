import * as THREE from 'three/webgpu';
import { attribute, vec3 } from 'three/tsl';

/** Champ d'étoiles : points de 1 px (seule taille de point que WebGPU accepte), éclat par étoile, graine fixe. */
export function createStars(count = 4000, radius = 50): THREE.Points {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const positions = new Float32Array(count * 3), brightness = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    positions.set([r * Math.cos(a) * radius, z * radius, r * Math.sin(a) * radius], i * 3);
    brightness[i] = 0.35 + 0.65 * rnd() ** 3;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('brightness', new THREE.BufferAttribute(brightness, 1));
  const material = new THREE.PointsNodeMaterial({ sizeAttenuation: false });
  material.colorNode = vec3(1, 1, 1).mul(attribute('brightness', 'float'));
  return new THREE.Points(geometry, material);
}
