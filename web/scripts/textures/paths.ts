import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const TEX_CACHE_DIR = path.join(here, '.cache');
export const TEX_OUT_DIR = path.resolve(here, '../../public/textures');
export const TEX_LOCK_PATH = path.join(here, 'textures.lock.json');
export const TEX_REPORT_PATH = path.join(here, 'rapport-textures.md');
/** Natural Earth 10m, téléchargé par `npm run geodata:fetch` (phase 0). */
export const NE_COUNTRIES = path.resolve(here, '../geodata/.cache/ne_10m_admin_0_countries.geojson');
