import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Réponses WMS en cache (non versionnées), partagées par la texture globale et les patchs image. */
export const IMG_CACHE_DIR = path.join(here, '.cache');
