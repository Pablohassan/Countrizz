import * as THREE from 'three/webgpu';

export type Backend = 'webgpu' | 'webgl2';
export type QualityTier = 'haute' | 'standard';

export interface RendererInfo { renderer: THREE.WebGPURenderer; backend: Backend; maxTexture2D: number }

/** Spec §4.1 : « haute » = WebGPU sur bureau (textures 8K) ; « standard » = mobile ou WebGL 2 (textures 4K). */
export function qualityTier(i: { backend: Backend; coarsePointer: boolean; maxTexture2D: number }): QualityTier {
  return i.backend === 'webgpu' && !i.coarsePointer && i.maxTexture2D >= 8192 ? 'haute' : 'standard';
}

/**
 * Crée le renderer : WebGPU, repli WebGL 2 automatique (three le fait dans `init()`). Rejette si aucun des deux
 * n'est disponible — l'appelant affiche alors « navigateur non compatible ».
 */
export async function createRenderer(canvas: HTMLCanvasElement, opts: { forceWebGL?: boolean; antialias?: boolean } = {}): Promise<RendererInfo> {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: opts.antialias ?? true, forceWebGL: opts.forceWebGL ?? false });
  await renderer.init();
  // Le type public de Backend n'expose ni le drapeau ni le device : on lit ce que three pose (WebGPUBackend.js / WebGLBackend.js).
  const raw = renderer.backend as unknown as {
    isWebGPUBackend?: boolean;
    device?: { limits: { maxTextureDimension2D: number } };
    gl?: WebGL2RenderingContext;
  };
  const backend: Backend = raw.isWebGPUBackend ? 'webgpu' : 'webgl2';
  const maxTexture2D = backend === 'webgpu' ? raw.device!.limits.maxTextureDimension2D : (raw.gl!.getParameter(raw.gl!.MAX_TEXTURE_SIZE) as number);
  return { renderer, backend, maxTexture2D };
}
