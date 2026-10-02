import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const GEODATA_DIR = here;
export const CACHE_DIR = path.join(here, '.cache');
export const DATA_SRC_DIR = path.join(here, 'data-src');
export const OUT_DIR = path.resolve(here, '../../public/data');
export const REPORT_PATH = path.join(here, 'rapport-geodata.md');
export const LOCK_PATH = path.join(here, 'sources.lock.json');
export const OVERRIDES_PATH = path.join(here, 'overrides.json');
