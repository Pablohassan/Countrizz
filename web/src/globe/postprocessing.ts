import * as THREE from 'three/webgpu';
import { emissive, mrt, output, pass, renderOutput } from 'three/tsl';
import { applyAtmosphere, keepNode, physicalSkyOf, SKY_RESOLUTION } from './physicalSky';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';

/**
 * `bloom.strength` à 0 : pas de bloom du tout (ni ses passes, ni la sortie émissive) ; `bloom.scale` : sa résolution ;
 * `skyScale` : résolution du calcul de l'atmosphère (réglages de la sonde, mesures du 06/11) ; `smaa` : antialias de fin de
 * chaîne avec l'atmosphère physique.
 */
export interface PostOptions { bloom: { strength: number; radius: number; threshold: number; scale: number }; msaa: number; toneMapping: THREE.ToneMapping; skyScale: number; smaa: boolean }

/**
 * Les mêmes aux deux niveaux (spec §4.1 amendée le 06/11) : bloom de l'émissif (lumières des villes, soleil), au quart de la
 * résolution (sa lueur est large : écart moyen 0,42 sur 255 au lever de soleil), puis antialias. Plus de TRAA en « haute » :
 * le SMAA rend une image plus nette pour moins cher (en vol, 3,33 → 3,11 ms par image, GPU du Mac au format du Pixel 9), et le repli « sans TRAA » disparaît avec lui. Sortie en tone mapping Neutral (planche du 10/10, choix de
 * l'utilisateur) : il garde les teintes de base (jaune pays mesuré #d7d12c sans, #d3cd0f avec ; AgX le délavait en
 * #bdb56b) et creuse les mers. Appliqué dans la chaîne : le prop `flat` de R3F laisse le renderer sans tone mapping.
 */
export function postOptions(screenDpr = 1): PostOptions {
  return { bloom: { strength: 0.3, radius: 0.4, threshold: 0, scale: BLOOM_RESOLUTION }, msaa: 4, toneMapping: THREE.NeutralToneMapping, skyScale: SKY_RESOLUTION, smaa: screenDpr < SMAA_BELOW_DPR };
}

/**
 * Densité d'écran (`devicePixelRatio`) à partir de laquelle le SMAA ne sert plus : au format du Pixel 9 (densité 2,5), rien de
 * visible sans lui (écart moyen 0,10 à 0,17 sur 255 selon la scène) pour 0,28 ms sur 2,24 en vol (GPU du Mac, 06/11). Lue
 * une fois, sur l'écran : la densité de rendu, elle, bouge avec la résolution dynamique, et changer d'antialias recompilerait.
 */
export const SMAA_BELOW_DPR = 2;

/** Résolution du bloom (par axe) : 0,5 jusqu'au 06/11 (défaut de three). */
export const BLOOM_RESOLUTION = 0.25;

/**
 * Précompilations une à la fois (03/11) : celle de three pose la cible de la passe et ses sorties MRT sur le renderer,
 * attend, puis remet ce qu'elle avait trouvé. Deux à la fois (l'avion monté sous la vidéo en relance une), la seconde
 * trouvait la cible de la première et la remettait : le renderer y restait, le quad de sortie se compilait pour elle, refusé
 * par le GPU, et chaque image avec lui (pas de Terre sous l'accueil). Les demandes faites pendant une compilation n'en font
 * qu'une, après elle ; `enCours` : le rendu attend (une image rendue pendant l'attente le serait dans la cible de la passe).
 */
export function precompilation(compile: () => Promise<void>) {
  let courante: Promise<void> | null = null;
  let suivante: Promise<void> | null = null;
  const lancer = (): Promise<void> => {
    if (!courante) {
      courante = compile().finally(() => { courante = null; });
      return courante;
    }
    suivante ??= courante.catch(() => {}).then(() => { suivante = null; return lancer(); });
    return suivante;
  };
  return { lancer, enCours: () => courante !== null || suivante !== null };
}

/** RenderPipeline (nom de PostProcessing depuis r183) : scène (MRT sortie + émissif [+ pays]) → [atmosphère] → bloom → sortie sRGB → [SMAA]. */
export function createPostProcessing(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, o: PostOptions) {
  // `samples` toujours fixé : sans lui, la passe hérite des échantillons du renderer (canvas antialiasé de la sonde, `aa`).
  // Atmosphère physique (WebGPU, spec atmosphère §2.2) : un canal « pays » de plus, que seul le matériau de la Terre remplit ;
  // sans MSAA (la profondeur d'un pixel de bord ne correspond plus à sa couleur moyennée : pointillé le long du limbe,
  // 20/10), le SMAA le remplace en fin de chaîne (le FXAA effaçait les étoiles d'un pixel :
  // 1 pixel de ciel au-dessus de 60 contre 494, mesuré le 20/10 ; SMAA : 39 718 octets compressés).
  const sky = physicalSkyOf(renderer);
  const scenePass = pass(scene, camera, { samples: sky ? 0 : o.msaa });
  const glowing = o.bloom.strength > 0;
  const outputs = { output, ...(glowing ? { emissive } : {}), ...(sky ? { pays: keepNode } : {}) };
  scenePass.setMRT(mrt(outputs));
  const scene0 = scenePass.getTextureNode('output');
  const color = sky ? applyAtmosphere(sky, camera, scene0, scenePass.getTextureNode('depth'), scenePass.getTextureNode('pays').r, o.skyScale) : scene0;
  const glow = glowing ? bloom(scenePass.getTextureNode('emissive'), o.bloom.strength, o.bloom.radius, o.bloom.threshold) : null;
  glow?.setResolutionScale(o.bloom.scale);
  const lit = glow ? color.add(glow) : color;
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  const shown = renderOutput(lit, o.toneMapping, THREE.SRGBColorSpace);
  pipeline.outputNode = sky && o.smaa ? smaa(shown) : shown;
  const compilation = precompilation(() => scenePass.compileAsync(renderer));
  return {
    // pendant une précompilation, la cible de la passe est posée sur le renderer : l'image attend la suivante
    render: () => { if (!compilation.enCours()) pipeline.render(); },
    dispose: () => pipeline.dispose(),
    /**
     * Précompile les matériaux de la scène pour la passe (sa cible et ses sorties MRT), pipelines créés sans attendre :
     * appelée pendant l'intro, elle retire ce travail de l'image de préchauffage qui gelait l'accueil à son apparition
     * (571 ms, processeur ralenti 4 fois, format Pixel 9, 23/10). Une à la fois (`precompilation`).
     */
    compileAsync: compilation.lancer,
  };
}
