import type { CountryRecord } from '../data/types';

/** Les trois modes du jeu (spec 2A §12) : Drapeau, Pays, Capitale. */
export type Mode = 'flag' | 'country' | 'capital';
export const MODES: readonly Mode[] = ['flag', 'country', 'capital'];

export type Lang = 'fr' | 'en';

/** Ce dont le tirage a besoin d'un pays. */
export type DrawCountry = Pick<CountryRecord, 'cca3' | 'region' | 'subregion' | 'neighbors' | 'name' | 'capital' | 'flag'>;

/** Une manche : le pays demandé et quatre réponses (codes cca3) ; `options[answer]` est le pays demandé. */
export interface Question { cca3: string; options: string[]; answer: number }
