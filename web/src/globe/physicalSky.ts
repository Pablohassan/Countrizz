import * as THREE from 'three/webgpu';
import { abs, context, float, floor, fract, mix, nodeObject, rtt, select, uv, vec2, vec3, vec4 } from 'three/tsl';
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
  /**
   * Contexte de T (la transmittance seule) : mêmes tables et paramètres, SANS la marche du rayon — la transmittance est lue
   * dans sa table (Bruneton), intégrée finement au démarrage. La marche (2 à 6 pas) y coûtait presque tout le prix de
   * l'atmosphère (analyse du manque de fluidité sur téléphone, 23/10). S, la lumière diffusée, la garde : sans elle, presque
   * pas de voile bleu (20/10).
   */
  readonly transmittanceContext: AtmosphereContext;
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
  ctx.scatteringSampleCount.value.set(...SKY_STEPS);
  (stbnTexture as unknown as { url: string }).url = jitterUrl();
  renderer.contextNode = context({ ...(renderer.contextNode.value as object), getAtmosphere: () => ctx });
  // types de la bibliothèque écrits pour @types/three 0.183 (update() rend void, 0.186 attend boolean | undefined)
  renderer.library.addLight(AtmosphereLightNode as unknown as Parameters<typeof renderer.library.addLight>[0], AtmosphereLight);
  const ready = new Promise<void>((resolve) => {
    let n = 0;
    (ctx.lutNode as unknown as THREE.EventDispatcher<{ update: object }>).addEventListener('update', () => { if (++n === 4) resolve(); });
  });
  const tctx = new AtmosphereContext(ctx.parameters, ctx.lutNode);
  tctx.ellipsoid = ctx.ellipsoid;
  tctx.correctAltitude = false;
  tctx.raymarchScattering = false;
  const calibration = skyCalibration(ctx.parameters);
  const sky: PhysicalSky = {
    context: ctx,
    transmittanceContext: tctx,
    calibration,
    ready: () => ready,
    createLight() { const l = new AtmosphereLight(); l.intensity = calibration.exposure; return l; },
    setSun(dir) { ctx.sunDirectionECEF.value.set(...dir).normalize(); tctx.sunDirectionECEF.value.copy(ctx.sunDirectionECEF.value); },
  };
  skies.set(renderer, sky);
  return sky;
}

export const physicalSkyOf = (renderer: THREE.WebGPURenderer): PhysicalSky | null => skies.get(renderer) ?? null;

/**
 * Échelle de résolution (par axe) du calcul de l'atmosphère : le voile varie lentement, il est calculé sur un quart des
 * pixels puis étiré. À pleine résolution, il faisait tomber la densité de rendu (démo, GPU du Mac, 21/10 : densité entre
 * 1,00 et 1,75 contre 2,00 avec le halo approché) — le flou constaté sur téléphone. Prix accepté : l'anneau orange très
 * fin du lever de soleil derrière la Terre s'amincit (3 401 pixels orangés contre 5 977 à pleine résolution, 21/10).
 */
export const SKY_RESOLUTION = 0.5;
/**
 * Pas de la marche du rayon (au plus près, au plus loin ; 4 et 14 par défaut). Avec la demi-résolution, (2, 6) garde la
 * densité de rendu à 2 dans la démo (21/10) pour une image presque identique : écart moyen de 0,04 à 0,17 sur 255 au limbe,
 * en vue globale et au terminateur. Au quart de résolution, des taches claires longeaient le limbe.
 */
export const SKY_STEPS: [number, number] = [2, 6];

/**
 * Agrandissement des deux calculs réduits sans baver au limbe : pour chaque pixel, seuls les quatre texels réduits voisins
 * de même nature (ciel ou sol, d'après la profondeur lue à leur centre) comptent, avec leur poids bilinéaire. Un mélange
 * des deux traçait une marche d'escalier claire et sombre le long du limbe (qualité standard, 21/10). Aucun voisin de même
 * nature : la lecture bilinéaire simple.
 */
function upsampleBySky(lowS: THREE.TextureNode, lowT: THREE.TextureNode, depth: THREE.TextureNode) {
  const size = vec2(lowS.size(float(0)) as unknown as Node<'ivec2'>);
  const p = uv().mul(size).sub(0.5), i0 = floor(p), f = fract(p);
  const isSky = (u: Node<'vec2'>) => select(depth.sample(u).r.greaterThanEqual(1), float(1), float(0));
  const here = isSky(uv());
  let S: Node<'vec3'> = vec3(0), T: Node<'vec3'> = vec3(0), w: Node<'float'> = float(0);
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    const u = i0.add(vec2(dx, dy)).add(0.5).div(size);
    const bilinear = (dx ? f.x : f.x.oneMinus()).mul(dy ? f.y : f.y.oneMinus());
    const k = bilinear.mul(float(1).sub(abs(isSky(u).sub(here))));
    S = S.add(lowS.sample(u).rgb.mul(k));
    T = T.add(lowT.sample(u).rgb.mul(k));
    w = w.add(k);
  }
  const ok = w.greaterThan(1e-4);
  return { S: select(ok, S.div(w), lowS.rgb), T: select(ok, T.div(w), lowT.rgb) };
}

/**
 * Voile et halo (perspective aérienne) sur l'image de la scène ; `keep` (0 → 1) garde l'image d'origine (couche pays :
 * son jaune reste exact, spec atmosphère §2.3). Le ciel (profondeur 1) sans soleil, lune ni étoiles : les nôtres restent.
 *
 * Calcul à résolution réduite, en deux passes (le voile est linéaire dans la couleur, c·T + S) : S, la lumière diffusée
 * (couleur noire ; le ciel là où la profondeur vaut 1), et T, la transmittance (couleur blanche, sans diffusion ; T = 1 sur
 * le ciel, qui s'ajoute donc à la couleur — les pixels de bord du limbe mêlent Terre et espace). L'image nette garde sa
 * pleine résolution : c·T + S·E, puis la balance des blancs.
 */
export function applyAtmosphere(sky: PhysicalSky, camera: THREE.Camera, color: Node<'vec4'>, depth: Node<'vec4'>, keep: Node<'float'>): Node<'vec4'> {
  sky.context.camera = camera;
  sky.transmittanceContext.camera = camera;
  const { exposure, whiteBalance } = sky.calibration;
  const d = depth as unknown as Node<'float'>;   // la bibliothèque lit depth.r
  const scattered = aerialPerspective(vec4(0, 0, 0, 1), d);
  scattered.correctGeometricError = false;   // elle aplatirait le relief soulevé sur l'ellipsoïde
  const skyNode = scattered.skyNode as unknown as { showSun: boolean; showMoon: boolean; showStars: boolean } | null;
  if (skyNode) { skyNode.showSun = false; skyNode.showMoon = false; skyNode.showStars = false; }
  const transmitted = aerialPerspective(vec4(1, 1, 1, 1), d);
  transmitted.correctGeometricError = false;
  transmitted.inscattering = false;
  transmitted.skyNode = null;
  // types de la bibliothèque écrits pour @types/three 0.183 (setup() rend unknown)
  const lowS = rtt(scattered as unknown as Node<'vec4'>, null, null, { resolutionScale: SKY_RESOLUTION });
  // T se construit dans son contexte : la transmittance lue dans la table, sans marche du rayon
  const lowT = rtt((transmitted as unknown as Node<'vec4'>).context({ getAtmosphere: () => sky.transmittanceContext }) as unknown as Node<'vec4'>, null, null, { resolutionScale: SKY_RESOLUTION });
  const { S, T } = upsampleBySky(lowS, lowT, depth as unknown as THREE.TextureNode);
  const hazed = vec4(color.rgb.mul(T).add(S.mul(exposure)).mul(vec3(...whiteBalance)), color.a);
  return mix(hazed, color, keep);
}
