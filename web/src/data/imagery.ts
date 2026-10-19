import type { ArrivalParams, Viewport } from '../camera/framing';
import type { LngLat } from './types';

/** Fichier d'une photo (taille en texels → octets et empreinte). */
export interface ImageFile { bytes: number; sha256: string }

/** Un niveau de la chaîne d'un pays : emprise (demi-côté, rad) et fichiers par taille (spec zoom §4.2). */
export interface ImageLevel { extentRad: number; files: Record<string, ImageFile> }

/**
 * Photos emboîtées d'un pays (public/data/imagery.json, scripts/imagery) : même projection que le patch SDF (contrat de
 * PatchMeta : azimutale équidistante, ligne 0 au nord, sans retournement), centrées sur la calotte ; `levels` du plus large
 * (0) au plus fin, chacun 4 fois plus serré ; KTX2 ETC1S sRGB, alpha = mer. URL : `data/patches/img/<cca3>-<niveau>-<taille>.ktx2`.
 */
export interface ImagePatchMeta { center: LngLat; levels: ImageLevel[] }

export interface ImageryIndex {
  layer: string;
  year: number;
  license: string;
  attribution: string;
  /** Cadrage du jeu au moment de la fabrication (sinon : `npm run imagery`). */
  framing: { margin: number; minContextDeg: number; arrival: ArrivalParams };
  viewFactor: number;
  levelRatio: number;
  maxExtentDeg: number;
  /** Cadrages de référence de la chaîne (spec zoom §4.1). */
  viewports: Viewport[];
  sizes: number[];
  countries: Record<string, ImagePatchMeta>;
}

export const imagePatchName = (cca3: string, level: number, size: number) => `${cca3.toLowerCase()}-${level}-${size}.ktx2`;
export const imagePatchUrl = (baseUrl: string, cca3: string, level: number, size: number) => `${baseUrl}data/patches/img/${imagePatchName(cca3, level, size)}`;
