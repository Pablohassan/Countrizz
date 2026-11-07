import { EOX } from '../imagery/config';

/**
 * Jour : mosaïque mondiale Sentinel-2 cloudless 2025 (EOX, scripts/imagery/config.ts), 8192 × 4096 en deux requêtes WMS ;
 * Blue Marble n'y comble plus que les glaces polaires (lib/polarFill.ts).
 */
export const DAY_S2 = { box: { west: -180, south: -90, east: 180, north: 90 }, maxStepDeg: 360 / 8192 } as const;

/** Sources NASA (lues et vérifiées par HEAD le 02/10/2026 ; tailles = Content-Length relevé ce jour-là). */
export const TEXTURE_SOURCES = {
  /** Blue Marble Next Generation, juillet 2004, sans ombrage, PNG sans perte : glaces polaires du jour. */
  day: { url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74092/world.200407.3x21600x10800.png', file: 'bmng-200407-21600.png', bytes: 123_901_191 },
  /** Black Marble 2016 couleur, 3 km, 13500×6750 (la plus grande image d'un seul tenant). */
  night: { url: 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg', file: 'blackmarble-2016-3km.jpg', bytes: 8_106_233 },
  /** Topographie GEBCO_08 de Blue Marble : 8 bits, 0 → 6400 m, la mer et les terres basses valent 0. */
  elevation: { url: 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/topography/gebco_08_rev_elev_21600x10800.tif', file: 'gebco08-elev-21600.tif', bytes: 233_345_166 },
} as const;

/**
 * Altitude GEBCO_2026 (avril 2026, domaine public, citation obligatoire ; spec océan §2.2) : COG de source.coop lu dans
 * son aperçu réduit n° 3 (10 800 × 5 400, Int16, mètres) sans télécharger les 4,6 Go du fichier entier.
 */
export const GEBCO_2026 = {
  url: 'https://data.source.coop/giswqs/gebco-bathymetry/gebco_2026/gebco_2026.tif',
  overview: 3, width: 10800, height: 5400, file: 'gebco2026-10800x5400.i16',
} as const;
/** Altitude codée dans le canal R de la surface : 0 → 8 850 m (l'Everest n'est plus écrêté). */
export const ELEVATION_MAX_M = 8850;
/** Vagues (spec océan §1.3) : pentes répétables, 512 × 512, 48 houles. */
export const WAVES = { size: 512, count: 48 } as const;

/**
 * Vent de surface (spec océan §1.2 bis, 07/11) : NOAA NCEI Blended Seawinds v2 (0,25°, six heures, « publically available
 * for use with citation »), un seul relevé lu par ERDDAP. Le dernier publié au 07/11/2026 (couverture jusqu'au 30/09/2026).
 */
const WIND_QUERY = '[(2026-09-30T18:00:00Z)][(10.0)][(-89.75):1:(89.75)][(0.0):1:(359.75)]';
export const WIND_SOURCE = {
  url: `https://coastwatch.noaa.gov/erddap/griddap/noaacwBlendedWinds6hr.csv?u_wind${WIND_QUERY},v_wind${WIND_QUERY}`,
  file: 'nbs-v2-20260930T18.csv',
} as const;
/** Texture du vent : grille de la source (1 440 × 720, ligne polaire comprise), 0 → 30 m/s sur 0 → 255. */
export const WIND = { width: 1440, height: 720, maxMs: 30 } as const;

export const COLOR_SIZES = [8192, 4096] as const;
export const SURFACE_SIZE = 4096;
/** Budget des textures globales par niveau de qualité (spec §10.5) ; un dépassement se soumet à l'utilisateur. */
export const BUDGET_BYTES = { standard: 15_000_000, haute: 25_000_000 } as const;

export const CREDITS = [
  { layer: 'jour', text: `Data & Viewing Products: ${EOX.attribution}, CC BY-NC-SA 4.0. Mer et glaces polaires : Blue Marble: Next Generation (juillet 2004), NASA Earth Observatory (Reto Stöckli).` },
  { layer: 'nuit', text: 'Black Marble 2016, NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from Miguel Román, NASA GSFC.' },
  { layer: 'relief', text: 'GEBCO Bathymetric Compilation Group 2026 (2026). The GEBCO_2026 Grid - a continuous terrain model for oceans and land at 15 arc-second intervals. NERC EDS British Oceanographic Data Centre NOC. doi:10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa' },
  { layer: 'océans', text: 'Masque terre/mer dérivé de Natural Earth (domaine public).' },
  { layer: 'vent', text: 'Vent de surface du 30/09/2026 : NOAA NCEI Blended Seawinds (NBS) v2.0, https://coastwatch.noaa.gov/cwn/products/noaa-ncei-experimental-blended-seawinds-nbs-v2.html ; Zhang, H.-M., J. J. Bates et R. W. Reynolds (2006), Geophysical Research Letters, 33, L17714.' },
] as const;
