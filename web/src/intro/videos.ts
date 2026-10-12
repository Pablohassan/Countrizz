import type { Cadrage } from './temps';

/**
 * Manifeste des vidéos de l'intro (`/video/videos.json`) : écrit par la fabrique (`scripts/intro/encode.ts`), lu par le
 * lecteur. Le `type` porte la chaîne de codec lue dans le fichier (boîte av1C ou hvcC), jamais écrite à la main.
 */
export type Codec = 'av1' | 'hevc';
/** `plein` : la résolution du cadrage ; `leger` : portrait 720 × 1560 pour les décodeurs qui ne tiennent pas le niveau 5. */
export type Taille = 'plein' | 'leger';
export type Ips = 60 | 120;

export interface Variante {
  cadrage: Cadrage;
  taille: Taille;
  ips: Ips;
  codec: Codec;
  /** URL absolue du fichier (`/video/intro-portrait-120.av1.mp4`). */
  src: string;
  /** Pour `canPlayType` et `decodingInfo` : `video/mp4; codecs="av01.0.13M.10"`. */
  type: string;
  width: number;
  height: number;
  octets: number;
}

export interface Manifeste {
  version: 1;
  /** Durée de l'intro (s), `INTRO.FIN`. */
  duree: number;
  affiches: Record<Cadrage, string>;
  variantes: Variante[];
}

/** Identifiant d'une variante, celui du crochet `?introVariante=` : `portrait-plein-60-av1`. */
export function idVariante(v: Pick<Variante, 'cadrage' | 'taille' | 'ips' | 'codec'>): string {
  return `${v.cadrage}-${v.taille}-${v.ips}-${v.codec}`;
}
