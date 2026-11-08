import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoDistance } from 'd3-geo';
import { PNG } from 'pngjs';
import { FOV_Y_DEG, FRAMING } from '../../src/camera/config';
import { inArrivalView } from '../../src/camera/framing';
import type { CountryRecord, LngLat } from '../../src/data/types';
import { EARTH_RADIUS_KM } from '../geodata/config';
import { samplePatchPng } from '../geodata/lib/patch';
import { OUT_DIR } from '../geodata/paths';
import { statut, type Statut } from './lib/statut';
import { claimIds, coordOf, label, yearOf, type Entite } from './lib/wikidata';

/**
 * Liste des éléments symboliques par pays (08/11/2026) : `choix.json` (choix éditorial, nom et requête Wikidata) →
 * `monuments.json` (coordonnées, auteurs, statut) et `rapport-monuments.md` (la liste à faire valider).
 * Usage : `npm run monuments` ; les réponses de Wikidata restent dans `.cache` (supprimer pour relire).
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(here, '.cache');
const ANNEE = 2026;
const UA = 'countrizz-geodata-bot/0.1 (https://countrizz.fr) node-fetch/24';
/** Au-delà, un élément est « hors du pays » (même seuil que les capitales, CAPITAL_MAX_OFFSHORE_KM) */
const MAX_LARGE_KM = 25;
const PHONE = { width: 390, height: 844, fovYDeg: FOV_Y_DEG };
const DEG = 180 / Math.PI;

/** `ancien` : antérieur à 1850, quand Wikidata n'a pas de date (ou une fausse) ; `auteurs` : QID d'auteurs absents de Wikidata pour l'élément */
interface Choix { nom: string; q: string; type: 'ouvrage' | 'nature'; qid?: string; note?: string; ancien?: boolean; auteurs?: string[]; alt?: Choix }
interface Resolu {
  nom: string; type: Choix['type']; note?: string; qid: string; wikidata: string; description: string;
  coord: LngLat | null; auteurs: { nom: string; naissance: number | null; mort: number | null }[]; debut: number | null;
  unesco: boolean; statut: Statut; pays: 'dedans' | `${number} km au large` | 'hors du patch' | 'sans coordonnées'; cadre: boolean | null; douteux: boolean;
}

async function json<T>(url: string, file: string): Promise<T> {
  const p = path.join(CACHE, file);
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')) as T;
  // 429 au premier passage du 08/11, requêtes enchaînées sans pause : une par seconde, et l'attente demandée en cas de refus
  let res: Response;
  for (let essai = 0; ; essai++) {
    await new Promise((r) => setTimeout(r, 1000));
    res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.status !== 429 || essai === 4) break;
    await new Promise((r) => setTimeout(r, 1000 * Number(res.headers.get('retry-after') ?? 30)));
  }
  if (!res.ok) throw new Error(`Wikidata HTTP ${res.status} : ${url}`);
  const v = (await res.json()) as T;
  writeFileSync(p, JSON.stringify(v));
  return v;
}

const API = 'https://www.wikidata.org/w/api.php?format=json&';
const slug = (s: string) => s.normalize('NFD').replace(/[^\w]+/g, '_').slice(0, 80);

async function entites(ids: string[]): Promise<Record<string, Entite>> {
  const out: Record<string, Entite> = {};
  for (const id of ids) {
    const r = await json<{ entities: Record<string, Entite> }>(`${API}action=wbgetentities&ids=${id}&props=claims|labels|descriptions&languages=fr|en`, `e_${id}.json`);
    out[id] = r.entities[id]!;
  }
  return out;
}

function placement(c: CountryRecord, png: PNG, p: LngLat): Resolu['pays'] {
  const s = samplePatchPng(png, c.patch, p);
  if (!s) return 'hors du patch';
  if (s.r > 128) return 'dedans';
  const reach = c.patch.rangeTexels * ((2 * c.patch.extentRad * EARTH_RADIUS_KM) / c.patch.size);
  return `${Math.round(((128 - s.r) / 127) * reach)} km au large`;
}

async function resoudre(c: CountryRecord, png: PNG, ch: Choix): Promise<Resolu> {
  let ids: string[];
  if (ch.qid) ids = [ch.qid];
  else {
    const r = await json<{ search: { id: string }[] }>(`${API}action=wbsearchentities&search=${encodeURIComponent(ch.q)}&language=en&limit=5`, `s_${slug(ch.q)}.json`);
    ids = r.search.map((s) => s.id);
  }
  if (ids.length === 0) throw new Error(`${c.cca3} : rien pour « ${ch.q} »`);
  const es = await entites(ids);
  // premier résultat qui a des coordonnées près du pays, sinon le premier qui en a
  const avecCoord = ids.filter((id) => coordOf(es[id]!));
  const pres = avecCoord.find((id) => geoDistance(coordOf(es[id]!)!, c.cap.center) * DEG < c.cap.radiusDeg + 3);
  const qid = pres ?? avecCoord[0] ?? ids[0]!;
  const e = es[qid]!;
  const auteursIds = [...new Set([...claimIds(e, 'P84'), ...claimIds(e, 'P170'), ...claimIds(e, 'P287'), ...(ch.auteurs ?? [])])];
  const as = await entites(auteursIds);
  const auteurs = auteursIds.map((id) => ({ nom: label(as[id]!), naissance: yearOf(as[id]!, 'P569'), mort: yearOf(as[id]!, 'P570') }));
  const debut = yearOf(e, 'P571');
  const coord = coordOf(e);
  return {
    nom: ch.nom, type: ch.type, ...(ch.note ? { note: ch.note } : {}), qid, wikidata: label(e, ['fr', 'en']), description: e.descriptions?.fr?.value ?? e.descriptions?.en?.value ?? '',
    coord, auteurs, debut, unesco: claimIds(e, 'P1435').includes('Q9259'), statut: statut({ type: ch.type, auteurs, debut, ...(ch.ancien ? { ancien: true } : {}) }, ANNEE),
    pays: coord ? placement(c, png, coord) : 'sans coordonnées',
    cadre: coord ? inArrivalView(geoDistance(coord, c.cap.center) * DEG, c, PHONE, FRAMING) : null,
    douteux: qid !== ids[0] || !pres,
  };
}

const STATUT = { nature: 'libre (site naturel)', 'domaine-public': 'libre', protege: 'protégé', 'a-verifier': 'à vérifier' } as const;
const fmt = (p: LngLat | null) => (p ? `${Math.abs(p[1]).toFixed(4)}° ${p[1] >= 0 ? 'N' : 'S'}, ${Math.abs(p[0]).toFixed(4)}° ${p[0] >= 0 ? 'E' : 'O'}` : '—');
function ligne(pays: string, r: Resolu, variante: boolean): string {
  const st = `${STATUT[r.statut.code]}${r.statut.code === 'protege' ? (r.statut.libreEn ? ` jusqu'en ${r.statut.libreEn}` : ', sans date de fin connue') : ''} : ${r.statut.motif}${r.note ? ` ; ${r.note}` : ''}`;
  const lieu = `${r.pays}${r.cadre === false ? ', hors du cadre' : ''}`;
  const wd = `[${r.qid}](https://www.wikidata.org/wiki/${r.qid}) ${r.wikidata}${r.douteux ? ' ⚠︎' : ''}`;
  return `| ${variante ? '↳ variante' : pays} | ${r.nom}${r.unesco ? ' (Unesco)' : ''} | ${fmt(r.coord)} | ${lieu} | ${st} | ${wd} |`;
}

async function main(): Promise<void> {
  mkdirSync(CACHE, { recursive: true });
  const choix = JSON.parse(readFileSync(path.join(here, 'choix.json'), 'utf8')) as Record<string, Choix>;
  const all = JSON.parse(readFileSync(path.join(OUT_DIR, 'countries.json'), 'utf8')) as CountryRecord[];
  const manquants = all.filter((c) => !choix[c.cca3]).map((c) => c.cca3);
  if (manquants.length) throw new Error(`sans élément : ${manquants.join(', ')}`);
  const out: Record<string, { principal: Resolu; variante?: Resolu }> = {};
  const echecs: string[] = [];
  const essai = (c: CountryRecord, png: PNG, ch: Choix) => resoudre(c, png, ch).catch((e: Error) => { echecs.push(e.message); return null; });
  for (const c of [...all].sort((a, b) => a.name.fr.localeCompare(b.name.fr, 'fr'))) {
    const png = PNG.sync.read(readFileSync(path.join(OUT_DIR, c.patch.sdf)));
    const ch = choix[c.cca3]!;
    const principal = await essai(c, png, ch), variante = ch.alt ? await essai(c, png, ch.alt) : null;
    if (principal) out[c.cca3] = { principal, ...(variante ? { variante } : {}) };
  }
  if (echecs.length) throw new Error(`${echecs.length} échecs :\n${echecs.join('\n')}`);
  writeFileSync(path.join(here, 'monuments.json'), `${JSON.stringify(out, null, 1)}\n`);

  const ps = Object.values(out).map((o) => o.principal);
  const compte = (f: (r: Resolu) => boolean) => ps.filter(f).length;
  const lignes = all.slice().sort((a, b) => a.name.fr.localeCompare(b.name.fr, 'fr')).flatMap((c) => {
    const o = out[c.cca3]!;
    return [ligne(c.name.fr, o.principal, false), ...(o.variante ? [ligne(c.name.fr, o.variante, true)] : [])];
  });
  const md = [
    '# Éléments symboliques par pays — liste à valider',
    '',
    `Produit par \`npm run monuments\` (\`scripts/monuments/fetch-monuments.ts\`) depuis \`choix.json\` et Wikidata, le ${new Date().toISOString().slice(0, 10)}.`,
    '',
    `Éléments principaux : ${ps.length} ; libres ${compte((r) => r.statut.code === 'domaine-public')}, sites naturels ${compte((r) => r.statut.code === 'nature')}, protégés ${compte((r) => r.statut.code === 'protege')}, à vérifier ${compte((r) => r.statut.code === 'a-verifier')} ; hors du pays (> ${MAX_LARGE_KM} km) ${compte((r) => r.pays !== 'dedans' && !(r.pays.endsWith('au large') && parseInt(r.pays, 10) <= MAX_LARGE_KM))} ; hors du cadre d'arrivée (téléphone) ${compte((r) => r.cadre === false)}.`,
    '',
    '**Statut** : droit d\'auteur français, règle simplifiée — libre 70 ans après l\'année de décès du dernier auteur (au 1er janvier suivant), hors prorogations de guerre ; auteurs lus dans Wikidata (architecte P84, créateur P170, conçu par P287). « À vérifier » : Wikidata ne nomme pas d\'auteur pour un ouvrage de moins de 150 ans. La liberté de panorama française ne couvre que l\'usage non commercial par des particuliers.',
    '**Lieu** : position dans le pays selon son patch (≤ 25 km au large accepté, comme les capitales) ; « hors du cadre » : invisible à l\'arrivée de la caméra sur téléphone (390 × 844).',
    '**⚠︎** : l\'entité Wikidata retenue n\'est pas le premier résultat de la recherche, ou n\'est pas près du pays ; à relire.',
    '',
    '| Pays | Élément | Coordonnées | Lieu | Statut | Wikidata |',
    '|---|---|---|---|---|---|',
    ...lignes,
    '',
  ].join('\n');
  writeFileSync(path.join(here, 'rapport-monuments.md'), md);
  console.log(md.split('\n')[4]);
}

main().catch((e) => { console.error(e); process.exit(1); });
