import type * as THREE from 'three/webgpu';
import { dot, float, fwidth, length, max, normalize, positionWorld, smoothstep, sqrt, texture, uniform, vec2, vec3 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import { RELIEF_LIFT } from './relief';

/**
 * Grossissement (pixels par texel de nuages) entre lequel les nuages s'effacent : au-delà de 3, les blocs de la
 * compression ETC1S se voyaient en carrés nets pendant la fin de la descente vers un petit pays (03/10, revue finale).
 */
export const CLOUD_MAGNIFY = { from: 1.5, to: 3 } as const;

/** Effacement des nuages à l'arrivée sur un pays, et retour au vol suivant. */
export const CLOUD_FADE_MS = 800;
/** Dérive vers l'est, en tours par seconde (un tour en 30 min : perceptible au repos, imperceptible pendant une question). */
export const CLOUD_DRIFT_TURNS_PER_S = 1 / 1800;

/**
 * Nuages en relief (spec nuages §3) : la texture porte la hauteur du sommet en alpha (0 → 16 km, d'après l'infrarouge
 * GMGSI), exagérée comme le relief. `minCos` borne la visée rasante de la parallaxe ; `normalGain` règle le modelé, lu
 * au niveau de mipmap `shapeLevel` (1024 texels sur un tour : le grain de 4K froissait les nuages comme du papier, 20/10) ;
 * `sunSteps` (rad) sont les pas de l'ombre portée d'un nuage sur un autre, `selfShadow` son assombrissement.
 */
export const CLOUD_RELIEF = { exaggeration: RELIEF_LIFT.exaggeration, topKm: 16, minCos: 0.3, normalGain: 0.35, shapeLevel: 2, sunSteps: [0.004, 0.01, 0.02], selfShadow: 0.45, shadowSoftness: 0.006 } as const;
/** Sommet le plus haut (rayons terrestres), exagéré. */
export const CLOUD_TOP_MAX = (CLOUD_RELIEF.exaggeration * CLOUD_RELIEF.topKm * 1000) / 6_371_000;

/** Décalage horizontal (rad) où la ligne de visée de cosinus `cosView` passe à l'altitude `z` : z · tan θ, borné. */
export function parallaxShift(z: number, cosView: number): number {
  const c = Math.max(cosView, CLOUD_RELIEF.minCos);
  return (z * Math.sqrt(1 - c * c)) / c;
}

export interface CloudFade { from: number; to: number; atMs: number }

/** Opacité à l'instant `nowMs` : de `from` à `to` en CLOUD_FADE_MS (courbe lissée), puis constante. */
export function cloudOpacity(f: CloudFade, nowMs: number): number {
  const t = Math.min(1, Math.max(0, (nowMs - f.atMs) / CLOUD_FADE_MS));
  return f.from + (f.to - f.from) * t * t * (3 - 2 * t);
}

/**
 * Nuages (spec §4.2) : couche séparée — leur texture, leur dérive, leur opacité — lue DANS le matériau de la Terre.
 * Une coque transparente au-dessus du globe écrasait la cible « émissif » du rendu multiple et éteignait le bloom des
 * villes (constaté le 03/10) ; à 25 km d'altitude, la parallaxe qu'elle apportait est invisible au cadrage du jeu.
 */
export function createClouds(tex: THREE.Texture) {
  const opacity = uniform(1), drift = uniform(0);
  // Texel de nuages (rad, sens des latitudes) contre empreinte du pixel sur la sphère unité, mesurée sur la position et
  // non sur les uv (la couture u = 0/1 y ferait sauter la dérivée).
  const texelRad = (2 * Math.PI) / ((tex.image as { width?: number } | undefined)?.width ?? 4096);
  const magnify = float(texelRad).div(max(length(fwidth(positionWorld)), 1e-7));
  const visible = smoothstep(float(CLOUD_MAGNIFY.from), float(CLOUD_MAGNIFY.to), magnify).oneMinus();
  return {
    /**
     * Couverture (0 → 1) au point de coordonnées sphériques `u` ; la dérive décale la lecture vers l'ouest : le motif
     * avance vers l'est. Effacée en gros plan (CLOUD_MAGNIFY).
     */
    coverageAt: (u: Node<'vec2'>) => texture(tex, u.sub(vec2(drift, 0))).r.mul(opacity).mul(visible),
    /** Couverture (comme `coverageAt`) et hauteur du sommet (0 → 1) d'une même lecture. */
    at(u: Node<'vec2'>) {
      const s = texture(tex, u.sub(vec2(drift, 0)));
      return { cover: s.r.mul(opacity).mul(visible), top: s.a };
    },
    /** Couverture × hauteur (0 → 1) lue au niveau de mipmap `level` (formes adoucies, sans dérivée d'écran). */
    shapeAt(u: Node<'vec2'>, level: number) {
      const s = texture(tex, u.sub(vec2(drift, 0))).level(float(level));
      return s.r.mul(s.a).mul(opacity).mul(visible);
    },
    set(o: number, d: number) { opacity.value = o; drift.value = d; },
  };
}

/** Repère local du point P de la sphère unité (est, nord, cos de la latitude) et coordonnées de texture `st`. */
export interface CloudFrame { P: Node<'vec3'>; east: Node<'vec3'>; north: Node<'vec3'>; cosLat: Node<'float'>; st: Node<'vec2'> }

/**
 * Nuages en relief au point P (spec nuages §3) : parallaxe vers la caméra `view` (deux itérations), modelé du sommet,
 * ombre d'un nuage sur l'autre vers le soleil `sun`, et ombre au sol avec la hauteur lue. `lift` (0 → 1) efface la
 * hauteur au cadrage serré, comme le relief.
 */
export function cloudRelief(clouds: ReturnType<typeof createClouds>, f: CloudFrame, view: Node<'vec3'>, sun: Node<'vec3'>, lift: Node<'float'>) {
  const { P, east, north, cosLat, st } = f;
  // déplacement tangent (rad, sur la sphère unité) → décalage des coordonnées de texture
  const toUv = (d: Node<'vec3'>) => vec2(dot(d, east).div(cosLat.mul(2 * Math.PI)), dot(d, north).div(Math.PI));
  const along = (dir: Node<'vec3'>, cosA: Node<'float'>) => {
    const c = max(cosA, CLOUD_RELIEF.minCos);
    const t = normalize(dir.sub(P.mul(dot(P, dir))).add(vec3(1e-6, 0, 0)));
    const tan = sqrt(c.mul(c).oneMinus()).div(c);
    return (z: Node<'float'>) => st.add(toUv(t.mul(z.mul(tan))));
  };
  const zMax = float(CLOUD_TOP_MAX).mul(lift);
  // parallaxe : on part de la mi-hauteur, puis de la hauteur lue
  const towardView = along(view, dot(P, view));
  const first = clouds.at(towardView(zMax.mul(0.5)));
  const uvC = towardView(first.top.mul(zMax));
  const here = clouds.at(uvC);
  // modelé : pente de couverture × hauteur (exagérée, sans le facteur `lift` : le relief des nuages reste lisible de près)
  const field = (u: Node<'vec2'>) => clouds.shapeAt(u, CLOUD_RELIEF.shapeLevel).mul(CLOUD_TOP_MAX);
  const step = (2 * 2 * Math.PI) / (4096 >> CLOUD_RELIEF.shapeLevel);
  const f0 = field(uvC);
  const gE = field(uvC.add(vec2(float(step / (2 * Math.PI)).div(cosLat), 0))).sub(f0).div(step);
  const gN = field(uvC.add(vec2(0, step / Math.PI))).sub(f0).div(step);
  const normal = normalize(P.sub(east.mul(gE).add(north.mul(gN)).mul(CLOUD_RELIEF.normalGain)));
  // ombre d'un nuage sur l'autre : le rayon vers le soleil monte de tan(élévation) par radian parcouru
  const sinE = max(dot(P, sun), 0.05);
  const rise = sinE.div(sqrt(sinE.mul(sinE).oneMinus()));
  const sunT = normalize(sun.sub(P.mul(dot(P, sun))).add(vec3(1e-6, 0, 0)));
  let occ: Node<'float'> = float(0);
  for (const d of CLOUD_RELIEF.sunSteps) {
    const above = field(uvC.add(toUv(sunT.mul(d)))).sub(f0.add(rise.mul(d)));
    occ = max(occ, smoothstep(float(0), float(CLOUD_RELIEF.shadowSoftness), above));
  }
  // ombre au sol : le nuage traversé par le rayon du soleil, à la hauteur lue (deux itérations)
  const towardSun = along(sun, max(dot(P, sun), 0.15));
  const s1 = clouds.at(towardSun(zMax.mul(0.5)));
  const shadow = clouds.at(towardSun(s1.top.mul(zMax))).cover;
  return { cover: here.cover, normal, shade: occ.mul(CLOUD_RELIEF.selfShadow).oneMinus(), shadow };
}
