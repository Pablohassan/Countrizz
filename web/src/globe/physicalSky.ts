import * as THREE from 'three/webgpu';
import { context, float, mix, nodeObject, vec3, vec4 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import { aerialPerspective, AtmosphereContext, AtmosphereLight, AtmosphereLightNode, type AtmosphereParameters } from '@takram/three-atmosphere/webgpu';
import { Ellipsoid } from '@takram/three-geospatial';
import { stbnTexture } from '@takram/three-geospatial/webgpu';
import type { Vec3 } from '../geo/vec';
import { atmosphereParameters } from './atmosphere';

/**
 * Atmosphère physique (spec atmosphère §2) : @takram/three-atmosphere (Bruneton + diffusion multiple de Hillaire), sur le
 * backend WebGPU seulement — le repli WebGL 2 garde le halo approché d'atmosphere.ts (tickets #108, #114, #116 de la
 * bibliothèque : erreurs de shader, éclairage faux et erreur au démarrage sous ANGLE). Avec la marche du rayon (sans elle,
 * presque pas de voile bleu), décalée par un bruit généré ici (`jitterVolume`) au lieu du bruit bleu de NVIDIA (#117).
 *
 * Exposition et balance des blancs tirées des paramètres (`skyCalibration`) : la lumière du soleil au sommet de
 * l'atmosphère y vaut (1,91 ; 1,71 ; 1,68) — plus forte et plus rouge que l'ancien soleil directionnel blanc d'intensité 3
 * (image surexposée et virée au pêche au premier essai, 20/10). La lumière est multipliée par `exposure` (même luminance
 * que l'ancien soleil) ; le voile s'applique à l'image divisée puis remultipliée (il est linéaire dans la couleur :
 * c·T + S), puis la balance des blancs ramène le soleil au blanc, sur la surface comme sur le ciel.
 */
export function skyCalibration(p: AtmosphereParameters, oldSun = 3): { exposure: number; whiteBalance: [number, number, number] } {
  const sun = (['x', 'y', 'z'] as const).map((k) => p.solarIrradiance[k] * p.sunRadianceToLuminance[k] * p.luminanceScale);
  const luminance = 0.2126 * sun[0]! + 0.7152 * sun[1]! + 0.0722 * sun[2]!;
  return { exposure: oldSun / luminance, whiteBalance: [sun[1]! / sun[0]!, 1, sun[1]! / sun[2]!] };
}

export interface PhysicalSky {
  readonly context: AtmosphereContext;
  readonly calibration: ReturnType<typeof skyCalibration>;
  /** Lumière du soleil et du ciel, rougie au terminateur (une par globe). */
  createLight(): AtmosphereLight;
  /** Direction du soleil, repère du monde (le repère « ECEF » de la bibliothèque est le monde : matrice identité). */
  setSun(dir: Vec3): void;
  /**
   * Tables calculées (transmittance, diffusion multiple, diffusion, irradiance : quatre événements « update »). La
   * bibliothèque les calcule au premier rendu qui les lit, en tranches sur requestIdleCallback ; avant, la lumière est nulle.
   */
  ready(): Promise<void>;
}

const skies = new WeakMap<THREE.WebGPURenderer, PhysicalSky>();

/**
 * Canal MRT « pays » : part de l'image à garder sans voile. Déclaré par la passe, il se résout à la compilation de chaque
 * matériau : la couverture de la couche pays pour la Terre, 0 pour les autres. (Une MRT posée sur le matériau échoue
 * hors de la passe : rendu sur une cible à une sortie, la structure de sortie WGSL restait vide, 20/10.)
 */
const keepByMaterial = new WeakMap<THREE.Material, Node<'float'>>();
class KeepNode extends THREE.Node {
  constructor() { super('float'); }
  override setup(builder: THREE.NodeBuilder): Node<'float'> {
    return keepByMaterial.get(builder.material) ?? float(0);
  }
}
export const keepNode = nodeObject(new KeepNode()) as unknown as Node<'float'>;
export function setKeep(material: THREE.Material, coverage: Node<'float'>): void { keepByMaterial.set(material, coverage); }

/**
 * Décalage des échantillons de la marche du rayon, au format de la bibliothèque (128 × 128 × 64 octets) : bruit à gradient
 * entrelacé de Jimenez (« Next Generation Post Processing in Call of Duty: Advanced Warfare », SIGGRAPH 2014), le même pour
 * les 64 images (pas de scintillement sans TRAA). Remplace la texture STBN que la bibliothèque télécharge de GitHub
 * (1 Mo, hors ligne impossible, licence NVIDIA discutée : ticket #117).
 */
export function jitterVolume(w = 128, h = 128, d = 64): Uint8Array {
  const out = new Uint8Array(w * h * d);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const f = 52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1);
    const v = Math.min(255, Math.floor((f % 1) * 256));
    for (let z = 0; z < d; z++) out[(z * h + y) * w + x] = v;
  }
  return out;
}
const jitterUrl = () => URL.createObjectURL(new Blob([jitterVolume() as Uint8Array<ArrayBuffer>]));

/** Contexte d'atmosphère du renderer, posé avant toute compilation de matériau ; à appeler une fois par renderer. */
export function installPhysicalSky(renderer: THREE.WebGPURenderer): PhysicalSky {
  const existing = skies.get(renderer);
  if (existing) return existing;
  const ctx = new AtmosphereContext(atmosphereParameters());
  ctx.ellipsoid = new Ellipsoid(1, 1, 1);
  ctx.correctAltitude = false;
  // marche du rayon (défaut de la bibliothèque) : sans elle, la lecture des tables ne donne presque pas de voile bleu sur
  // la surface vue de l'espace, seul le roussissement de la transmittance reste (vu le 20/10)
  ctx.raymarchScattering = true;
  (stbnTexture as unknown as { url: string }).url = jitterUrl();
  renderer.contextNode = context({ ...(renderer.contextNode.value as object), getAtmosphere: () => ctx });
  // types de la bibliothèque écrits pour @types/three 0.183 (update() rend void, 0.186 attend boolean | undefined)
  renderer.library.addLight(AtmosphereLightNode as unknown as Parameters<typeof renderer.library.addLight>[0], AtmosphereLight);
  const ready = new Promise<void>((resolve) => {
    let n = 0;
    (ctx.lutNode as unknown as THREE.EventDispatcher<{ update: object }>).addEventListener('update', () => { if (++n === 4) resolve(); });
  });
  const calibration = skyCalibration(ctx.parameters);
  const sky: PhysicalSky = {
    context: ctx,
    calibration,
    ready: () => ready,
    createLight() { const l = new AtmosphereLight(); l.intensity = calibration.exposure; return l; },
    setSun(dir) { ctx.sunDirectionECEF.value.set(...dir).normalize(); },
  };
  skies.set(renderer, sky);
  return sky;
}

export const physicalSkyOf = (renderer: THREE.WebGPURenderer): PhysicalSky | null => skies.get(renderer) ?? null;

/**
 * Voile et halo (perspective aérienne) sur l'image de la scène ; `keep` (0 → 1) garde l'image d'origine (couche pays :
 * son jaune reste exact, spec atmosphère §2.3). Le ciel (profondeur 1) sans soleil, lune ni étoiles : les nôtres restent.
 */
export function applyAtmosphere(sky: PhysicalSky, camera: THREE.Camera, color: Node<'vec4'>, depth: Node<'vec4'>, keep: Node<'float'>): Node<'vec4'> {
  sky.context.camera = camera;
  const { exposure, whiteBalance } = sky.calibration;
  const ap = aerialPerspective(color.div(exposure), depth as unknown as Node<'float'>);   // la bibliothèque lit depth.r
  ap.correctGeometricError = false;   // elle aplatirait le relief soulevé sur l'ellipsoïde
  const skyNode = ap.skyNode as unknown as ({ showSun: boolean; showMoon: boolean; showStars: boolean } & Node<'vec3'>) | null;
  if (skyNode) {
    skyNode.showSun = false; skyNode.showMoon = false; skyNode.showStars = false;
    // la bibliothèque REMPLACE la couleur par le ciel là où la profondeur vaut 1 ; avec le MSAA, les pixels du bord de la
    // Terre y mêlent Terre et espace : un pointillé sombre longeait le limbe (qualité standard, 20/10). On ajoute le ciel
    // à la couleur : l'espace vide étant noir (ou une étoile), seul le bord change.
    ap.skyNode = (skyNode as Node<'vec3'>).add(color.rgb.div(exposure));
  }
  const hazed = vec4((ap as unknown as Node<'vec4'>).rgb.mul(vec3(...whiteBalance).mul(exposure)), color.a);
  return mix(hazed, color, keep);
}
