import * as THREE from 'three/webgpu';
import { clamp, exp, float, smoothstep, uv, vec3 } from 'three/tsl';
import type { Vec3 } from '../geo/vec';

/** Distance du soleil (rayons terrestres) : en deçà des étoiles (50) et du plan lointain de la caméra (altitude + 61). */
export const SUN_DISTANCE = 40;
/** Demi-largeur angulaire du sprite (halo compris) ; le disque en occupe le dixième central. */
export const SUN_HALO_DEG = 8;

/**
 * Soleil et son halo (spec §4.2, « autour : champ d'étoiles, soleil et halo ») : sprite additif à SUN_DISTANCE dans la
 * direction du soleil, caché par la Terre (test de profondeur). Sa lumière passe par l'émissif : le bloom l'élargit.
 */
export function createSunDisc(): { sprite: THREE.Sprite; setDirection(dir: Vec3): void } {
  const m = new THREE.SpriteNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const r = uv().sub(0.5).length().mul(2); // 0 au centre, 1 au bord du sprite
  const disc = smoothstep(float(0.1), float(0.07), r);
  const halo = exp(r.mul(-6)).mul(0.6).mul(smoothstep(float(1), float(0.6), r));
  const intensity = disc.mul(4).add(halo);
  m.colorNode = vec3(0, 0, 0);
  // NodeMaterial.setupLighting lit `emissiveNode` sur tout matériau nœud (@types/three ne le déclare que sur les matériaux éclairés).
  (m as THREE.SpriteNodeMaterial & { emissiveNode: unknown }).emissiveNode = vec3(1.0, 0.95, 0.85).mul(intensity);
  m.opacityNode = clamp(intensity, 0, 1);
  const sprite = new THREE.Sprite(m);
  sprite.scale.setScalar(2 * SUN_DISTANCE * Math.tan((SUN_HALO_DEG * Math.PI) / 180));
  return { sprite, setDirection(d) { sprite.position.set(d[0] * SUN_DISTANCE, d[1] * SUN_DISTANCE, d[2] * SUN_DISTANCE); } };
}
