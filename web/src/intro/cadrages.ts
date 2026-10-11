import type { Cadrage } from './temps';

/**
 * Géométrie des deux titres « C🌍untrizz » de la vidéo, par cadrage, en px de la vidéo (spec vidéo §3.4) : le logo du
 * milieu (premier dézoom) et le titre de fin (second dézoom, à la place du titre de l'accueil). Mesurée une fois pour
 * toutes par `scripts/intro/mesurer-titres.ts` (Chromium, vraie police, règles CSS du site) et recopiée ici.
 */

/**
 * Écrans de référence (px CSS) où les titres sont mesurés : un téléphone 390 × 844 pour le portrait, un écran 1920 × 1080
 * pour le paysage (la densité n'y change rien : mesures identiques à 1 et 3 px par px CSS). `echelle` : px de la vidéo
 * par px CSS — la vidéo couvre l'écran (`cover`), portrait calé en haut.
 */
export const REFERENCES: Record<Cadrage, { width: number; height: number; echelle: number }> = {
  portrait: { width: 390, height: 844, echelle: 1080 / 390 },
  paysage: { width: 1920, height: 1080, echelle: 1 },
};

/**
 * Un titre mesuré : le « o » (centre et rayon de la petite Terre, `.logo-terre`), la taille de la police, et le centre de
 * chacune des 8 autres lettres (ordre LOGO_LETTRES) : milieu de sa boîte (avance × hauteur de ligne), au repos.
 */
export interface Titre { o: { x: number; y: number; r: number }; police: number; lettres: { x: number; y: number }[] }

export const TITRES: Record<Cadrage, { logo: Titre; titre: Titre }> = {
  portrait: {
    logo: { o: { x: 239.37, y: 1182.55, r: 48.09 }, police: 145.8,
      lettres: [{ x: 116.44, y: 1168.62 }, { x: 364.78, y: 1168.62 }, { x: 492.38, y: 1168.62 }, { x: 605.77, y: 1168.62 }, { x: 704.64, y: 1168.62 }, { x: 787.61, y: 1168.62 }, { x: 872.18, y: 1168.62 }, { x: 973.95, y: 1168.62 }] },
    titre: { o: { x: 231.84, y: 399.98, r: 49.33 }, police: 149.54,
      lettres: [{ x: 105.86, y: 386.85 }, { x: 360.41, y: 386.85 }, { x: 491.21, y: 386.85 }, { x: 607.44, y: 386.85 }, { x: 708.77, y: 386.85 }, { x: 793.82, y: 386.85 }, { x: 880.51, y: 386.85 }, { x: 984.83, y: 386.85 }] },
  },
  paysage: {
    logo: { o: { x: 805.42, y: 547.27, r: 24.95 }, police: 75.6,
      lettres: [{ x: 742.13, y: 540 }, { x: 870.02, y: 540 }, { x: 935.73, y: 540 }, { x: 994.09, y: 540 }, { x: 1044.91, y: 540 }, { x: 1087.5, y: 540 }, { x: 1130.92, y: 540 }, { x: 1183.27, y: 540 }] },
    titre: { o: { x: 848.72, y: 144.44, r: 17.81 }, police: 54,
      lettres: [{ x: 803.23, y: 139.7 }, { x: 895.15, y: 139.7 }, { x: 942.38, y: 139.7 }, { x: 984.35, y: 139.7 }, { x: 1020.95, y: 139.7 }, { x: 1051.66, y: 139.7 }, { x: 1082.96, y: 139.7 }, { x: 1120.63, y: 139.7 }] },
  },
};
