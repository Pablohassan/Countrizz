/**
 * Constantes de l'intro partagées par le site (lecteur vidéo, accueil) et la fabrique de la vidéo (spec
 * `2026-10-11-countrizz-intro-video-blender-design.md`). Sans three : le lecteur et le titre de l'accueil ne chargent
 * pas la chronologie. Instants en secondes depuis le début de la vidéo.
 */

/** Les deux cadrages de la vidéo (px de la vidéo) : fenêtre plus haute que large → portrait, sinon paysage. */
export type Cadrage = 'portrait' | 'paysage';
export const CADRAGES: Record<Cadrage, { width: number; height: number }> = { portrait: { width: 1080, height: 2340 }, paysage: { width: 1920, height: 1080 } };

/** Cadence du rendu maître : une clé, une image Blender par 1/120 s. */
export const IPS_MAITRE = 120;

export const INTRO = {
  /** Début de la chute de la Terre. */
  CHUTE: 1.2,
  /** Durée de la chute : presque en flottant, puis de plus en plus vite (spec vidéo §3.1) ; la suite est décalée de +0,8 s. */
  D_CHUTE: 2.4,
  /** L'accueil se monte (commandes ; son titre reste invisible jusqu'au fondu) ; la Terre part vers le « o » du titre. */
  ACCUEIL: 17.0,
  /** Le vrai globe reprend son rendu, la vidéo s'efface : il faut le globe. */
  FONDU: 18.2,
  /** Fin de la vidéo : la petite Terre animée du titre prend le relais. */
  FIN: 19.8,
} as const;

/** Bulles : apparition (s), retournement sur la réponse (s) ; toutes se rangent à BULLES_RANGE. */
export const BULLES = { capitale: { apparait: 11.1, retourne: 14.0 }, pays: { apparait: 11.8, retourne: 14.3 }, drapeau: { apparait: 13.3, retourne: 14.6 } } as const;
/** Le drapeau, la frontière et les bulles se rangent (0,7 s), avant le second dézoom. */
export const BULLES_RANGE = 16.2;
export type Bulle = keyof typeof BULLES;

/** Le nom autour du « o » (la Terre) : « C », puis « untrizz ». */
export const LOGO_LETTRES = ['C', 'u', 'n', 't', 'r', 'i', 'z', 'z'] as const;
/** La petite Terre du titre de l'accueil fait un tour en 4 s (96 images, 24 i/s ; 24 images avant le 23/10). */
export const LOGO_TOUR_S = 4;
/** Angle de la Terre à FIN (rad, [0, 2π[) : la petite Terre du titre part de cette image ; = logoAngleAt(INTRO.FIN) (test). */
export const LOGO_ANGLE_FIN = 2.436418150808498;

/** Sans image au bout de 8 s, ou 8 s sans progrès en cours de lecture : intro abandonnée, accueil direct (spec vidéo §4). */
export const INTRO_GIVE_UP_MS = 8000;
