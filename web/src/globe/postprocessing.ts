import * as THREE from 'three/webgpu';
import { emissive, mrt, output, pass, renderOutput, velocity } from 'three/tsl';
import { applyAtmosphere, keepNode, physicalSkyOf } from './physicalSky';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import type { QualityTier } from './renderer';

export interface PostOptions { bloom: { strength: number; radius: number; threshold: number }; traa: boolean; msaa: number; toneMapping: THREE.ToneMapping }

/**
 * Spec §4.1 : « haute » = bloom + TRAA ; « standard » = effets allégés (bloom seul, MSAA 4× du pass). Le bloom ne lit que
 * l'émissif (lumières des villes, soleil). Sortie en tone mapping Neutral (planche du 10/10, choix de l'utilisateur) : il
 * garde les teintes de base (jaune pays mesuré #d7d12c sans, #d3cd0f avec ; AgX le délavait en #bdb56b) et creuse les mers.
 * Appliqué dans la chaîne, après le TRAA : le prop `flat` de R3F laisse le renderer sans tone mapping.
 */
export function postOptions(tier: QualityTier): PostOptions {
  return { bloom: { strength: 0.3, radius: 0.4, threshold: 0 }, traa: tier === 'haute', msaa: tier === 'haute' ? 0 : 4, toneMapping: THREE.NeutralToneMapping };
}

/** RenderPipeline (nom de PostProcessing depuis r183) : scène (MRT sortie + émissif [+ vitesse]) → bloom → [TRAA] → sortie sRGB. */
export function createPostProcessing(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, o: PostOptions) {
  // `samples` toujours fixé : sans lui, la passe hérite des échantillons du renderer (4, antialias du jeu), et le TRAA ne
  // peut plus copier la profondeur dans son historique (une erreur du GPU à chaque image, image qui scintille).
  // Atmosphère physique (WebGPU, spec atmosphère §2.2) : un canal « pays » de plus, que seul le matériau de la Terre remplit ;
  // sans MSAA (la profondeur d'un pixel de bord ne correspond plus à sa couleur moyennée : pointillé le long du limbe,
  // 20/10), le SMAA le remplace en fin de chaîne quand le TRAA n'est pas là (le FXAA effaçait les étoiles d'un pixel :
  // 1 pixel de ciel au-dessus de 60 contre 494, mesuré le 20/10 ; SMAA : 39 718 octets compressés).
  const sky = physicalSkyOf(renderer);
  const scenePass = pass(scene, camera, { samples: sky ? 0 : o.msaa });
  const outputs = { output, emissive, ...(o.traa ? { velocity } : {}), ...(sky ? { pays: keepNode } : {}) };
  scenePass.setMRT(mrt(outputs));
  const scene0 = scenePass.getTextureNode('output');
  const color = sky ? applyAtmosphere(sky, camera, scene0, scenePass.getTextureNode('depth'), scenePass.getTextureNode('pays').r) : scene0;
  const glow = bloom(scenePass.getTextureNode('emissive'), o.bloom.strength, o.bloom.radius, o.bloom.threshold);
  const lit = color.add(glow);
  const pipeline = new THREE.RenderPipeline(renderer);
  // TRAA : MSAA coupé (samples 0), l'historique se réinitialise seul quand la profondeur change trop.
  const final = o.traa ? traa(lit, scenePass.getTextureNode('depth'), scenePass.getTextureNode('velocity'), camera) : lit;
  pipeline.outputColorTransform = false;
  const shown = renderOutput(final, o.toneMapping, THREE.SRGBColorSpace);
  pipeline.outputNode = sky && !o.traa ? smaa(shown) : shown;
  return {
    render: () => pipeline.render(),
    dispose: () => pipeline.dispose(),
    /**
     * Précompile les matériaux de la scène pour la passe (sa cible et ses sorties MRT), pipelines créés sans attendre :
     * appelée pendant l'intro, elle retire ce travail de l'image de préchauffage qui gelait l'accueil à son apparition
     * (571 ms, processeur ralenti 4 fois, format Pixel 9, 23/10).
     */
    compileAsync: () => scenePass.compileAsync(renderer),
  };
}
