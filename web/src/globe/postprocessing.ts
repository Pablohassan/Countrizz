import * as THREE from 'three/webgpu';
import { emissive, mrt, output, pass, velocity } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import type { QualityTier } from './renderer';

export interface PostOptions { bloom: { strength: number; radius: number; threshold: number }; traa: boolean; msaa: number }

/**
 * Spec §4.1 : « haute » = bloom + TRAA ; « standard » = effets allégés (bloom seul, MSAA 4× du pass). Le bloom ne lit que
 * l'émissif (lumières des villes, soleil) : le jaune du pays et la Terre éclairée restent exacts. Sortie neutre
 * (NoToneMapping, prop `flat` de R3F) : un tone mapping filmique déplacerait le jaune #ffee03 de l'interface.
 */
export function postOptions(tier: QualityTier): PostOptions {
  return { bloom: { strength: 1.2, radius: 0.4, threshold: 0 }, traa: tier === 'haute', msaa: tier === 'haute' ? 0 : 4 };
}

/** RenderPipeline (nom de PostProcessing depuis r183) : scène (MRT sortie + émissif [+ vitesse]) → bloom → [TRAA] → sortie sRGB. */
export function createPostProcessing(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, o: PostOptions) {
  const scenePass = pass(scene, camera, o.msaa ? { samples: o.msaa } : {});
  scenePass.setMRT(o.traa ? mrt({ output, emissive, velocity }) : mrt({ output, emissive }));
  const color = scenePass.getTextureNode('output');
  const glow = bloom(scenePass.getTextureNode('emissive'), o.bloom.strength, o.bloom.radius, o.bloom.threshold);
  const lit = color.add(glow);
  const pipeline = new THREE.RenderPipeline(renderer);
  // TRAA : MSAA coupé (pass sans `samples`), l'historique se réinitialise seul quand la profondeur change trop.
  pipeline.outputNode = o.traa ? traa(lit, scenePass.getTextureNode('depth'), scenePass.getTextureNode('velocity'), camera) : lit;
  return { render: () => pipeline.render(), dispose: () => pipeline.dispose() };
}
