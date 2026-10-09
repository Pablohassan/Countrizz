import type { Libelle } from '../../../src/data/types';
import type { MledozeCountry } from './playable';

/** Nom de jeu : FR de mledoze (ou raccourci de overrides.names.fr), EN = mledoze `name.common` tel quel (décision du 05/10). */
export function nameOf(c: Pick<MledozeCountry, 'cca3' | 'name' | 'translations'>, frOverrides: Record<string, string>): Libelle {
  const fr = frOverrides[c.cca3] ?? c.translations.fra?.common;
  if (!fr) throw new Error(`${c.cca3} : pas de nom français chez mledoze (translations.fra) — ajouter overrides.names.fr.${c.cca3}`);
  return { fr, en: c.name.common };
}
