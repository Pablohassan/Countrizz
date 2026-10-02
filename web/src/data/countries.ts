import type { CountryRecord } from './types';

export const PLAYABLE_COUNT = 197;

/** Contrôle minimal de countries.json au chargement : un fichier incomplet doit casser tout de suite, pas en partie. */
export function parseCountries(json: unknown): CountryRecord[] {
  if (!Array.isArray(json)) throw new Error('countries.json : tableau attendu');
  if (json.length !== PLAYABLE_COUNT) throw new Error(`countries.json : ${json.length} pays au lieu de ${PLAYABLE_COUNT}`);
  const seen = new Set<string>();
  for (const c of json as Partial<CountryRecord>[]) {
    if (typeof c.cca3 !== 'string') throw new Error('countries.json : pays sans cca3');
    if (seen.has(c.cca3)) throw new Error(`countries.json : ${c.cca3} en double`);
    seen.add(c.cca3);
    if (!c.patch?.sdf || !c.cap || !c.beacon) throw new Error(`countries.json : ${c.cca3} sans patch, calotte ou balise`);
  }
  return json as CountryRecord[];
}

export async function loadCountries(baseUrl = '/'): Promise<CountryRecord[]> {
  const res = await fetch(`${baseUrl}data/countries.json`);
  if (!res.ok) throw new Error(`countries.json : HTTP ${res.status}`);
  return parseCountries(await res.json());
}
