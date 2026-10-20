import * as THREE from 'three/webgpu';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { ReliefGrid } from './borders';
import type { QualityTier } from './renderer';

/** `clouds` et `waves` sont facultatifs : sans eux (fichier absent), le globe se dessine sans nuages ou sans vagues. */
export interface GlobeTextures { day: THREE.Texture; night: THREE.Texture; surface: THREE.Texture; clouds: THREE.Texture | null; waves?: THREE.Texture | null }

export function disposeGlobeTextures(t: GlobeTextures): void {
  t.day.dispose();
  t.night.dispose();
  t.surface.dispose();
  t.clouds?.dispose();
  t.waves?.dispose();
}

/**
 * Textures globales KTX2 (pipeline scripts/textures) : 8K en « haute », 4K en « standard » ; surface et nuages toujours en 4K.
 * `onProgress` : fichier 0 à 4 (jour, nuit, surface, nuages, vagues) et sa fraction ; 1 à la fin, échec compris.
 */
export async function loadGlobeTextures(renderer: THREE.WebGPURenderer, tier: QualityTier, base = '/', onProgress?: (file: number, fraction: number) => void): Promise<GlobeTextures> {
  // detectSupport exige un renderer initialisé (await renderer.init(), fait par createRenderer).
  const loader = new KTX2Loader().setTranscoderPath(`${base}basis/`).detectSupport(renderer);
  const size = tier === 'haute' ? '8k' : '4k';
  const step = (i: number, url: string) =>
    loader.loadAsync(url, (e: ProgressEvent) => onProgress?.(i, e.total ? e.loaded / e.total : 0)).finally(() => onProgress?.(i, 1));
  let loaded: [THREE.Texture, THREE.Texture, THREE.Texture, THREE.Texture | null, THREE.Texture | null];
  try {
    loaded = await Promise.all([
      step(0, `${base}textures/day-${size}.ktx2`),
      step(1, `${base}textures/night-${size}.ktx2`),
      step(2, `${base}textures/surface-4k.ktx2`),
      step(3, `${base}textures/clouds-4k.ktx2`).catch(() => null),
      step(4, `${base}textures/waves-512.ktx2`).catch(() => null),
    ]);
  } finally {
    loader.dispose();
  }
  const [day, night, surface, clouds, waves] = loaded;
  day.colorSpace = THREE.SRGBColorSpace;
  night.colorSpace = THREE.SRGBColorSpace;
  surface.colorSpace = THREE.NoColorSpace;
  // L'anisotropie se pose avant le premier rendu : l'échantillonneur est construit à ce moment-là.
  for (const t of [day, night, surface]) t.anisotropy = 8;
  // le relief lit la surface à un texel de part et d'autre : au 180ᵉ méridien, la lecture fait le tour
  surface.wrapS = THREE.RepeatWrapping;
  if (clouds) {
    clouds.colorSpace = THREE.NoColorSpace;
    clouds.wrapS = THREE.RepeatWrapping; // la dérive fait sortir la lecture de [0, 1] en longitude
    clouds.anisotropy = 8;
  }
  if (waves) {
    waves.colorSpace = THREE.NoColorSpace;
    waves.wrapS = waves.wrapT = THREE.RepeatWrapping; // répétée 4096 fois sur un tour (ocean.ts)
  }
  return { day, night, surface, clouds, waves };
}

/** Jour et nuit seuls, au niveau donné (repli en cours de partie, spec zoom §5 bis : 8K → 4K sans recréer le renderer). */
export async function loadDayNight(renderer: THREE.WebGPURenderer, tier: QualityTier, base = '/'): Promise<[THREE.Texture, THREE.Texture]> {
  const loader = new KTX2Loader().setTranscoderPath(`${base}basis/`).detectSupport(renderer);
  const size = tier === 'haute' ? '8k' : '4k';
  try {
    const [day, night] = await Promise.all([loader.loadAsync(`${base}textures/day-${size}.ktx2`), loader.loadAsync(`${base}textures/night-${size}.ktx2`)]);
    for (const t of [day, night]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; }
    return [day, night];
  } finally { loader.dispose(); }
}

/**
 * Grille d'altitudes des frontières soulevées (`relief-512.png`, scripts/textures) : canal R, ligne 0 au nord. Facultative :
 * sans elle (fichier absent, navigateur sans OffscreenCanvas), les frontières restent au ras de la sphère.
 */
export async function loadReliefGrid(base = '/'): Promise<ReliefGrid | null> {
  try {
    const r = await fetch(`${base}textures/relief-512.png`);
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d');
    if (!c) return null;
    c.drawImage(bmp, 0, 0);
    const rgba = c.getImageData(0, 0, bmp.width, bmp.height).data;
    const data = new Uint8Array(bmp.width * bmp.height);
    for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4]!;
    return { data, width: bmp.width, height: bmp.height };
  } catch { return null; }
}
