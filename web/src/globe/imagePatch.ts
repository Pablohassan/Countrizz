import * as THREE from 'three/webgpu';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { ImageryIndex } from '../data/imagery';
import type { ImageSource } from './controller';
import type { QualityTier } from './renderer';

/** Spec §4.1 : patch image de 2048 texels en « haute », 1024 en « standard ». */
export const imagePatchSize = (tier: QualityTier): number => (tier === 'haute' ? 2048 : 1024);

/** Index des patchs image ; absent ou illisible → `null` : le jeu garde la texture globale (les patchs sont hors dépôt). */
export async function loadImageryIndex(baseUrl = '/'): Promise<ImageryIndex | null> {
  try {
    const r = await fetch(`${baseUrl}data/imagery.json`);
    return r.ok ? ((await r.json()) as ImageryIndex) : null;
  } catch {
    return null;
  }
}

/** Chargeur KTX2 des patchs image pour ce renderer (detectSupport exige `await renderer.init()`, fait par createRenderer). */
export function createImageSource(renderer: THREE.WebGPURenderer, tier: QualityTier, baseUrl = '/'): ImageSource & { dispose(): void } {
  const loader = new KTX2Loader().setTranscoderPath(`${baseUrl}basis/`).detectSupport(renderer);
  return {
    size: imagePatchSize(tier),
    async load(url) {
      const t = await loader.loadAsync(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8; // avant le premier rendu : l'échantillonneur se construit à ce moment-là
      return t;
    },
    dispose: () => loader.dispose(),
  };
}
