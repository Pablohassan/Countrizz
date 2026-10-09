import type { Libelle } from '../../../src/data/types';

export interface CapitalOverride { fr: string; en: string }

const sorted = (list: string[], locale: string) => [...new Set(list)].sort((a, b) => a.localeCompare(b, locale));

/**
 * Capitale de jeu : FR = libellés Wikidata (une seule, ou arbitrage) ; EN = capitale mledoze (une seule, ou arbitrage).
 * Un arbitrage `overrides.capitals.<cca3>` porte les deux langues ; son FR doit figurer dans la liste Wikidata.
 */
export function capitalOfGame(
  cca3: string,
  wikidataFr: Record<string, string[]>,
  mledozeEn: string[],
  overrides: Record<string, CapitalOverride>,
): { capital: Libelle; capitals: { fr: string[]; en: string[] } } {
  const fr = sorted(wikidataFr[cca3] ?? [], 'fr');
  const forced = overrides[cca3];
  if (forced !== undefined) {
    if (!forced.fr?.trim() || !forced.en?.trim()) throw new Error(`${cca3} : arbitrage overrides.capitals.${cca3} incomplet (fr et en requis)`);
    if (fr.length > 0 && !fr.includes(forced.fr)) {
      throw new Error(`${cca3} : capitale imposée « ${forced.fr} » absente de la liste Wikidata (${fr.join(', ')})`);
    }
    return { capital: { fr: forced.fr, en: forced.en }, capitals: { fr: fr.length > 0 ? fr : [forced.fr], en: sorted([...mledozeEn, forced.en], 'en') } };
  }
  if (fr.length === 0) throw new Error(`Aucune capitale Wikidata pour ${cca3} : ajouter overrides.capitals.${cca3}`);
  if (fr.length > 1) throw new Error(`${cca3} a ${fr.length} capitales (${fr.join(', ')}) : arbitrer dans overrides.capitals.${cca3}`);
  if (mledozeEn.length !== 1) {
    throw new Error(`${cca3} : ${mledozeEn.length} capitales anglaises chez mledoze (${mledozeEn.join(', ')}) : arbitrer dans overrides.capitals.${cca3}`);
  }
  return { capital: { fr: fr[0]!, en: mledozeEn[0]! }, capitals: { fr, en: [...mledozeEn] } };
}
