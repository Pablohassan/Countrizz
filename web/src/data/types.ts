/** Coordonnées géographiques en degrés : [longitude, latitude]. */
export type LngLat = [lng: number, lat: number];

/** Libellé dans les deux langues du jeu. */
export interface Libelle { fr: string; en: string }

/** Plus petite calotte sphérique englobant le corps principal d'un pays. */
export interface Cap {
  center: LngLat;
  radiusDeg: number;
}

/**
 * Patch SDF local d'un pays : PNG RGBA de `size` × `size` pixels.
 *
 * Projection — azimutale équidistante centrée sur `center` = (λ0, φ0), sphère de rayon 1 (unités = radians
 * d'arc), identique à d3 `geoAzimuthalEquidistant().rotate([-λ0, -φ0]).scale(1).translate([0, 0])`
 * (`makeProjector`, figé sur cette forme par `scripts/geodata/__tests__/unit/patch.test.ts`).
 * Pour un point (λ, φ), avec Δλ = λ − λ0 :
 *   cos c = sin φ0 · sin φ + cos φ0 · cos φ · cos Δλ      c ∈ [0, π] : distance angulaire au centre
 *   k = c / sin c                                         k → 1 quand c → 0 ; singulier à l'antipode (hors cadre)
 *   x =  k · cos φ · sin Δλ                               vers l'est
 *   y = −k · (cos φ0 · sin φ − sin φ0 · cos φ · cos Δλ)   vers le SUD : convention d3, y croît vers le bas
 * Pixels (continus ; le pixel i couvre [i, i + 1[, son centre est en i + ½) :
 *   px = (x / extentRad + 1) · size / 2      py = (y / extentRad + 1) · size / 2
 * Texture : u = px / size, v = py / size. La ligne 0 du PNG est le bord NORD du cadre et c'est v = 0 qui doit la
 * lire : charger sans retournement (flipY = false), comme une donnée (aucune conversion sRGB).
 *
 * Canaux (octets r, g dans [0, 255] ; un échantillonneur normalisé rend r / 255) :
 *   R — distance signée au bord du pays, en texels : (r − 128) / 127 · rangeTexels, saturée à ±rangeTexels ;
 *       128 = bord, > 128 = dedans.
 *   G — distance, en texels, aux lignes des AUTRES entités (frontières et côtes de la topologie, sauf celles qui
 *       bordent le pays) : g / 255 · rangeTexels, saturée ; 255 partout si aucune ligne ne traverse le cadre.
 *   B = 0 et A = 255 : sans signification.
 *
 * Hors cadre (u ou v hors de [0, 1]) : le patch ne dit rien ; le point compte comme hors du pays et loin de toute
 * ligne (R = 0, G = 255). Ne jamais prolonger le texel de bord (clamp-to-edge) : le corps principal tient dans le
 * cadre (|x|, |y| ≤ c ≤ rayon de la calotte < extentRad), mais d'autres parties du pays peuvent le traverser —
 * 9 patchs sur 197 ont R > 128 au bord (dont USA et Timor oriental, génération du 02/10/2026).
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
  name: Libelle;
  capital: Libelle;
  capitals: { fr: string[]; en: string[] };
  /** Position de la capitale de jeu : Natural Earth populated places, ou point imposé sourcé (overrides.capitalPoints). */
  capitalLngLat: LngLat;
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
