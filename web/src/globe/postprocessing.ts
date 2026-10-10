import * as THREE from 'three/webgpu';
import { emissive, mrt, output, pass, renderOutput, velocity } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
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
  const scenePass = pass(scene, camera, { samples: o.msaa });
  scenePass.setMRT(o.traa ? mrt({ output, emissive, velocity }) : mrt({ output, emissive }));
  const color = scenePass.getTextureNode('output');
  const glow = bloom(scenePass.getTextureNode('emissive'), o.bloom.strength, o.bloom.radius, o.bloom.threshold);
  const lit = color.add(glow);
  const pipeline = new THREE.RenderPipeline(renderer);
  // TRAA : MSAA coupé (samples 0), l'historique se réinitialise seul quand la profondeur change trop.
  const final = o.traa ? traa(lit, scenePass.getTextureNode('depth'), scenePass.getTextureNode('velocity'), camera) : lit;
  pipeline.outputColorTransform = false;
  pipeline.outputNode = renderOutput(final, o.toneMapping, THREE.SRGBColorSpace);
  return { render: () => pipeline.render(), dispose: () => pipeline.dispose() };
}
