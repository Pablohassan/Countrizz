/**
 * Adresses que le service worker range dans ses caches à l'usage (vite.config.ts, `runtimeCaching`), testées dans
 * pwa.test.ts. Les vidéos de l'intro (`/video/`) n'y sont pas : lues en flux par plages d'octets, qu'une réponse
 * « 200 seulement » servie du cache casserait (Safari), elles passent toujours au réseau (D1 du plan de l'intro vidéo).
 */
/** Textures du globe, transcodeur, intro (affiches, ancres, petite Terre du titre), police, icônes. */
export const MOTIF_LOURD = /\/(textures|basis|intro|fonts|icons)\/[^/]+$/;
/** Pays déjà vus : patchs et drapeaux. */
export const MOTIF_PAYS = /\/data\/(patches|flags)\//;
/** Index de données (countries.json, imagery.json…). */
export const MOTIF_DONNEES = /\/data\/[a-z]+\.json$/;
