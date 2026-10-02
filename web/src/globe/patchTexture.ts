import * as THREE from 'three/webgpu';

/**
 * Charge un patch SDF comme DONNÉE (contrat de PatchMeta) : ImageBitmap sans conversion de couleur ni prémultiplication,
 * ligne 0 lue en v = 0 (flipY = false), filtrage linéaire, pas de mipmaps. Identique sur WebGPU et WebGL 2.
 */
export async function loadPatchTexture(url: string, signal?: AbortSignal): Promise<THREE.Texture> {
  const res = await fetch(url, signal ? { signal } : {});
  if (!res.ok) throw new Error(`patch ${url} : HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const t = new THREE.Texture(bitmap);
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export function disposePatchTexture(t: THREE.Texture): void {
  t.dispose();
  (t.image as ImageBitmap | undefined)?.close?.();
}
