import * as THREE from 'three/webgpu';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { QualityTier } from './renderer';

export interface GlobeTextures { day: THREE.Texture; night: THREE.Texture; surface: THREE.Texture }

/** Textures globales KTX2 (pipeline scripts/textures) : 8K en « haute », 4K en « standard » ; surface toujours en 4K. */
export async function loadGlobeTextures(renderer: THREE.WebGPURenderer, tier: QualityTier, base = '/'): Promise<GlobeTextures> {
  // detectSupport exige un renderer initialisé (await renderer.init(), fait par createRenderer).
  const loader = new KTX2Loader().setTranscoderPath(`${base}basis/`).detectSupport(renderer);
  const size = tier === 'haute' ? '8k' : '4k';
  const [day, night, surface] = await Promise.all([
    loader.loadAsync(`${base}textures/day-${size}.ktx2`),
    loader.loadAsync(`${base}textures/night-${size}.ktx2`),
    loader.loadAsync(`${base}textures/surface-4k.ktx2`),
  ]);
  loader.dispose();
  day.colorSpace = THREE.SRGBColorSpace;
  night.colorSpace = THREE.SRGBColorSpace;
  surface.colorSpace = THREE.NoColorSpace;
  // L'anisotropie se pose avant le premier rendu : l'échantillonneur est construit à ce moment-là.
  for (const t of [day, night, surface]) t.anisotropy = 8;
  return { day, night, surface };
}
