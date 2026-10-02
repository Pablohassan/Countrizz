export function capitalOfGame(
  cca3: string,
  wikidata: Record<string, string[]>,
  overrides: Record<string, string>,
): { capital: string; capitals: string[] } {
  const list = [...new Set(wikidata[cca3] ?? [])].sort((a, b) => a.localeCompare(b, 'fr'));
  const forced = overrides[cca3];
  if (forced !== undefined) {
    if (list.length > 0 && !list.includes(forced)) {
      throw new Error(`${cca3} : capitale imposée « ${forced} » absente de la liste Wikidata (${list.join(', ')})`);
    }
    return { capital: forced, capitals: list.length > 0 ? list : [forced] };
  }
  if (list.length === 1) return { capital: list[0]!, capitals: list };
  if (list.length === 0) throw new Error(`Aucune capitale Wikidata pour ${cca3} : ajouter overrides.capitals.${cca3}`);
  throw new Error(`${cca3} a ${list.length} capitales (${list.join(', ')}) : arbitrer dans overrides.capitals.${cca3}`);
}
