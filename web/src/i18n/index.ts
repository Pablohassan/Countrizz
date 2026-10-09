import type { Lang } from '../game/types';
import { en } from './en';
import { fr } from './fr';
import type { Messages } from './types';

export type { Messages } from './types';
export const messages: Record<Lang, Messages> = { fr, en };

/** Langue du jeu : le choix mémorisé s'il est valide, puis la première langue du navigateur en fr ou en ; sinon l'anglais. */
export function detectLang(stored: string | null, browser: readonly string[]): Lang {
  if (stored === 'fr' || stored === 'en') return stored;
  for (const tag of browser) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'fr' || base === 'en') return base;
  }
  return 'en';
}

/** Remplit les `{nom}` d'un texte ; un emplacement sans valeur est une erreur de programmation. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`fill : valeur manquante pour {${k}} dans « ${template} »`);
    return String(vars[k]);
  });
}
