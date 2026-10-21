import * as THREE from 'three/webgpu';
import { abs, asin, atan, cameraPosition, clamp, cross, dot, float, fwidth, length, max, mix, normalize, normalLocal, output, positionLocal, positionWorld, pow, smoothstep, sqrt, texture, transformNormalToView, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type { Vec3 } from '../geo/vec';
import { exactSpherePoint } from './frameNodes';
import { createImageLayer } from './imageLayer';
import { pixelFootprint, SEAWATER_IOR, seaRoughness, waveSlopes, windNode } from './ocean';
import { createLift, liftHeight, RELIEF_LIFT } from './relief';
import { cloudRelief, silverLining, type createClouds } from './clouds';
import { exposureGainNode } from './spotlight';
import type { GlobeTextures } from './textures';

/**
 * Relief (spec §4.2, « normal map issue de l'altimétrie ») : la texture de surface porte l'altitude GEBCO_2026 en R
 * (0 → 8850 m, spec océan §2.2) ; la normale est calculée par différences centrées d'un texel, en distance réelle sur la sphère, puis
 * exagérée. Le `bumpMap` d'avant mesurait la pente à l'échelle du pixel écran : de près, à l'intérieur d'un texel, le
 * relief s'aplatissait (constaté sur les Alpes le 10/10).
 */
export const RELIEF = { exaggeration: 14, size: 4096, metresFull: RELIEF_LIFT.metresFull } as const;
/**
 * Grossissement (pixels par texel de relief) entre lequel le relief s'efface (19/10, zoom et images de près) : au cadrage
 * serré d'un petit pays, un texel de 4K (≈ 10 km) couvre une bonne part de l'écran et sa pente, exagérée, assombrissait
 * en bloc un quart de la vue de Monaco ; les photos portent déjà leur propre ombrage du relief.
 */
export const RELIEF_MAGNIFY = { from: 2, to: 4 } as const;
/** Estompage du pays visé : exagération des pentes, bornes du facteur d'ombrage, part appliquée. */
export const HILLSHADE = { exaggeration: 20, min: 0.6, max: 1.4, strength: 0.5 } as const;
const EARTH_RADIUS_M = 6_371_000;
/** Plancher de la texture de nuit (fond bleuté de Black Marble), retranché avant le bloom. */
export const NIGHT_FLOOR = 0.045;

/**
 * Terre en couches (spec §4.2) : jour (Sentinel-2, précisé par les photos emboîtées du pays visé), relief, océan (rugosité,
 * reflet du soleil, Fresnel du ciel), nuages et leur ombre, lumières de la face nocturne.
 */
export function createEarthMaterial(t: GlobeTextures, clouds: ReturnType<typeof createClouds> | null = null, physicalSky = false) {
  const sun = uniform(new THREE.Vector3(1, 0, 0));
  /** Saturation de la texture de jour (1 = telle quelle ; planche de réglage du Sahara). */
  const saturation = uniform(1);
  // Physique (et non Standard) pour l'indice de réfraction : l'eau de mer réfléchit F0 = 0,02, la terre garde 0,04 (ior 1,5).
  const material = new THREE.MeshPhysicalNodeMaterial();
  // Relief soulevé (spec océan §2) : la boule monte de l'altitude × 10, et redevient la sphère exacte au cadrage serré.
  const lift = createLift();
  material.positionNode = positionLocal.add(normalLocal.mul(liftHeight(t.surface, uv()).mul(lift)));
  // Point lu par les photos et le pays : la sphère exacte de près (précision au texel), le point dessiné quand le relief
  // est soulevé (sinon la photo glisserait sous les montagnes).
  const spherePoint = mix(exactSpherePoint(), normalize(positionWorld), lift);
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
  const reliefMagnify = float((2 * Math.PI) / RELIEF.size).div(max(length(fwidth(positionWorld)), 1e-7));
  const reliefShown = smoothstep(float(RELIEF_MAGNIFY.from), float(RELIEF_MAGNIFY.to), reliefMagnify).oneMinus();
  const relief = normalize(mix(P, normalize(P.sub(east.mul(gE).add(north.mul(gN)).mul(RELIEF.exaggeration))), reliefShown));
  // Estompage cartographique du pays visé (spec mise en avant §1) : lumière du nord-ouest (azimut 315°, hauteur 45°), 1 sur le
  // plat ; effacé au fort grossissement comme le relief.
  const shadeN = normalize(vec3(gE.mul(-HILLSHADE.exaggeration), gN.mul(-HILLSHADE.exaggeration), 1));
  const hillshade = mix(float(1), clamp(dot(shadeN, vec3(-0.5, 0.5, Math.SQRT1_2)).div(Math.SQRT1_2), HILLSHADE.min, HILLSHADE.max), reliefShown.mul(HILLSHADE.strength));

  // Mer (spec océan §1.2–1.3) : vent par latitude (rugosité de Cox et Munk), vagues qui glissent en approchant.
  const latDeg = asin(clamp(P.y, -1, 1)).mul(180 / Math.PI), lngRad = atan(P.z.negate(), P.x);
  const wind = windNode(latDeg, lngRad);
  const waves = t.waves ? waveSlopes(t.waves, st, pixelFootprint(positionWorld)) : null;
  const seaNormal = waves ? normalize(P.sub(east.mul(waves.slope.x).add(north.mul(waves.slope.y)))) : P;
  const surfaceNormal = mix(relief, seaNormal, sea);

  // Nuages en relief (spec nuages §3) : blancs et mats, vus en parallaxe à la hauteur de leur sommet, modelés par le soleil
  // et ombrés l'un par l'autre ; leur ombre tombe là où le rayon du soleil les traverse ; ils voilent les lumières des villes.
  const view = normalize(cameraPosition.sub(positionWorld));
  const sky3d = clouds ? cloudRelief(clouds, { P, east, north, cosLat, st }, view, sun, lift) : null;
  const cover = sky3d ? sky3d.cover : float(0);
  // sous les nuages, pas de relief du sol : les montagnes ne s'ombrent pas à travers eux
  material.normalNode = normalize(transformNormalToView(normalize(mix(surfaceNormal, sky3d ? sky3d.normal : P, cover))));
  const shadow = sky3d ? sky3d.shadow : float(0);
  // L'océan profond est très sombre : on le relève très légèrement.
  const dayTex = texture(t.day), nightTex = texture(t.night);
  const dayRgb = dayTex.rgb;
  const dayColor = mix(vec3(dot(dayRgb, vec3(0.2126, 0.7152, 0.0722))), dayRgb, saturation);
  const photo = mix(mix(dayColor, coarse.color, coarse.weight), fine.color, fine.weight);
  const ground = photo.add(vec3(0.0, 0.012, 0.035).mul(sea)).mul(shadow.mul(0.45).oneMinus());
  material.colorNode = mix(ground, vec3(0.92, 0.92, 0.92).mul(sky3d ? sky3d.shade : float(1)), cover);
  material.roughnessNode = mix(mix(float(0.92), seaRoughness(wind, waves ? waves.shown : float(0)), sea), float(1), cover);
  material.iorNode = mix(float(1.5), float(SEAWATER_IOR), sea);
  material.metalnessNode = float(0);
  const ndl = dot(P, sun);
  const nightSide = smoothstep(float(0.05), float(-0.15), ndl);
  // Black Marble a un fond bleuté hors des villes : avec un bloom sans seuil, il voilait toute la face de nuit de mauve
  // (constaté le 10/10, lever de soleil derrière le limbe). On retranche ce plancher : seules les villes brillent.
  material.emissiveNode = max(nightTex.rgb.sub(NIGHT_FLOOR), 0).mul(1.6 / (1 - NIGHT_FLOOR)).mul(nightSide).mul(cover.mul(0.6).oneMinus())
    .add(silverLining(cover, P, view, sun));

  // Voile atmosphérique (diffusion de Rayleigh approchée) : bleu de jour, orangé au crépuscule ; épaissit vers le limbe.
  // Reflet du ciel sur l'océan (Fresnel de Schlick). Posés avant la couche pays : le jaune du pays reste exact, et hors
  // de l'émissif : le bloom ne les prend pas.
  const day = clamp(ndl.mul(1.5).add(0.25), 0, 1);
  const ndv = clamp(abs(dot(P, view)), 0, 1);   // borné : pow(1 − x) d'un x > 1 rendrait NaN, et le bloom l'étalerait
  const grazing = pow(float(1).sub(ndv), float(3));
  const dusk = smoothstep(float(-0.12), float(0.35), ndl);
  const veilColor = mix(vec3(1.0, 0.55, 0.25), vec3(0.32, 0.55, 1.0), dusk);
  const veil = day.mul(grazing.mul(0.35).add(0.03));
  const fresnel = pow(float(1).sub(ndv), float(5)).mul(0.98).add(0.02);
  const sky = vec3(0.3, 0.52, 0.95).mul(day).mul(sea).mul(cover.oneMinus()).mul(fresnel).mul(0.55);
  // Atmosphère physique (spec atmosphère §2.2) : le voile vient de la perspective aérienne, en post-traitement.
  const base = physicalSky ? vec4(output.rgb.add(sky), output.a) : vec4(mix(output.rgb, veilColor.mul(day.mul(0.9).add(0.1)), veil).add(sky), output.a);
  // Exposition locale du pays visé tirée de sa photo (spec mise en avant §2, « éclaircir les ombres » du tirage) : luminance des
  // terres autour du point d'après la moyenne locale et la part de mer (mer comptée à 0,03) ; sans photo, 1.
  const meanLum = dot(coarse.localMean, vec3(0.2126, 0.7152, 0.0722));
  const landLum = max(meanLum.sub(coarse.localSea.mul(0.03)), 0).div(max(coarse.localSea.oneMinus(), 0.05));
  const exposure = mix(float(1), exposureGainNode(landLum), coarse.weight);
  return {
    material, base: base as Node<'vec4'>, images, point: spherePoint as Node<'vec3'>,
    /** Éclairage du pays visé (couche pays) : estompage et exposition. */
    spot: { hillshade: hillshade as Node<'float'>, exposure: exposure as Node<'float'> },
    /** Part du relief soulevé (0 → sphère exacte, 1 → altitude × 10), posée à chaque pose (relief.ts, liftFactor). */
    setLift(f: number) { lift.value = f; }, setSun(dir: Vec3) { sun.value.set(...dir); }, setSaturation(s: number) { saturation.value = s; },
    /** Repli de qualité (spec zoom §5 bis) : jour et nuit remplacés sans recompiler le matériau. */
    setDayNight(day: THREE.Texture, night: THREE.Texture) { dayTex.value = day; nightTex.value = night; },
  };
}
