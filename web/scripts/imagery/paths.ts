import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Réponses WMS en cache (non versionnées), partagées par la texture globale et les patchs image. */
export const IMG_CACHE_DIR = path.join(here, '.cache');

/** Patchs image générés (non versionnés : web/public/data/patches/img/ est ignoré par git). */
export const IMG_OUT_DIR = path.resolve(here, '../../public/data/patches/img');
/** Index versionné des patchs image : cadre de chaque pays, attribution, empreintes des fichiers. */
export const IMG_INDEX_PATH = path.resolve(here, '../../public/data/imagery.json');
export const IMG_REPORT_PATH = path.join(here, 'rapport-imagerie.md');
