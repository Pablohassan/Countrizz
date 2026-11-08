/** Ce que Wikidata dit d'un élément, réduit à ce qui décide de son statut. */
export interface Faits {
  type: 'ouvrage' | 'nature';
  auteurs: { nom: string; naissance: number | null; mort: number | null }[];
  /** année de début (P571), négative avant notre ère */
  debut: number | null;
  /** déclaré antérieur à 1850 par `choix.json` quand Wikidata n'a pas de date, ou une date fausse */
  ancien?: boolean;
}

export interface Statut {
  code: 'nature' | 'domaine-public' | 'protege' | 'a-verifier';
  /** année où l'œuvre devient libre (1er janvier) ; null si elle n'est pas connue (auteur vivant ou non nommé) */
  libreEn?: number | null;
  motif: string;
}

/** Durée de protection après l'année du décès (CPI L123-1) ; hors prorogations de guerre. */
const PROTECTION_ANS = 70;
/** Né il y a moins de 110 ans sans date de décès : présumé vivant ; plus de 110 + 70 ans : mort depuis plus de 70 ans. */
const VIE_ANS = 110;
/** Ouvrage commencé il y a plus de 150 ans sans auteur connu : tout auteur est mort depuis plus de 70 ans. */
const ANCIEN_ANS = 150;

const an = (y: number) => (y < 0 ? `${-y} av. J.-C.` : `${y}`);

/** Statut d'un élément au 1er janvier de `annee`, en droit d'auteur français (règle simplifiée, à confirmer pour les cas protégés). */
export function statut(f: Faits, annee: number): Statut {
  if (f.type === 'nature') return { code: 'nature', motif: 'site naturel, sans auteur' };
  if (f.ancien) return { code: 'domaine-public', motif: 'ouvrage antérieur à 1850 (choix ; date absente ou fausse dans Wikidata)' };
  const vivants = f.auteurs.filter((a) => a.mort === null && a.naissance !== null && a.naissance > annee - VIE_ANS);
  if (vivants.length > 0) return { code: 'protege', libreEn: null, motif: `${vivants.map((a) => a.nom).join(', ')} : vivant` };
  const morts = f.auteurs.filter((a) => a.mort !== null);
  const dernier = morts.length > 0 ? morts.reduce((a, b) => (b.mort! > a.mort! ? b : a)) : null;
  if (dernier && dernier.mort! + PROTECTION_ANS + 1 > annee) return { code: 'protege', libreEn: dernier.mort! + PROTECTION_ANS + 1, motif: `${dernier.nom} mort en ${dernier.mort}` };
  const inconnus = f.auteurs.filter((a) => a.mort === null && !(a.naissance !== null && a.naissance <= annee - VIE_ANS - PROTECTION_ANS - 1));
  if (f.auteurs.length > 0 && inconnus.length === 0) return { code: 'domaine-public', libreEn: dernier ? dernier.mort! + PROTECTION_ANS + 1 : null, motif: dernier ? `${dernier.nom} mort en ${an(dernier.mort!)}` : 'auteurs nés il y a plus de 180 ans' };
  if (f.debut !== null && f.debut >= annee - PROTECTION_ANS) return { code: 'protege', libreEn: null, motif: `ouvrage de ${f.debut} : son auteur ne peut être mort avant ${annee - PROTECTION_ANS}` };
  if (f.debut !== null && f.debut <= annee - ANCIEN_ANS - 1) return { code: 'domaine-public', motif: `ouvrage ancien (${an(f.debut)})` };
  if (inconnus.length > 0) return { code: 'a-verifier', motif: `${inconnus.map((a) => a.nom).join(', ')} : décès inconnu` };
  return { code: 'a-verifier', motif: f.debut === null ? 'sans date ni auteur dans Wikidata' : `ouvrage de ${f.debut}, sans auteur dans Wikidata` };
}

/**
 * Élément montré pour un pays (décision de l'utilisateur du 08/11 : les variantes libres) : la variante quand le principal est
 * protégé et qu'elle est libre ou naturelle ; sinon le principal (protégé sans variante libre : reste à trancher).
 */
export function retenir(principal: Statut['code'], variante: Statut['code'] | undefined): 'principal' | 'variante' {
  const libre = (c: Statut['code'] | undefined) => c === 'domaine-public' || c === 'nature';
  return principal === 'protege' && libre(variante) ? 'variante' : 'principal';
}
