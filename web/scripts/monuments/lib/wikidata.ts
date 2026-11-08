/** Une entité Wikidata telle que la rend `wbgetentities`, réduite à ce qu'on en lit. */
export interface Entite {
  claims: Record<string, Declaration[]>;
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
}
interface Declaration { rank: string; mainsnak: { snaktype: string; datavalue?: { value: unknown } } }

/** Valeurs d'une propriété : rang préféré d'abord, rangs dépréciés et valeurs inconnues écartés. */
function valeurs(e: Entite, p: string): unknown[] {
  const ds = (e.claims[p] ?? []).filter((d) => d.rank !== 'deprecated' && d.mainsnak.snaktype === 'value');
  const pref = ds.filter((d) => d.rank === 'preferred');
  return (pref.length > 0 ? pref : ds).map((d) => d.mainsnak.datavalue!.value);
}

export function yearOf(e: Entite, p: string): number | null {
  const v = valeurs(e, p)[0] as { time: string } | undefined;
  if (!v) return null;
  const m = /^([+-])(\d+)-/.exec(v.time);
  return m ? (m[1] === '-' ? -1 : 1) * Number(m[2]) : null;
}

export function coordOf(e: Entite): [number, number] | null {
  const v = valeurs(e, 'P625')[0] as { latitude: number; longitude: number } | undefined;
  return v ? [v.longitude, v.latitude] : null;
}

export function claimIds(e: Entite, p: string): string[] {
  return valeurs(e, p).map((v) => (v as { id: string }).id);
}

export const label = (e: Entite, langs = ['fr', 'en']): string => {
  for (const l of langs) if (e.labels?.[l]) return e.labels[l].value;
  return '';
};
