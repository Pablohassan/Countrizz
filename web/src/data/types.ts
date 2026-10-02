/** Coordonnées géographiques en degrés : [longitude, latitude]. */
export type LngLat = [lng: number, lat: number];

/** Plus petite calotte sphérique englobant le corps principal d'un pays. */
export interface Cap {
  center: LngLat;
  radiusDeg: number;
}

/**
 * Patch SDF local d'un pays (PNG RGBA).
 * Projection : azimutale équidistante centrée sur `center`, échelle 1 (unités = radians d'arc).
 * Pixel (0,0) en haut à gauche ; les lignes du haut sont au NORD du centre.
 *   px = (x / extentRad + 1) * size / 2      py = (y / extentRad + 1) * size / 2
 * R : distance signée au bord du pays, 128 = bord, > 128 dedans, ±127 niveaux = ±rangeTexels.
 * G : distance aux frontières des autres pays, 0 → 255 pour 0 → rangeTexels.
 */
export interface PatchMeta {
  sdf: string;
  size: number;
  center: LngLat;
  extentRad: number;
  rangeTexels: number;
}

export interface CountryRecord {
  id: number;
  cca3: string;
  cca2: string;
  name: string;
  capital: string;
  capitals: string[];
  region: string;
  subregion: string;
  neighbors: string[];
  areaKm2: number;
  cap: Cap;
  /** Pôle d'inaccessibilité du plus grand polygone du corps principal. */
  beacon: LngLat;
  /** Distance de la balise au bord du pays (km) : sous un texel ou deux, le pays n'est lisible que par sa balise. */
  beaconClearanceKm: number;
  flag: string;
  outlineSource: 'geoboundaries' | 'naturalearth';
  patch: PatchMeta;
}
