import type { LngLat } from './types';

/** Fichier d'un patch image (taille en texels → octets et empreinte). */
export interface ImageFile { bytes: number; sha256: string }

/**
 * Patch image d'un pays (public/data/imagery.json, scripts/imagery) : même projection que le patch SDF (contrat de
 * PatchMeta : azimutale équidistante, ligne 0 au nord, sans retournement), emprise propre ; KTX2 ETC1S sRGB, alpha = mer.
 * URL : `data/patches/img/<cca3 en minuscules>-<taille>.ktx2`.
 */
export interface ImagePatchMeta { center: LngLat; extentRad: number; files: Record<string, ImageFile> }

export interface ImageryIndex {
  layer: string;
  year: number;
  license: string;
  attribution: string;
  framing: { margin: number; minContextDeg: number };
  viewFactor: number;
  maxExtentDeg: number;
  sizes: number[];
  countries: Record<string, ImagePatchMeta>;
}

export const imagePatchUrl = (baseUrl: string, cca3: string, size: number) => `${baseUrl}data/patches/img/${cca3.toLowerCase()}-${size}.ktx2`;
