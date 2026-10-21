import type { Empreintes } from './cache';

/**
 * Table des empreintes posée par le build (vite.config.ts, `__COUNTRIZZ_EMPREINTES__`), lue ICI SEULEMENT : Vite recopie
 * la table entière à chaque endroit où la constante est écrite (≈ 15 Ko chacun ; deux usages de plus avaient fait passer le
 * démarrage Fast 4G de 1114 à 1228 ms, le 21/10). Les tests unitaires la définissent vide (vitest.config.ts).
 */
export const EMPREINTES: Empreintes = __COUNTRIZZ_EMPREINTES__;
