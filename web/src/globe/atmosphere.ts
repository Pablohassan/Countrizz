import * as THREE from 'three/webgpu';
import { cameraPosition, clamp, cross, dot, exp, float, length, max, normalize, positionWorld, pow, smoothstep, uniform, vec3 } from 'three/tsl';
import { AtmosphereParameters } from '@takram/three-atmosphere/webgpu';
import type { Vec3 } from '../geo/vec';

/**
 * Atmosphère physique (spec atmosphère §1) : unité du monde = rayon terrestre ; épaisseur exagérée `thickness` fois
 * (hauteurs d'échelle et sommet), coefficients divisés d'autant : même épaisseur optique, donc mêmes couleurs.
 */
export const ATMOSPHERE = { thickness: 10, earthM: 6_371_000 } as const;

/** Paramètres de @takram/three-atmosphere ramenés au globe unité (la bibliothèque les suppose en mètres du monde). */
export function atmosphereParameters(thickness: number = ATMOSPHERE.thickness): AtmosphereParameters {
  const p = new AtmosphereParameters();
  const len = thickness / ATMOSPHERE.earthM, inv = 1 / len;   // mètres → rayons terrestres, exagérés
  const top = p.topRadius - p.bottomRadius;
  p.worldToUnit = ATMOSPHERE.earthM / 1000;                   // rayons → km, l'unité interne
  p.bottomRadius = 1;
  p.topRadius = 1 + top * len;
  for (const d of [p.rayleighDensity, p.mieDensity, p.absorptionDensity]) {
    for (const l of d.layers) { l.width *= len; l.expScale *= inv; l.linearTerm *= inv; }
  }
  for (const v of [p.rayleighScattering, p.mieScattering, p.mieExtinction, p.absorptionExtinction]) v.multiplyScalar(inv);
  return p;
}

/** Rayon extérieur de la coquille d'atmosphère (rayons terrestres). */
const SHELL = 1.06;
/** Extinction de Rayleigh relative (∝ λ⁻⁴ pour 680, 550, 440 nm), normalisée sur le bleu : elle rougit le soleil rasant. */
const BETA = [0.18, 0.42, 1.0] as const;
/** Couleur diffusée, celle du halo de jour d'avant (bleu franc) ; × la lumière rougie = orangé au crépuscule. */
const SKY = [0.3, 0.55, 1.0] as const;

/**
 * Halo de limbe (spec §4.2) : diffusion simple approchée, sur une sphère arrière additive. Pour chaque rayon de vue :
 * densité tirée de sa distance h au centre (maximale au ras du limbe, nulle au bord de la coquille) ; lumière du
 * soleil reçue au point le plus proche, rougie par la masse d'air (longue au ras du terminateur : orangé du crépuscule) ;
 * phase de Rayleigh (bleu du jour) et pic de Mie vers le soleil (halo chaud quand il est derrière le limbe).
 * Avec une intensité tirée de la normale de la coquille, l'anneau se détachait du limbe (bande sombre, constaté).
 */
export function createAtmosphere(): { mesh: THREE.Mesh; setSun(dir: Vec3): void } {
  const sun = uniform(new THREE.Vector3(1, 0, 0));
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const ray = normalize(positionWorld.sub(cameraPosition));
  const h = length(cross(cameraPosition, ray));
  const density = pow(clamp(float(SHELL).sub(h).div(SHELL - 1), 0, 1), float(2.2));
  // point du rayon le plus proche du centre : c'est lui qui décide jour, crépuscule ou nuit
  const closest = normalize(cameraPosition.sub(ray.mul(dot(cameraPosition, ray))));
  const mu = dot(closest, sun);
  const beta = vec3(...BETA);
  const airMass = float(1).div(max(mu, 0).add(0.12));
  // seul l'air en plus du trajet vertical rougit le soleil : le jour reste bleu franc, le soleil rasant devient orangé
  const sunlight = exp(beta.mul(max(airMass.sub(1), 0)).mul(-0.9));
  const lit = smoothstep(float(-0.24), float(0.06), mu);                  // le crépuscule déborde un peu sur la nuit
  const cosT = dot(ray, sun);
  // trajet long au ras du terminateur : plus de lumière diffusée (racine de la masse d'air)
  const rayleigh = vec3(...SKY).mul(cosT.mul(cosT).add(1).mul(0.75)).mul(pow(airMass, float(0.8))).mul(1.05);
  const g = 0.78;
  const mie = float((1 - g * g) * 0.035).div(pow(max(float(1 + g * g).sub(cosT.mul(2 * g)), 1e-4), float(1.5)));
  material.colorNode = rayleigh.add(vec3(mie)).mul(sunlight).mul(lit).mul(density);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SHELL, 128, 64), material);
  return { mesh, setSun(dir) { sun.value.set(...dir); } };
}
