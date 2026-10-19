import * as THREE from 'three/webgpu';
import { abs, cameraPosition, clamp, cross, dot, float, max, mix, normalize, output, positionWorld, pow, smoothstep, sqrt, texture, transformNormalToView, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type { Vec3 } from '../geo/vec';
import { exactSpherePoint } from './frameNodes';
import { createImageLayer } from './imageLayer';
import type { createClouds } from './clouds';
import type { GlobeTextures } from './textures';

/**
 * Relief (spec §4.2, « normal map issue de l'altimétrie ») : la texture de surface porte l'altitude GEBCO_08 en R
 * (0 → 6400 m) ; la normale est calculée par différences centrées d'un texel, en distance réelle sur la sphère, puis
 * exagérée. Le `bumpMap` d'avant mesurait la pente à l'échelle du pixel écran : de près, à l'intérieur d'un texel, le
 * relief s'aplatissait (constaté sur les Alpes le 10/10).
 */
export const RELIEF = { exaggeration: 14, size: 4096, metresFull: 6400 } as const;
/** Altitude apparente des nuages pour leur ombre (rayons terrestres, exagérée) : l'ombre glisse à l'opposé du soleil. */
export const CLOUD_SHADOW_HEIGHT = 0.0035;
const EARTH_RADIUS_M = 6_371_000;
/** Plancher de la texture de nuit (fond bleuté de Black Marble), retranché avant le bloom. */
export const NIGHT_FLOOR = 0.045;

/**
 * Terre en couches (spec §4.2) : jour (Sentinel-2, précisé par les photos emboîtées du pays visé), relief, océan (rugosité,
 * reflet du soleil, Fresnel du ciel), nuages et leur ombre, lumières de la face nocturne.
 */
export function createEarthMaterial(t: GlobeTextures, clouds: ReturnType<typeof createClouds> | null = null) {
  const sun = uniform(new THREE.Vector3(1, 0, 0));
  /** Saturation de la texture de jour (1 = telle quelle ; planche de réglage du Sahara). */
  const saturation = uniform(1);
  const material = new THREE.MeshStandardNodeMaterial();
  const spherePoint = exactSpherePoint();
  // Photos emboîtées (spec zoom §4.3) : le niveau courant (0) se pose sur la texture globale, le suivant, plus fin (1), sur lui.
  const images = [createImageLayer(spherePoint), createImageLayer(spherePoint)] as const;
  const [coarse, fine] = images;
  // Mer (1) / terre (0) : masque de la texture de surface (4K), précisé par l'alpha des photos là où elles sont
  // (agrandi ×7 au cadrage d'un petit pays, le masque 4K dessinait des côtes en escalier dans le reflet du soleil).
  const sea = mix(mix(texture(t.surface).g, coarse.sea, coarse.weight), fine.sea, fine.weight);

  // repère local : P (sphère unité, le globe n'est ni tourné ni déplacé), est, nord
  const P = normalize(positionWorld);
  const east = normalize(vec3(P.z, float(0), P.x.negate()).add(vec3(1e-6, 0, 0)));   // + ε : défini aux pôles
  const north = cross(P, east);
  const cosLat = max(sqrt(P.x.mul(P.x).add(P.z.mul(P.z))), 0.05);
  const st = uv();

  // relief : pente est/nord sur un texel de part et d'autre, en rayons terrestres par rayon terrestre
  const du = 1 / RELIEF.size, dv = 2 / RELIEF.size;
  const h = (o: Node<'vec2'>) => texture(t.surface, st.add(o)).r.mul(RELIEF.metresFull / EARTH_RADIUS_M);
  const gE = h(vec2(du, 0)).sub(h(vec2(-du, 0))).div(cosLat.mul(2 * Math.PI * 2 * du));
  const gN = h(vec2(0, dv)).sub(h(vec2(0, -dv))).div(Math.PI * 2 * dv);
  const relief = normalize(P.sub(east.mul(gE).add(north.mul(gN)).mul(RELIEF.exaggeration)));

  // Nuages : blancs et mats par-dessus le sol ; leur ombre tombe décalée à l'opposé du soleil (plus longue au soleil
  // rasant) et assombrit le sol ; ils voilent les lumières des villes.
  const cover = clouds ? clouds.coverageAt(st) : float(0);
  // sous les nuages, pas de relief : les montagnes ne s'ombrent pas à travers eux
  material.normalNode = normalize(transformNormalToView(normalize(mix(relief, P, cover))));
  const sunTangent = sun.sub(P.mul(dot(P, sun)));
  const c = clamp(dot(P, sun), 0.15, 1);
  const shift = normalize(sunTangent.add(vec3(1e-6, 0, 0))).mul(sqrt(c.mul(c).oneMinus()).div(c).mul(CLOUD_SHADOW_HEIGHT));
  const shadowUv = st.add(vec2(dot(shift, east).div(cosLat.mul(2 * Math.PI)), dot(shift, north).div(Math.PI)));
  const shadow = clouds ? clouds.coverageAt(shadowUv) : float(0);
  // L'océan profond est très sombre : on le relève très légèrement.
  const dayTex = texture(t.day), nightTex = texture(t.night);
  const dayRgb = dayTex.rgb;
  const dayColor = mix(vec3(dot(dayRgb, vec3(0.2126, 0.7152, 0.0722))), dayRgb, saturation);
  const photo = mix(mix(dayColor, coarse.color, coarse.weight), fine.color, fine.weight);
  const ground = photo.add(vec3(0.0, 0.012, 0.035).mul(sea)).mul(shadow.mul(0.45).oneMinus());
  material.colorNode = mix(ground, vec3(0.92, 0.92, 0.92), cover);
  material.roughnessNode = mix(mix(float(0.92), float(0.55), sea), float(1), cover);
  material.metalnessNode = float(0);
  const ndl = dot(P, sun);
  const nightSide = smoothstep(float(0.05), float(-0.15), ndl);
  // Black Marble a un fond bleuté hors des villes : avec un bloom sans seuil, il voilait toute la face de nuit de mauve
  // (constaté le 10/10, lever de soleil derrière le limbe). On retranche ce plancher : seules les villes brillent.
  material.emissiveNode = max(nightTex.rgb.sub(NIGHT_FLOOR), 0).mul(1.6 / (1 - NIGHT_FLOOR)).mul(nightSide).mul(cover.mul(0.6).oneMinus());

  // Voile atmosphérique (diffusion de Rayleigh approchée) : bleu de jour, orangé au crépuscule ; épaissit vers le limbe.
  // Reflet du ciel sur l'océan (Fresnel de Schlick). Posés avant la couche pays : le jaune du pays reste exact, et hors
  // de l'émissif : le bloom ne les prend pas.
  const day = clamp(ndl.mul(1.5).add(0.25), 0, 1);
  const view = normalize(cameraPosition.sub(positionWorld));
  const ndv = clamp(abs(dot(P, view)), 0, 1);   // borné : pow(1 − x) d'un x > 1 rendrait NaN, et le bloom l'étalerait
  const grazing = pow(float(1).sub(ndv), float(3));
  const dusk = smoothstep(float(-0.12), float(0.35), ndl);
  const veilColor = mix(vec3(1.0, 0.55, 0.25), vec3(0.32, 0.55, 1.0), dusk);
  const veil = day.mul(grazing.mul(0.35).add(0.03));
  const fresnel = pow(float(1).sub(ndv), float(5)).mul(0.98).add(0.02);
  const sky = vec3(0.3, 0.52, 0.95).mul(day).mul(sea).mul(cover.oneMinus()).mul(fresnel).mul(0.55);
  const base = vec4(mix(output.rgb, veilColor.mul(day.mul(0.9).add(0.1)), veil).add(sky), output.a);
  return {
    material, base: base as Node<'vec4'>, images, setSun(dir: Vec3) { sun.value.set(...dir); }, setSaturation(s: number) { saturation.value = s; },
    /** Repli de qualité (spec zoom §5 bis) : jour et nuit remplacés sans recompiler le matériau. */
    setDayNight(day: THREE.Texture, night: THREE.Texture) { dayTex.value = day; nightTex.value = night; },
  };
}
