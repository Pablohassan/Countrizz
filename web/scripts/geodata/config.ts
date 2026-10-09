export const NE_SHA = '9380cca83db5f9aef52d5e762765100745f84b27';
export const MLEDOZE_SHA = 'c2ac0049c14edcf2436c7aa1b2493222a020b462';

export const SOURCES = {
  naturalEarth: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_SHA}/geojson/ne_10m_admin_0_countries.geojson`,
  naturalEarthDisputed: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_SHA}/geojson/ne_10m_admin_0_disputed_areas.geojson`,
  naturalEarthPlaces: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_SHA}/geojson/ne_10m_populated_places_simple.geojson`,
  mledozeCountries: `https://raw.githubusercontent.com/mledoze/countries/${MLEDOZE_SHA}/countries.json`,
  mledozeFlag: (cca3: string) =>
    `https://raw.githubusercontent.com/mledoze/countries/${MLEDOZE_SHA}/data/${cca3.toLowerCase()}.svg`,
  geoBoundariesMeta: (iso: string) => `https://www.geoboundaries.org/api/current/gbOpen/${iso}/ADM0/`,
} as const;

export const PLAYABLE_EXTRA = ['PSE', 'UNK', 'TWN'] as const;
export const PLAYABLE_COUNT = 197;

export const MAIN_BODY = { maxDistanceDeg: 25, areaShare: 0.9 } as const;
export const AREA_RATIO = { min: 0.5, max: 2 } as const;
/** geoBoundaries n'est téléchargé que pour les pays de surface mledoze ≤ ce seuil (contours fins utiles). */
export const GEOBOUNDARIES_MAX_AREA_KM2 = 50_000;
export const PATCH = { size: 1024, rangeTexels: 32, extentFactor: 1.5, minExtentDeg: 0.02 } as const;
/** Fraction des points gardés pour les frontières de vue d'ensemble. */
export const BORDERS_KEEP = 0.12;
export const EARTH_RADIUS_KM = 6371.0088;
