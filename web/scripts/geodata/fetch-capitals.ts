import path from 'node:path';
import { PLAYABLE_EXTRA } from './config';
import { readJson, writeJson } from './lib/io';
import { selectPlayable, type MledozeCountry } from './lib/playable';
import { CACHE_DIR, DATA_SRC_DIR } from './paths';

// Kosovo : pas de code P298 dans Wikidata, d'où l'identifiant Q1246. Déclarations P36 sans date de fin, non dépréciées.
const QUERY = `
SELECT ?iso ?capLabel WHERE {
  { ?c wdt:P298 ?iso . } UNION { VALUES ?c { wd:Q1246 } BIND("UNK" AS ?iso) }
  ?c p:P36 ?st . ?st ps:P36 ?cap .
  FILTER NOT EXISTS { ?st pq:P582 ?end . }
  ?st wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
}`;

async function main(): Promise<void> {
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(QUERY)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/sparql-results+json',
      // Politique User-Agent de Wikimedia : client/version (contact) bibliothèque/version
      'User-Agent': 'countrizz-geodata-bot/0.1 (https://countrizz.fr) node-fetch/24',
    },
  });
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status}`);
  const json = (await res.json()) as { results: { bindings: { iso: { value: string }; capLabel: { value: string } }[] } };
  const playable = new Set(
    selectPlayable(readJson<MledozeCountry[]>(path.join(CACHE_DIR, 'mledoze-countries.json')), PLAYABLE_EXTRA).map((c) => c.cca3),
  );
  const out: Record<string, string[]> = {};
  for (const b of json.results.bindings) {
    if (!playable.has(b.iso.value)) continue;
    (out[b.iso.value] ??= []).push(b.capLabel.value);
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])].sort((a, b) => a.localeCompare(b, 'fr'));
  const sorted = Object.fromEntries(Object.keys(out).sort().map((k) => [k, out[k]]));
  writeJson(path.join(DATA_SRC_DIR, 'capitals.fr.json'), sorted);
  const missing = [...playable].filter((c) => !out[c]);
  const multiple = Object.entries(out).filter(([, v]) => v.length > 1);
  console.log(`${Object.keys(out).length} pays avec capitale ; sans : ${missing.join(', ') || 'aucun'}`);
  console.log('À arbitrer :', multiple.map(([k, v]) => `${k} (${v.join(' / ')})`).join(' ; ') || 'rien');
}

main().catch((e) => { console.error(e); process.exit(1); });
