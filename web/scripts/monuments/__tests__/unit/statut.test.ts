import { describe, expect, it } from 'vitest';
import { statut } from '../../lib/statut';

// droit d'auteur français : 70 ans après l'année du décès, libre au 1er janvier suivant (CPI L123-1) ; en 2026, décès ≤ 1955
describe('statut juridique d\'un élément (droit d\'auteur, règle simplifiée)', () => {
  it('site naturel : pas d\'auteur', () => {
    expect(statut({ type: 'nature', auteurs: [], debut: null }, 2026).code).toBe('nature');
  });

  it('tour Eiffel : Gustave Eiffel mort en 1923, domaine public', () => {
    const s = statut({ type: 'ouvrage', auteurs: [{ nom: 'Gustave Eiffel', naissance: 1832, mort: 1923 }], debut: 1887 }, 2026);
    expect(s.code).toBe('domaine-public');
  });

  it('décès en 1955 : libre au 1er janvier 2026 ; en 1956 : protégé jusqu\'au 1er janvier 2027', () => {
    expect(statut({ type: 'ouvrage', auteurs: [{ nom: 'A', naissance: 1880, mort: 1955 }], debut: 1930 }, 2026).code).toBe('domaine-public');
    const s = statut({ type: 'ouvrage', auteurs: [{ nom: 'B', naissance: 1880, mort: 1956 }], debut: 1930 }, 2026);
    expect(s).toMatchObject({ code: 'protege', libreEn: 2027 });
  });

  it('œuvre de collaboration : compte le dernier auteur mort (Atomium, Waterkeyn 2005)', () => {
    const s = statut({ type: 'ouvrage', auteurs: [{ nom: 'André Polak', naissance: 1914, mort: 1988 }, { nom: 'André Waterkeyn', naissance: 1917, mort: 2005 }], debut: 1958 }, 2026);
    expect(s).toMatchObject({ code: 'protege', libreEn: 2076 });
  });

  it('auteur sans date de décès, né il y a moins de 110 ans : vivant, protégé sans date de fin', () => {
    const s = statut({ type: 'ouvrage', auteurs: [{ nom: 'C. Y. Lee', naissance: 1938, mort: null }], debut: 1999 }, 2026);
    expect(s).toMatchObject({ code: 'protege', libreEn: null });
  });

  it('auteur sans date de naissance ni de décès : à vérifier', () => {
    expect(statut({ type: 'ouvrage', auteurs: [{ nom: 'X', naissance: null, mort: null }], debut: 1930 }, 2026).code).toBe('a-verifier');
  });

  it('ouvrage sans auteur connu, commencé il y a plus de 150 ans : domaine public (ancien)', () => {
    expect(statut({ type: 'ouvrage', auteurs: [], debut: -2560 }, 2026).code).toBe('domaine-public');
    expect(statut({ type: 'ouvrage', auteurs: [], debut: 1875 }, 2026).code).toBe('domaine-public');
  });

  it('ouvrage sans auteur connu, de 1876 à 1955 ou sans date : à vérifier', () => {
    expect(statut({ type: 'ouvrage', auteurs: [], debut: 1938 }, 2026).code).toBe('a-verifier');
    expect(statut({ type: 'ouvrage', auteurs: [], debut: null }, 2026).code).toBe('a-verifier');
  });

  it('ouvrage commencé après 1955 : protégé même sans auteur nommé (son auteur ne peut être mort avant 1956)', () => {
    expect(statut({ type: 'ouvrage', auteurs: [], debut: 1982 }, 2026)).toMatchObject({ code: 'protege', libreEn: null });
    expect(statut({ type: 'ouvrage', auteurs: [{ nom: 'HOK', naissance: null, mort: null }], debut: 2012 }, 2026).code).toBe('protege');
  });

  it('un auteur connu et récent suffit, même si un autre (une agence) n\'a pas de dates (Petronas : Pelli 2019)', () => {
    const s = statut({ type: 'ouvrage', auteurs: [{ nom: 'César Pelli', naissance: 1926, mort: 2019 }, { nom: 'Adamson Associates', naissance: null, mort: null }], debut: 1993 }, 2026);
    expect(s).toMatchObject({ code: 'protege', libreEn: 2090 });
  });

  it('auteur né avant 1845 sans date de décès : mort depuis plus de 70 ans (Ictinos, Ve siècle av. J.-C.)', () => {
    const s = statut({ type: 'ouvrage', auteurs: [{ nom: 'Ictinos', naissance: -500, mort: null }, { nom: 'Phidias', naissance: -500, mort: -430 }], debut: -500 }, 2026);
    expect(s.code).toBe('domaine-public');
  });

  it('auteurs sans dates mais ouvrage ancien : domaine public (Angkor, « Empire khmer » pour auteur)', () => {
    expect(statut({ type: 'ouvrage', auteurs: [{ nom: 'Empire khmer', naissance: null, mort: null }], debut: 1200 }, 2026).code).toBe('domaine-public');
  });

  it('ouvrage déclaré ancien par le choix (date absente de Wikidata ou fausse) : domaine public', () => {
    expect(statut({ type: 'ouvrage', auteurs: [], debut: 1987, ancien: true }, 2026).code).toBe('domaine-public');
  });
});
