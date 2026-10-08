# Countrizz — Phase 2A, plan 2 : données bilingues et position des capitales · plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `countries.json` porte pour chaque pays son nom et sa capitale en français **et** en anglais, et la position de la capitale de jeu ; la capitale tombe dans son pays et dans le cadre de la caméra à l'arrivée (Kiribati compris), et countrizz.fr sert ces données.

**Architecture:** tout se fait dans la chaîne de génération existante `web/scripts/geodata/` (Node, hors navigateur) : trois petits modules purs (`names`, `capitals`, `capitalPoint`), un ancrage optionnel du corps principal (`mainBody`), une fonction de cadrage (`inArrivalView`) côté caméra ; `build.ts` les assemble. Les arbitrages restent dans `overrides.json`. Les contrôles vont dans `npm run test:data`. Seul Kiribati change de cadre : son patch SDF et son patch image sont régénérés, la Release d'imagerie mise à jour.

**Tech Stack:** TypeScript 5.9, Node 24, `tsx`, Vitest 5 (projets `unit` et `data`), `d3-geo` 3.1.1, `pngjs`, `toktx` 4.4.2 (patch image), `gh` (Release), Docker buildx + `kubectl` (mise en ligne).

**Spec:** `docs/superpowers/specs/2026-10-05-countrizz-phase2a-design.md` §6 ; matière et décisions de l'utilisateur du 05/10 : `docs/superpowers/brainstorm/2026-10-03-phase2a-interface/section-4-donnees-bilingues.md`.

## Faits mesurés le 08/10 qui fixent ce plan

- Natural Earth `ne_10m_populated_places_simple.geojson` existe **au commit déjà épinglé** `9380cca8…` : 7 342 lieux, sha256 `c7b8dbe8918f9b8bc2173bb343078d63d757a7f3d3663e7707e5e9ec4741f94f`. Champs utiles : `name`, `nameascii`, `namealt`, `ls_name`, `featurecla`, `adm0_a3` ; géométrie `Point` [lng, lat].
- Appariement par `adm0_a3` + nom anglais (accents et ponctuation repliés) : **187 / 197** directs ; **Niamey** existe deux fois au Niger (« Admin-1 capital » à 7,10° E, faux, et « Admin-0 capital » à 2,11° E) → on préfère toujours `featurecla` « Admin-0 capital… ».
- 10 cas (le relevé cloud du 05/10 en listait d'autres : il est périmé) :
  - **alias** vers le nom Natural Earth : AND « Andorra », GRD « Saint George's », KIR « Tarawa », MNG « Ulaanbaatar », SMR « San Marino » ;
  - **points imposés**, sources lues le 08/10 : GNQ Ciudad de la Paz `[10.8236, 1.5925]` (spec §13.2) ; NRU Yaren `[166.925, -0.54556]` (Wikipedia « Yaren District », 0°32′44″S 166°55′30″E ; absent de Natural Earth) ; PLW Ngerulmud `[134.62417, 7.50056]` (Wikipedia « Ngerulmud », 7°30′2″N 134°37′27″E ; NE n'a que Melekeok) ; PSE Jérusalem-Est `[35.23417, 31.77667]` (Wikipedia « Old City (Jerusalem) », 31°46′36″N 35°14′03″E ; NE n'a que « Jerusalem » côté ISR).
- Capitale hors du pays selon son patch SDF actuel : ATG 0,06 km, BRN 0,22 km, COM 0,45 km, MHL 7,4 km, TUV 2,4 km (capitales littorales, contour simplifié) ; MCO saturé (le patch ne mesure pas au-delà de 0,16 km) ; KIR hors patch.
- Capitale dans le cadre à l'arrivée (cadrage `FRAMING` réel, 390×844 et 960×600) : **toutes sauf KIR** (Tarawa à 28,74° du centre de la calotte, posée sur Kiritimati, îles de la Ligne).
- mledoze : `translations.fra` présent pour les 197 ; une seule capitale anglaise pour tous sauf ZAF (3) ; aucun doublon de nom FR, de capitale FR ni de nom EN aujourd'hui.

## Global Constraints

- **Aucun nouveau paquet** (spec §1).
- Schéma (spec §6) : `name: { fr, en }`, `capital: { fr, en }`, `capitals: { fr: [], en: [] }`, nouveau `capitalLngLat` ; **un seul** `countries.json` bilingue.
- EN : mledoze `name.common` **tel quel** (« DR Congo », « Ivory Coast », « Türkiye »…) ; capitale mledoze, sauf arbitrages `overrides.capitals.<cca3>` en `{ fr, en }` (BEN, BOL, GNQ, LKA, MYS, PAK, PSE, SWZ, YEM, ZAF).
- FR : inchangé, sauf `overrides.names.fr` : **RD Congo**, **Cap-Vert**, **Vatican** ; Ukraine : **Kiev** (FR) / Kyiv (EN, mledoze) ; Guinée équatoriale : **Ciudad de la Paz** en FR et en EN.
- Contrôles : libellés complets et uniques par langue, arbitrages complets, capitale dans le pays (ou à moins de **25 km** de sa côte), capitale dans le cadre de la caméra à l'arrivée.
- Le Mac fait foi : `npm run check && npm run test:data && npm run e2e && npm run budget` verts avant toute image.
- **Écritures hors du dépôt sur GO explicite de l'utilisateur, commande exacte montrée** : envoi de la Release GitHub, envoi Docker Hub, `kubectl apply`. Déploiement **comme agi-so** : `deploy/k8s/countrizz.yaml` appliqué depuis rpi1, rien sur le proxy .60.
- Chaque commande se lance depuis `web/` sauf mention contraire.

## Review Focus

1. **Noms avec apostrophe, accent ou tiret** (« Sana'a », « Saint George's », « Ulaanbaatar », « Bogotá ») : l'appariement les retrouve → test de `foldName` et de `capitalPoint` (Task 3).
2. **Homonymes dans un même pays** (Niamey en double) : on prend la capitale nationale, et deux candidats de même rang font échouer le build au lieu d'en choisir un au hasard → tests (Task 3).
3. **Capitale de l'autre côté de l'antiméridien** (Fidji, Tuvalu, Kiribati à 173° E pour une calotte à −158°) : la distance au centre est une distance angulaire (`geoDistance`), jamais une différence de longitudes → test de données (Task 6) et test de l'ancrage (Task 4).
4. **Ancien `countries.json` à libellés simples** (cache du navigateur, futur service worker) : le jeu le refuse avec un message clair au lieu d'afficher « [object Object] » ou de planter plus loin → test (Task 6).
5. **Faute de frappe dans un arbitrage** (`en` vide, capitale FR absente de Wikidata, alias introuvable) : le build s'arrête en nommant le pays et la clé à corriger → tests (Tasks 2 et 3) et contrôle de complétude (Task 6).

---

### Task 1: Épingler Natural Earth populated places

**Files:**
- Modify: `web/scripts/geodata/config.ts` (objet `SOURCES`)
- Modify: `web/scripts/geodata/fetch-sources.ts:11-17,33-38`
- Modify (généré) : `web/scripts/geodata/sources.lock.json`

**Interfaces:**
- Produces : le fichier `web/scripts/geodata/.cache/ne_10m_populated_places_simple.geojson` (hors dépôt, comme les autres sources) et l'entrée `naturalEarthPlaces` du verrou.

- [ ] **Step 1: Ajouter la source**

Dans `config.ts`, dans `SOURCES`, après `naturalEarthDisputed` :

```ts
  naturalEarthPlaces: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_SHA}/geojson/ne_10m_populated_places_simple.geojson`,
```

- [ ] **Step 2: L'épingler dans `fetch-sources.ts`**

Dans l'interface `Lock`, après `naturalEarthDisputed?: LockEntry;` :

```ts
  naturalEarthPlaces?: LockEntry;
```

Dans `main()`, après le bloc `lock.naturalEarthDisputed = …` :

```ts
  lock.naturalEarthPlaces = await pinned('naturalEarthPlaces', SOURCES.naturalEarthPlaces, lock.naturalEarthPlaces,
    path.join(CACHE_DIR, 'ne_10m_populated_places_simple.geojson'));
```

- [ ] **Step 3: Télécharger et vérifier l'empreinte**

Run: `npm run geodata:fetch` (réseau : re-vérifie aussi toutes les sources déjà épinglées)
Puis : `node -e 'console.log(require("./scripts/geodata/sources.lock.json").naturalEarthPlaces)'`
Expected: `sha256: 'c7b8dbe8918f9b8bc2173bb343078d63d757a7f3d3663e7707e5e9ec4741f94f'` (mesuré le 08/10). Une autre empreinte = s'arrêter et le signaler.

- [ ] **Step 4: Commit**

```bash
git add web/scripts/geodata/config.ts web/scripts/geodata/fetch-sources.ts web/scripts/geodata/sources.lock.json
git commit -m "geodata : Natural Earth populated places épinglé (positions des capitales)"
```

---

### Task 2: Libellés bilingues (noms et capitales)

**Files:**
- Create: `web/scripts/geodata/lib/names.ts`
- Modify: `web/scripts/geodata/lib/capitals.ts` (réécrit)
- Modify: `web/src/data/types.ts` (ajout du type `Libelle` seulement ; le reste du schéma change en Task 6)
- Modify: `web/scripts/geodata/lib/join.ts:6-19` (interface `Overrides`)
- Modify: `web/scripts/geodata/overrides.json`
- Test: `web/scripts/geodata/__tests__/unit/names.test.ts` (créé), `web/scripts/geodata/__tests__/unit/capitals.test.ts` (réécrit)

**Interfaces:**
- Produces :
  - `export interface Libelle { fr: string; en: string }` dans `src/data/types.ts`
  - `nameOf(c: Pick<MledozeCountry, 'cca3' | 'name' | 'translations'>, frOverrides: Record<string, string>): Libelle`
  - `capitalOfGame(cca3: string, wikidataFr: Record<string, string[]>, mledozeEn: string[], overrides: Record<string, CapitalOverride>): { capital: Libelle; capitals: { fr: string[]; en: string[] } }`
  - `export interface CapitalOverride { fr: string; en: string }`
  - `Overrides` gagne `capitals: Record<string, CapitalOverride>`, `names: { fr: Record<string, string> }` (et, en Tasks 3-4, `capitalPoints`, `mainBodyAnchor`).

- [ ] **Step 1: Écrire les tests (qui échouent)**

`web/scripts/geodata/__tests__/unit/names.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { nameOf } from '../../lib/names';

const cod = { cca3: 'COD', name: { common: 'DR Congo' }, translations: { fra: { common: 'Congo (Rép. dém.)', official: '' } } };
const fra = { cca3: 'FRA', name: { common: 'France' }, translations: { fra: { common: 'France', official: '' } } };

describe('nameOf', () => {
  it('FR de mledoze, EN mledoze tel quel', () => {
    expect(nameOf(fra, {})).toEqual({ fr: 'France', en: 'France' });
  });
  it('FR raccourci par overrides.names.fr, EN inchangé', () => {
    expect(nameOf(cod, { COD: 'RD Congo' })).toEqual({ fr: 'RD Congo', en: 'DR Congo' });
  });
  it('sans traduction française ni arbitrage : erreur qui nomme la clé', () => {
    expect(() => nameOf({ cca3: 'XXX', name: { common: 'X' }, translations: {} }, {})).toThrow(/overrides\.names\.fr\.XXX/);
  });
});
```

`web/scripts/geodata/__tests__/unit/capitals.test.ts` (remplace le fichier) :

```ts
import { describe, expect, it } from 'vitest';
import { capitalOfGame } from '../../lib/capitals';

const wd = { FRA: ['Paris'], ZAF: ['Pretoria', 'Le Cap', 'Bloemfontein'], LKA: ['Sri Jayawardenapura', 'Colombo'], XXX: [] as string[] };
const ZAF = { fr: 'Pretoria', en: 'Pretoria' };

describe('capitalOfGame', () => {
  it('une capitale de chaque côté : retenue dans les deux langues', () => {
    expect(capitalOfGame('FRA', wd, ['Paris'], {})).toEqual({
      capital: { fr: 'Paris', en: 'Paris' }, capitals: { fr: ['Paris'], en: ['Paris'] },
    });
  });
  it('arbitrage { fr, en } : retenu, listes triées, EN ajouté à la liste mledoze', () => {
    expect(capitalOfGame('LKA', wd, ['Colombo'], { LKA: { fr: 'Sri Jayawardenapura', en: 'Sri Jayawardenepura Kotte' } })).toEqual({
      capital: { fr: 'Sri Jayawardenapura', en: 'Sri Jayawardenepura Kotte' },
      capitals: { fr: ['Colombo', 'Sri Jayawardenapura'], en: ['Colombo', 'Sri Jayawardenepura Kotte'] },
    });
  });
  it('plusieurs capitales françaises sans arbitrage : erreur explicite', () => {
    expect(() => capitalOfGame('ZAF', wd, ['Pretoria'], {})).toThrow(/arbitrer dans overrides\.capitals\.ZAF/);
  });
  it('plusieurs capitales anglaises sans arbitrage : erreur explicite', () => {
    expect(() => capitalOfGame('FRA', wd, ['Paris', 'Versailles'], {})).toThrow(/capitales anglaises.*overrides\.capitals\.FRA/);
  });
  it('arbitrage FR absent de la liste Wikidata : erreur (faute de frappe)', () => {
    expect(() => capitalOfGame('ZAF', wd, ['Pretoria'], { ZAF: { fr: 'Pretoria ', en: 'Pretoria' } })).toThrow(/absente de la liste/);
  });
  it('arbitrage incomplet (en vide) : erreur', () => {
    expect(() => capitalOfGame('ZAF', wd, ['Pretoria'], { ZAF: { fr: 'Pretoria', en: ' ' } })).toThrow(/incomplet/);
  });
  it('aucune capitale : erreur explicite', () => {
    expect(() => capitalOfGame('XXX', wd, [], {})).toThrow(/Aucune capitale/);
  });
  it('arbitrage ZAF : capitale de jeu Pretoria', () => {
    expect(capitalOfGame('ZAF', wd, ['Pretoria', 'Bloemfontein', 'Cape Town'], { ZAF }).capital).toEqual(ZAF);
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `npx vitest run --project unit scripts/geodata/__tests__/unit/names.test.ts scripts/geodata/__tests__/unit/capitals.test.ts`
Expected: FAIL (`Cannot find module '../../lib/names'` ; signature de `capitalOfGame` différente).

- [ ] **Step 3: Implémenter**

Dans `web/src/data/types.ts`, juste après le type `LngLat` :

```ts
/** Libellé dans les deux langues du jeu. */
export interface Libelle { fr: string; en: string }
```

`web/scripts/geodata/lib/names.ts` :

```ts
import type { Libelle } from '../../../src/data/types';
import type { MledozeCountry } from './playable';

/** Nom de jeu : FR de mledoze (ou raccourci de overrides.names.fr), EN = mledoze `name.common` tel quel (décision du 05/10). */
export function nameOf(c: Pick<MledozeCountry, 'cca3' | 'name' | 'translations'>, frOverrides: Record<string, string>): Libelle {
  const fr = frOverrides[c.cca3] ?? c.translations.fra?.common;
  if (!fr) throw new Error(`${c.cca3} : pas de nom français chez mledoze (translations.fra) — ajouter overrides.names.fr.${c.cca3}`);
  return { fr, en: c.name.common };
}
```

`web/scripts/geodata/lib/capitals.ts` (remplace le fichier) :

```ts
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
```

Dans `join.ts`, en tête : `import type { CapitalOverride } from './capitals';` ; dans `Overrides`, remplacer la ligne `capitals` et ajouter `names` :

```ts
  /** cca3 → capitale de jeu imposée, dans les deux langues (le FR doit figurer dans la liste Wikidata) */
  capitals: Record<string, CapitalOverride>;
  /** noms de jeu imposés par langue (FR raccourcis, décision du 05/10) */
  names: { fr: Record<string, string> };
```

Dans `overrides.json`, remplacer le bloc `capitals` et ajouter `names` juste après :

```json
  "capitals": {
    "BEN": { "fr": "Porto-Novo", "en": "Porto-Novo" },
    "BOL": { "fr": "Sucre", "en": "Sucre" },
    "GNQ": { "fr": "Ciudad de la Paz", "en": "Ciudad de la Paz" },
    "LKA": { "fr": "Sri Jayawardenapura", "en": "Sri Jayawardenepura Kotte" },
    "MYS": { "fr": "Kuala Lumpur", "en": "Kuala Lumpur" },
    "PAK": { "fr": "Islamabad", "en": "Islamabad" },
    "PSE": { "fr": "Jérusalem-Est", "en": "East Jerusalem" },
    "SWZ": { "fr": "Mbabane", "en": "Mbabane" },
    "YEM": { "fr": "Sanaa", "en": "Sana'a" },
    "ZAF": { "fr": "Pretoria", "en": "Pretoria" }
  },
  "names": {
    "fr": { "COD": "RD Congo", "CPV": "Cap-Vert", "VAT": "Vatican" }
  },
```

- [ ] **Step 4: Vérifier qu'ils passent**

Run: `npx vitest run --project unit scripts/geodata/__tests__/unit/names.test.ts scripts/geodata/__tests__/unit/capitals.test.ts`
Expected: PASS (3 + 8 tests). `npm run check` peut encore échouer sur `build.ts` (appel de `capitalOfGame` à 3 arguments) : c'est la Task 6 qui le branche ; ne pas committer `build.ts` ici.

- [ ] **Step 5: Commit**

```bash
git add web/src/data/types.ts web/scripts/geodata/lib/names.ts web/scripts/geodata/lib/capitals.ts web/scripts/geodata/lib/join.ts web/scripts/geodata/overrides.json web/scripts/geodata/__tests__/unit/names.test.ts web/scripts/geodata/__tests__/unit/capitals.test.ts
git commit -m "geodata : noms et capitales en français et en anglais (arbitrages du 05/10)"
```

---

### Task 3: Position de la capitale de jeu

**Files:**
- Create: `web/scripts/geodata/lib/capitalPoint.ts`
- Modify: `web/scripts/geodata/lib/join.ts` (interface `Overrides`)
- Modify: `web/scripts/geodata/overrides.json`
- Modify: `web/scripts/geodata/config.ts`
- Test: `web/scripts/geodata/__tests__/unit/capitalPoint.test.ts`

**Interfaces:**
- Consumes : `LngLat` (`src/data/types.ts`).
- Produces :
  - `export interface Place { properties: { name: string | null; nameascii: string | null; namealt: string | null; ls_name: string | null; featurecla: string; adm0_a3: string }; geometry: { type: 'Point'; coordinates: number[] } }`
  - `export type CapitalPointRule = { alias: string; why: string } | { lngLat: LngLat; source: string }`
  - `foldName(s: string | null | undefined): string`
  - `capitalPoint(cca3: string, neCode: string, capitalEn: string, places: Place[], rule?: CapitalPointRule): LngLat`
  - `offshoreKm(geometry: MultiPolygon, p: LngLat): number` — 0 si le point est dans le pays, sinon distance (km) au sommet de contour le plus proche.
  - `CAPITAL_MAX_OFFSHORE_KM = 25` dans `config.ts`.
  - `Overrides.capitalPoints: Record<string, CapitalPointRule>`.

- [ ] **Step 1: Écrire les tests (qui échouent)**

`web/scripts/geodata/__tests__/unit/capitalPoint.test.ts` :

```ts
import type { MultiPolygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { capitalPoint, foldName, offshoreKm, type Place } from '../../lib/capitalPoint';
import { forD3 } from '../../lib/geometry';

const place = (name: string, adm0: string, featurecla: string, lng: number, lat: number, extra: Partial<Place['properties']> = {}): Place => ({
  properties: { name, nameascii: name, namealt: null, ls_name: null, featurecla, adm0_a3: adm0, ...extra },
  geometry: { type: 'Point', coordinates: [lng, lat] },
});
const places: Place[] = [
  place('Niamey', 'NER', 'Admin-1 capital', 7.096404, 13.491643),
  place('Niamey', 'NER', 'Admin-0 capital', 2.11471, 13.518652),
  place("Saint George's", 'GRD', 'Admin-0 capital', -61.7417, 12.0526),
  place('Ulaanbaatar', 'MNG', 'Admin-0 capital', 106.9147, 47.9187),
  place('Paris', 'FRA', 'Admin-0 capital', 2.3522, 48.8566),
  place('Paris', 'USA', 'Populated place', -95.5555, 33.6609),
  place('Twin', 'XXX', 'Admin-0 capital', 1, 1),
  place('Twin', 'XXX', 'Admin-0 capital alt', 2, 2),
];

describe('foldName', () => {
  it('replie accents, apostrophes, tirets et casse', () => {
    expect(foldName("Sana'a")).toBe(foldName('Sanaa'));
    expect(foldName('Bogotá')).toBe('bogota');
    expect(foldName('Porto-Novo')).toBe(foldName('porto novo'));
    expect(foldName(null)).toBe('');
  });
});

describe('capitalPoint', () => {
  it('apparie par pays et par nom anglais', () => {
    expect(capitalPoint('FRA', 'FRA', 'Paris', places)).toEqual([2.3522, 48.8566]);
  });
  it('homonymes dans le pays : la capitale nationale (Niamey)', () => {
    expect(capitalPoint('NER', 'NER', 'Niamey', places)).toEqual([2.11471, 13.518652]);
  });
  it('alias vers le nom Natural Earth', () => {
    expect(capitalPoint('MNG', 'MNG', 'Ulan Bator', places, { alias: 'Ulaanbaatar', why: 'translittération' })).toEqual([106.9147, 47.9187]);
    expect(capitalPoint('GRD', 'GRD', "St. George's", places, { alias: "Saint George's", why: 'abréviation' })).toEqual([-61.7417, 12.0526]);
  });
  it('point imposé : rendu tel quel', () => {
    expect(capitalPoint('NRU', 'NRU', 'Yaren', places, { lngLat: [166.925, -0.54556], source: 'Wikipedia' })).toEqual([166.925, -0.54556]);
  });
  it('introuvable : erreur qui nomme la clé à remplir', () => {
    expect(() => capitalPoint('AND', 'AND', 'Andorra la Vella', places)).toThrow(/overrides\.capitalPoints\.AND/);
  });
  it('deux candidats de même rang : erreur au lieu d\'un choix arbitraire', () => {
    expect(() => capitalPoint('XXX', 'XXX', 'Twin', places)).toThrow(/2 lieux/);
  });
});

describe('offshoreKm', () => {
  const square = forD3({ type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] }) as MultiPolygon;
  it('0 pour un point dans le pays', () => {
    expect(offshoreKm(square, [0.5, 0.5])).toBe(0);
  });
  it('distance au contour pour un point en mer (0,1° ≈ 11 km)', () => {
    expect(offshoreKm(square, [1.1, 0])).toBeGreaterThan(10);
    expect(offshoreKm(square, [1.1, 0])).toBeLessThan(12);
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `npx vitest run --project unit scripts/geodata/__tests__/unit/capitalPoint.test.ts`
Expected: FAIL (`Cannot find module '../../lib/capitalPoint'`).

- [ ] **Step 3: Implémenter**

`web/scripts/geodata/lib/capitalPoint.ts` :

```ts
import { geoContains, geoDistance } from 'd3-geo';
import type { MultiPolygon } from 'geojson';
import type { LngLat } from '../../../src/data/types';
import { EARTH_RADIUS_KM } from '../config';

/** Lieu de Natural Earth `ne_10m_populated_places_simple` (champs utilisés seulement). */
export interface Place {
  properties: { name: string | null; nameascii: string | null; namealt: string | null; ls_name: string | null; featurecla: string; adm0_a3: string };
  geometry: { type: 'Point'; coordinates: number[] };
}

/** Arbitrage de position : nom tel qu'écrit dans Natural Earth, ou point imposé avec sa source. */
export type CapitalPointRule = { alias: string; why: string } | { lngLat: LngLat; source: string };

/** Comparaison de noms sans accents, apostrophes, tirets ni casse (« Sana'a » = « Sanaa »). */
export const foldName = (s: string | null | undefined): string =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

/**
 * Position de la capitale de jeu : le lieu Natural Earth du pays (`adm0_a3` = code NE) dont un des noms est la capitale
 * anglaise (ou l'alias) ; à homonymie, la capitale nationale (« Admin-0 capital… ») ; un point imposé passe tel quel.
 */
export function capitalPoint(cca3: string, neCode: string, capitalEn: string, places: Place[], rule?: CapitalPointRule): LngLat {
  if (rule && 'lngLat' in rule) return rule.lngLat;
  const wanted = rule?.alias ?? capitalEn;
  const key = foldName(wanted);
  const found = places.filter((f) => f.properties.adm0_a3 === neCode
    && [f.properties.name, f.properties.nameascii, f.properties.namealt, f.properties.ls_name].some((n) => foldName(n) === key));
  const national = found.filter((f) => f.properties.featurecla.startsWith('Admin-0 capital'));
  const pick = national.length > 0 ? national : found;
  if (pick.length === 0) {
    throw new Error(`${cca3} : « ${wanted} » introuvable dans Natural Earth (${neCode}) — alias ou point dans overrides.capitalPoints.${cca3}`);
  }
  if (pick.length > 1) {
    throw new Error(`${cca3} : ${pick.length} lieux « ${wanted} » de même rang dans Natural Earth — trancher dans overrides.capitalPoints.${cca3}`);
  }
  const [lng, lat] = pick[0]!.geometry.coordinates;
  return [lng!, lat!];
}

/** 0 si `p` est dans le pays ; sinon distance en km au sommet de contour le plus proche (majorant, contours denses). */
export function offshoreKm(geometry: MultiPolygon, p: LngLat): number {
  if (geoContains(geometry, p)) return 0;
  let best = Infinity;
  for (const poly of geometry.coordinates) for (const ring of poly) for (const q of ring) {
    best = Math.min(best, geoDistance(p, [q[0]!, q[1]!]));
  }
  return best * EARTH_RADIUS_KM;
}
```

Dans `config.ts`, à la fin :

```ts
/** Une capitale littorale peut tomber hors d'un contour simplifié ; au-delà de cette distance, c'est une erreur de point. */
export const CAPITAL_MAX_OFFSHORE_KM = 25;
```

Dans `join.ts` : `import type { CapitalPointRule } from './capitalPoint';` et, dans `Overrides` :

```ts
  /** cca3 → nom Natural Earth de la capitale (alias) ou point imposé sourcé */
  capitalPoints: Record<string, CapitalPointRule>;
```

Dans `overrides.json`, après `names` :

```json
  "capitalPoints": {
    "AND": { "alias": "Andorra", "why": "Natural Earth nomme Andorre-la-Vieille « Andorra »" },
    "GRD": { "alias": "Saint George's", "why": "mledoze écrit « St. George's »" },
    "KIR": { "alias": "Tarawa", "why": "Natural Earth nomme Tarawa-Sud « Tarawa »" },
    "MNG": { "alias": "Ulaanbaatar", "why": "mledoze écrit « Ulan Bator »" },
    "SMR": { "alias": "San Marino", "why": "mledoze écrit « City of San Marino »" },
    "GNQ": { "lngLat": [10.8236, 1.5925], "source": "geodatos.net (Djibloho), spec 2A §13.2 ; absente de Natural Earth" },
    "NRU": { "lngLat": [166.925, -0.54556], "source": "Wikipedia « Yaren District » 0°32′44″S 166°55′30″E, lu le 08/10/2026 ; absente de Natural Earth" },
    "PLW": { "lngLat": [134.62417, 7.50056], "source": "Wikipedia « Ngerulmud » 7°30′2″N 134°37′27″E, lu le 08/10/2026 ; Natural Earth n'a que Melekeok" },
    "PSE": { "lngLat": [35.23417, 31.77667], "source": "Wikipedia « Old City (Jerusalem) » 31°46′36″N 35°14′03″E, lu le 08/10/2026 ; Natural Earth n'a que « Jerusalem » (ISR)" }
  },
```

- [ ] **Step 4: Vérifier qu'ils passent**

Run: `npx vitest run --project unit scripts/geodata/__tests__/unit/capitalPoint.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add web/scripts/geodata/lib/capitalPoint.ts web/scripts/geodata/lib/join.ts web/scripts/geodata/config.ts web/scripts/geodata/overrides.json web/scripts/geodata/__tests__/unit/capitalPoint.test.ts
git commit -m "geodata : position des capitales (Natural Earth, alias et points imposés sourcés)"
```

---

### Task 4: Corps principal ancré sur la capitale (Kiribati)

**Files:**
- Modify: `web/scripts/geodata/lib/mainBody.ts`
- Modify: `web/scripts/geodata/lib/join.ts` (interface `Overrides`)
- Modify: `web/scripts/geodata/overrides.json`
- Test: `web/scripts/geodata/__tests__/unit/mainBody.test.ts`

**Interfaces:**
- Produces : `mainBody(polys: PolygonCoords[], opts: { maxDistanceDeg: number; areaShare: number }, anchor?: LngLat): MainBody` — sans `anchor`, comportement **identique** à aujourd'hui (le plus grand polygone sert de référence) ; avec `anchor`, la référence est le polygone dont le centroïde est le plus proche de l'ancre, et il est toujours gardé. `Overrides.mainBodyAnchor: Record<string, string>` (cca3 → motif).

- [ ] **Step 1: Écrire les tests (qui échouent)**

Ajouter à la fin du `describe('mainBody', …)` de `mainBody.test.ts` :

```ts
  it('ancre : le corps principal suit la capitale, même loin du plus grand polygone (Kiribati)', () => {
    const line = box(-158, 1.5, 0.6, 0.4);    // Kiritimati, la plus grande terre, îles de la Ligne
    const gilbert = box(172.9, 1.3, 0.2, 0.2); // Tarawa, de l'autre côté de l'antiméridien
    expect(mainBody([line, gilbert], opts).kept).toEqual([line]);
    const r = mainBody([line, gilbert], opts, [173.0176, 1.3382]);
    expect(r.kept).toEqual([gilbert]);
    expect(r.excluded).toEqual([line]);
  });

  it('ancre : le polygone de l\'ancre est gardé même s\'il est petit', () => {
    const big = box(0, 0, 2, 2);
    const small = box(3, 0, 0.1, 0.1);
    expect(mainBody([big, small], opts, [3.05, 0.05]).kept).toContain(small);
  });
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `npx vitest run --project unit scripts/geodata/__tests__/unit/mainBody.test.ts`
Expected: FAIL sur les deux nouveaux tests (l'ancre est ignorée).

- [ ] **Step 3: Implémenter**

`web/scripts/geodata/lib/mainBody.ts` (remplace le fichier) :

```ts
import { geoCentroid, geoDistance } from 'd3-geo';
import { polygonAreaKm2, type PolygonCoords } from './geometry';

export interface MainBody { kept: PolygonCoords[]; excluded: PolygonCoords[] }

/**
 * Corps principal : les polygones à moins de `maxDistanceDeg` d'une référence, gardés par surface décroissante jusqu'à
 * `areaShare` de leur total. Référence : le plus grand polygone ; ou, avec `anchor` (overrides.mainBodyAnchor), le
 * polygone le plus proche de l'ancre (la capitale), toujours gardé.
 */
export function mainBody(polys: PolygonCoords[], opts: { maxDistanceDeg: number; areaShare: number }, anchor?: [number, number]): MainBody {
  if (polys.length === 0) throw new Error('mainBody : aucun polygone');
  const items = polys
    .map((p) => ({ p, area: polygonAreaKm2(p), c: geoCentroid({ type: 'Polygon', coordinates: p }) }))
    .sort((a, b) => b.area - a.area);
  const ref = anchor
    ? items.reduce((best, i) => (geoDistance(anchor, i.c) < geoDistance(anchor, best.c) ? i : best))
    : items[0]!;
  const near = [ref, ...items.filter((i) => i !== ref && (geoDistance(ref.c, i.c) * 180) / Math.PI <= opts.maxDistanceDeg)];
  const total = near.reduce((s, i) => s + i.area, 0);
  const kept: PolygonCoords[] = [];
  let acc = 0;
  for (const i of near) {
    kept.push(i.p);
    acc += i.area;
    if (acc >= opts.areaShare * total) break;
  }
  const keptSet = new Set(kept);
  return { kept, excluded: items.map((i) => i.p).filter((p) => !keptSet.has(p)) };
}
```

(Sans ancre, `items[0]` était déjà le premier de `near` : l'ordre et le résultat sont inchangés pour les 196 autres pays — vérifié en Task 6 par le diff de `countries.json`.)

Dans `join.ts`, dans `Overrides` :

```ts
  /** cca3 → motif : le corps principal (calotte, patch, cadrage) est ancré sur la capitale de jeu */
  mainBodyAnchor: Record<string, string>;
```

Dans `overrides.json`, après `capitalPoints` :

```json
  "mainBodyAnchor": {
    "KIR": "Tarawa (capitale) est dans les îles Gilbert ; sans ancrage, le corps principal est Kiritimati (îles de la Ligne), à 28,7° de la capitale, hors du cadre à l'arrivée (mineur n° 2 de la phase 0)"
  },
```

- [ ] **Step 4: Vérifier qu'ils passent**

Run: `npx vitest run --project unit scripts/geodata/__tests__/unit/mainBody.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/scripts/geodata/lib/mainBody.ts web/scripts/geodata/lib/join.ts web/scripts/geodata/overrides.json web/scripts/geodata/__tests__/unit/mainBody.test.ts
git commit -m "geodata : corps principal ancré sur la capitale quand overrides.mainBodyAnchor le demande (Kiribati)"
```

---

### Task 5: Un point est-il dans le cadre à l'arrivée ?

**Files:**
- Modify: `web/src/camera/framing.ts`
- Test: `web/src/camera/framing.test.ts`

**Interfaces:**
- Consumes : `frameAltitude`, `limitingHalfAngle`, `Viewport`, `FramingParams` (même fichier).
- Produces : `inArrivalView(offsetDeg: number, capRadiusDeg: number, v: Viewport, p: FramingParams): boolean` — `offsetDeg` = distance angulaire (au centre de la Terre) entre le point et le centre visé par la caméra. Sert ici au contrôle de données ; resservira à l'étiquette R3 et aux épingles G5.

- [ ] **Step 1: Écrire les tests (qui échouent)**

Ajouter à `web/src/camera/framing.test.ts` (en important `inArrivalView` avec les autres) :

```ts
describe('inArrivalView', () => {
  const P = { k: 1, margin: 3, floor: 0.0003, overview: { landscape: 1.4, portrait: 2.2 }, minContextDeg: 3 };
  const phone = { width: 390, height: 844, fovYDeg: 50 };
  const desk = { width: 960, height: 600, fovYDeg: 50 };
  it('le centre visé est toujours dans le cadre', () => {
    expect(inArrivalView(0, 5, phone, P)).toBe(true);
  });
  it('le bord de la calotte occupe 1/m du demi-champ : dans le cadre', () => {
    expect(inArrivalView(5, 5, phone, P)).toBe(true);
    expect(inArrivalView(5, 5, desk, P)).toBe(true);
  });
  it('Kiribati avant ancrage : Tarawa à 28,74° d\'une calotte de 1,54° est hors cadre', () => {
    expect(inArrivalView(28.74, 1.54, phone, P)).toBe(false);
    expect(inArrivalView(28.74, 1.54, desk, P)).toBe(false);
  });
  it('un point derrière l\'horizon n\'est jamais dans le cadre', () => {
    expect(inArrivalView(95, 20, desk, P)).toBe(false);
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `npx vitest run --project unit src/camera/framing.test.ts`
Expected: FAIL (`inArrivalView` n'est pas exporté).

- [ ] **Step 3: Implémenter**

À la fin de `web/src/camera/framing.ts` :

```ts
/**
 * Un point à `offsetDeg` du centre visé (distance angulaire au centre de la Terre) est-il dans le cadre quand la caméra
 * arrive au-dessus de ce centre, à l'altitude de `frameAltitude` ? Caméra à d = 1 + altitude rayons du centre, regard
 * vers le centre : le point est vu sous l'angle β = atan2(sin t, d − cos t) ; il faut β ≤ α (demi-champ limitant) et le
 * point en deçà de l'horizon (cos t > 1 / d).
 */
export function inArrivalView(offsetDeg: number, capRadiusDeg: number, v: Viewport, p: FramingParams): boolean {
  const d = 1 + frameAltitude(capRadiusDeg, v, p);
  const t = offsetDeg * RAD;
  if (Math.cos(t) <= 1 / d) return false;
  return Math.atan2(Math.sin(t), d - Math.cos(t)) <= limitingHalfAngle(v);
}
```

- [ ] **Step 4: Vérifier qu'ils passent**

Run: `npx vitest run --project unit src/camera/framing.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/camera/framing.ts web/src/camera/framing.test.ts
git commit -m "camera : inArrivalView, un point est-il dans le cadre à l'arrivée"
```

---

### Task 6: `countries.json` bilingue avec la position des capitales

**Files:**
- Modify: `web/src/data/types.ts` (`CountryRecord`)
- Modify: `web/src/data/types.test.ts`
- Modify: `web/src/data/countries.ts` (`parseCountries`)
- Modify: `web/src/data/countries.test.ts`
- Modify: `web/src/main.tsx:56`
- Modify: `web/scripts/geodata/build.ts`
- Modify: `web/scripts/geodata/__tests__/data/output.test.ts:25-30`
- Modify: `web/scripts/geodata/__tests__/data/kosovo.test.ts:10`
- Create: `web/scripts/geodata/__tests__/data/labels.test.ts`
- Create: `web/scripts/geodata/__tests__/data/capitalPoints.test.ts`
- Modify (généré) : `web/public/data/countries.json`, `web/public/data/patches/sdf/kir.png`, `web/scripts/geodata/rapport-geodata.md`

**Interfaces:**
- Consumes : `nameOf`, `capitalOfGame` (Task 2) ; `capitalPoint`, `offshoreKm`, `Place`, `CAPITAL_MAX_OFFSHORE_KM` (Task 3) ; `mainBody(…, anchor)` (Task 4) ; `inArrivalView` (Task 5).
- Produces (contrat des plans 2A-3 à 2A-6) :

```ts
export interface CountryRecord {
  // …champs inchangés…
  name: Libelle;
  capital: Libelle;
  capitals: { fr: string[]; en: string[] };
  /** Position de la capitale de jeu : Natural Earth populated places, ou point imposé sourcé (overrides.capitalPoints). */
  capitalLngLat: LngLat;
}
```

- [ ] **Step 1: Écrire les tests de données (qui échouent sur le `countries.json` actuel)**

`web/scripts/geodata/__tests__/data/labels.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { CapitalOverride } from '../../lib/capitals';
import { readJson } from '../../lib/io';
import { OVERRIDES_PATH } from '../../paths';
import { byCca3, loadCountries } from './helpers';

const all = loadCountries();
const langs = ['fr', 'en'] as const;

describe('libellés bilingues (spec 2A §6)', () => {
  it('nom et capitale complets dans les deux langues', () => {
    for (const c of all) for (const l of langs) {
      expect(c.name[l]?.trim(), `${c.cca3} name.${l}`).toBeTruthy();
      expect(c.capital[l]?.trim(), `${c.cca3} capital.${l}`).toBeTruthy();
    }
  });
  it('aucun nom ni aucune capitale en double dans une langue', () => {
    for (const l of langs) for (const field of ['name', 'capital'] as const) {
      const seen = new Map<string, string>();
      for (const c of all) {
        const v = c[field][l];
        expect(seen.get(v), `${field}.${l} « ${v} » : ${seen.get(v)} et ${c.cca3}`).toBeUndefined();
        seen.set(v, c.cca3);
      }
    }
  });
  it('capitale de jeu dans la liste de chaque langue', () => {
    for (const c of all) for (const l of langs) expect(c.capitals[l], `${c.cca3} capitals.${l}`).toContain(c.capital[l]);
  });
  it('arbitrages de l\'utilisateur du 05/10 appliqués', () => {
    expect(byCca3(all, 'COD').name).toEqual({ fr: 'RD Congo', en: 'DR Congo' });
    expect(byCca3(all, 'CPV').name.fr).toBe('Cap-Vert');
    expect(byCca3(all, 'VAT').name.fr).toBe('Vatican');
    expect(byCca3(all, 'CIV').name.en).toBe('Ivory Coast');
    expect(byCca3(all, 'UKR').capital).toEqual({ fr: 'Kiev', en: 'Kyiv' });
    expect(byCca3(all, 'GNQ').capital).toEqual({ fr: 'Ciudad de la Paz', en: 'Ciudad de la Paz' });
    expect(byCca3(all, 'PSE').capital).toEqual({ fr: 'Jérusalem-Est', en: 'East Jerusalem' });
  });
  it('chaque arbitrage { fr, en } est complet', () => {
    const o = readJson<{ capitals: Record<string, CapitalOverride> }>(OVERRIDES_PATH).capitals;
    expect(Object.keys(o).sort()).toEqual(['BEN', 'BOL', 'GNQ', 'LKA', 'MYS', 'PAK', 'PSE', 'SWZ', 'YEM', 'ZAF']);
    for (const [k, v] of Object.entries(o)) for (const l of langs) expect(v[l]?.trim(), `${k}.${l}`).toBeTruthy();
  });
});
```

`web/scripts/geodata/__tests__/data/capitalPoints.test.ts` :

```ts
import { geoDistance } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { FOV_Y_DEG, FRAMING } from '../../../../src/camera/config';
import { inArrivalView } from '../../../../src/camera/framing';
import { CAPITAL_MAX_OFFSHORE_KM } from '../../config';
import { byCca3, loadCountries, sample, texelKm } from './helpers';

const all = loadCountries();
const DEG = 180 / Math.PI;
const viewports = [
  { name: 'téléphone en portrait', width: 390, height: 844, fovYDeg: FOV_Y_DEG },
  { name: 'bureau', width: 960, height: 600, fovYDeg: FOV_Y_DEG },
];

describe('position des capitales (spec 2A §6)', () => {
  it('chaque pays a une position de capitale valide', () => {
    for (const c of all) {
      const [lng, lat] = c.capitalLngLat;
      expect(Math.abs(lng), c.cca3).toBeLessThanOrEqual(180);
      expect(Math.abs(lat), c.cca3).toBeLessThanOrEqual(90);
    }
  });

  it('capitale dans le pays ou à moins de 25 km de sa côte, selon son patch', () => {
    for (const c of all) {
      const s = sample(c, c.capitalLngLat);
      if (s.r > 128) continue;
      const reach = c.patch.rangeTexels * texelKm(c);
      // r = 1 : distance saturée, le patch ne mesure pas au-delà de `reach` ; le build l'a contrôlée sur le contour.
      if (s.r <= 1) { expect(reach, `${c.cca3} : patch saturé`).toBeLessThan(CAPITAL_MAX_OFFSHORE_KM); continue; }
      expect(((128 - s.r) / 127) * reach, `${c.cca3} : capitale en mer`).toBeLessThan(CAPITAL_MAX_OFFSHORE_KM);
    }
  });

  it('capitale dans le cadre de la caméra à l\'arrivée, en portrait comme sur bureau (antiméridien compris)', () => {
    for (const c of all) {
      const offsetDeg = geoDistance(c.capitalLngLat, c.cap.center) * DEG;
      for (const v of viewports) expect(inArrivalView(offsetDeg, c.cap.radiusDeg, v, FRAMING), `${c.cca3}, ${v.name}`).toBe(true);
    }
  });

  it('Kiribati : calotte ancrée sur les îles Gilbert, autour de Tarawa', () => {
    const k = byCca3(all, 'KIR');
    expect(geoDistance(k.capitalLngLat, k.cap.center) * DEG).toBeLessThan(10);
    expect(k.cap.center[0]).toBeGreaterThan(160);
  });

  it('points imposés aux coordonnées sourcées (overrides.capitalPoints)', () => {
    expect(byCca3(all, 'GNQ').capitalLngLat).toEqual([10.8236, 1.5925]);
    expect(byCca3(all, 'NRU').capitalLngLat).toEqual([166.925, -0.54556]);
    expect(byCca3(all, 'PLW').capitalLngLat).toEqual([134.62417, 7.50056]);
    expect(byCca3(all, 'PSE').capitalLngLat).toEqual([35.23417, 31.77667]);
  });

  it('Niamey : la capitale nationale, pas l\'homonyme à 7° E', () => {
    expect(byCca3(all, 'NER').capitalLngLat[0]).toBeLessThan(3);
  });
});
```

Dans `output.test.ts`, remplacer le test « nom et capitale non vides, capitale de jeu dans la liste » par :

```ts
  it('nom et capitale non vides (FR), capitale de jeu dans la liste', () => {
    for (const c of all) {
      expect(c.name.fr.trim(), c.cca3).not.toBe('');
      expect(c.capitals.fr, c.cca3).toContain(c.capital.fr);
    }
  });
```

Dans `kosovo.test.ts`, ligne 10 : `expect(k.capital.fr.trim()).not.toBe('');`

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `npm run test:data -- scripts/geodata/__tests__/data/labels.test.ts scripts/geodata/__tests__/data/capitalPoints.test.ts`
Expected: FAIL (libellés en chaînes, `capitalLngLat` absent).

- [ ] **Step 3: Écrire les tests côté jeu (qui échouent)**

Dans `web/src/data/types.test.ts`, ajouter dans le `it` existant :

```ts
    expectTypeOf<CountryRecord['name']>().toEqualTypeOf<Libelle>();
    expectTypeOf<CountryRecord['capital']>().toEqualTypeOf<Libelle>();
    expectTypeOf<CountryRecord['capitalLngLat']>().toEqualTypeOf<LngLat>();
```

(et importer `Libelle` avec `CountryRecord, LngLat`).

Dans `web/src/data/countries.test.ts`, ajouter :

```ts
  it('refuse un ancien countries.json à libellés simples (cache du navigateur)', () => {
    const old = real.map((c, i) => (i === 5 ? { ...(c as object), name: 'France', capital: 'Paris' } : c));
    expect(() => parseCountries(old)).toThrow(/libellés bilingues/);
  });
  it('refuse un pays sans position de capitale', () => {
    const broken = real.map((c, i) => (i === 7 ? { ...(c as object), capitalLngLat: undefined } : c));
    expect(() => parseCountries(broken)).toThrow(/capitale/);
  });
```

- [ ] **Step 4: Brancher le schéma, le jeu et le build**

`web/src/data/types.ts`, dans `CountryRecord`, remplacer `name`, `capital`, `capitals` par :

```ts
  name: Libelle;
  capital: Libelle;
  capitals: { fr: string[]; en: string[] };
  /** Position de la capitale de jeu : Natural Earth populated places, ou point imposé sourcé (overrides.capitalPoints). */
  capitalLngLat: LngLat;
```

`web/src/data/countries.ts` : importer `Libelle` (`import type { CountryRecord, Libelle } from './types';`) et, dans la boucle de `parseCountries`, après le contrôle du patch :

```ts
    const bilingual = (l: unknown) => typeof (l as Libelle | undefined)?.fr === 'string' && typeof (l as Libelle).en === 'string';
    if (!bilingual(c.name) || !bilingual(c.capital)) throw new Error(`countries.json : ${c.cca3} sans libellés bilingues (ancien format ?)`);
    if (!Array.isArray(c.capitalLngLat) || c.capitalLngLat.length !== 2) throw new Error(`countries.json : ${c.cca3} sans position de capitale`);
```

`web/src/main.tsx:56` : `<span style={{ color: '#f7dc6f' }}>{current?.name.fr}</span>`

`web/scripts/geodata/build.ts` :
- imports : ajouter `CAPITAL_MAX_OFFSHORE_KM` à l'import de `./config` ; `import { capitalPoint, offshoreKm, type Place } from './lib/capitalPoint';` ; `import { nameOf } from './lib/names';`
- après la lecture de `ne` (ligne 39) :

```ts
  const places = readJson<{ features: Place[] }>(path.join(CACHE_DIR, 'ne_10m_populated_places_simple.geojson')).features;
```

- dans la boucle, remplacer les lignes 77-78 (`const polys = …; const body = mainBody(polys, MAIN_BODY);`) par :

```ts
    const polys = polygonsOf(outline.geometry);
    const { capital, capitals } = capitalOfGame(c.cca3, wikidata, c.capital, overrides.capitals);
    const capitalLngLat = capitalPoint(c.cca3, overrides.neCode[c.cca3] ?? c.cca3, capital.en, places, overrides.capitalPoints[c.cca3]);
    const offKm = offshoreKm(outline.geometry, capitalLngLat);
    if (offKm > CAPITAL_MAX_OFFSHORE_KM) {
      throw new Error(`${c.cca3} : capitale ${capital.en} à ${offKm.toFixed(1)} km hors du pays — corriger overrides.capitalPoints.${c.cca3}`);
    }
    const body = mainBody(polys, MAIN_BODY, overrides.mainBodyAnchor[c.cca3] ? capitalLngLat : undefined);
```

- supprimer l'ancienne ligne 83 (`const { capital, capitals } = capitalOfGame(c.cca3, wikidata, overrides.capitals);`) ;
- dans `records.push`, remplacer `name: c.translations.fra?.common ?? c.name.common,` par `name: nameOf(c, overrides.names.fr),` et ajouter `capitalLngLat,` juste après `capitals,` ;
- dans `rows.push`, `name: records.at(-1)!.name.fr,` ;
- dans la ligne `rows.push`, ajouter le champ de note quand la capitale est en mer : remplacer `...(outline.note ? { note: outline.note } : {}),` par

```ts
      ...(outline.note || offKm > 0 ? { note: [outline.note, offKm > 0 ? `capitale à ${offKm.toFixed(1)} km du contour` : ''].filter(Boolean).join(' ; ') } : {}),
```

(`outline.geometry` est le contour retenu, en orientation d3 comme pour `centerInside` ; `offshoreKm` attend ce `MultiPolygon`.)

- [ ] **Step 5: Régénérer et vérifier les écarts**

Run: `npm run geodata`
Expected: `OK : 197 pays → …/public/data`, sans erreur.

Run: `git -C .. status --short web/public/data web/scripts/geodata/rapport-geodata.md`
Expected : modifiés **seulement** `web/public/data/countries.json`, `web/public/data/patches/sdf/kir.png`, `web/scripts/geodata/rapport-geodata.md`. Tout autre patch, `borders.json` ou `credits.json` modifié = arrêt : l'ancrage ou le schéma a changé autre chose.

Run: lire la section « Écarts avec la génération précédente » de `rapport-geodata.md`.
Expected : une seule ligne, `KIR : calotte déplacée de …° ; rayon … ; …`.

- [ ] **Step 6: Vérifier que tout passe**

Run: `npm run check && npm run test:data`
Expected : PASS, **sauf** `scripts/imagery/__tests__/data/imagery.test.ts` « les 197 pays, centrés sur leur calotte » qui échoue sur **KIR seul** (son patch image suit l'ancienne calotte) : c'est la Task 7. Tout autre échec = arrêt.

- [ ] **Step 7: Commit**

```bash
git add web/src/data web/src/main.tsx web/scripts/geodata web/public/data/countries.json web/public/data/patches/sdf/kir.png
git commit -m "données : countries.json bilingue avec la position des capitales ; Kiribati ancré sur Tarawa"
```

---

### Task 7: Patch image de Kiribati et Release d'imagerie

**Files:**
- Modify (généré) : `web/public/data/imagery.json`, `web/scripts/imagery/rapport-imagerie.md`
- Hors dépôt : `web/public/data/patches/img/kir-1024.ktx2`, `kir-2048.ktx2` ; assets `patchs-img-1024.tar` et `patchs-img-2048.tar` de la Release `imagerie-2025`.

**Interfaces:**
- Consumes : `countries.json` de la Task 6 (calotte de KIR).
- Produces : `imagery.json` dont l'entrée KIR suit la nouvelle calotte ; une Release dont les archives contiennent les nouveaux fichiers KIR (sinon `npm run imagery:fetch` refuserait les patchs, empreintes différentes).

- [ ] **Step 1: Régénérer le patch de Kiribati**

Run: `npm run imagery KIR` (réseau : tuiles EOX de la nouvelle emprise ; `toktx` 4.4.2 présent sur le Mac)
Expected : une ligne `KIR : ±…°, grille … , … + … octets`.

- [ ] **Step 2: Vérifier**

Run: `npm run test:data`
Expected : PASS, imagerie comprise.

Run: `git -C .. diff --stat web/public/data/imagery.json`
Expected : seule l'entrée KIR change (centre, emprise, deux empreintes).

- [ ] **Step 3: Fabriquer les archives**

Run: `npm run imagery:fetch -- --pack`
Expected : `scripts/imagery/.cache/release/patchs-img-1024.tar` et `patchs-img-2048.tar`, après contrôle des 394 fichiers.

- [ ] **Step 4: GO de l'utilisateur, puis envoi sur la Release**

Montrer la commande exacte et attendre le GO :

```bash
gh release upload imagerie-2025 scripts/imagery/.cache/release/patchs-img-1024.tar scripts/imagery/.cache/release/patchs-img-2048.tar -R Pablohassan/Countrizz --clobber
```

- [ ] **Step 5: Vérifier depuis un dossier propre**

```bash
D=$(mktemp -d) && git -C .. worktree add "$D" HEAD && (cd "$D/web" && npm ci && npm run imagery:fetch) ; git -C .. worktree remove --force "$D"
```

Expected : `1024 px : 197/197 conformes` et `2048 px : 197/197 conformes`.

- [ ] **Step 6: Commit**

```bash
git add web/public/data/imagery.json web/scripts/imagery/rapport-imagerie.md
git commit -m "imagerie : patch de Kiribati recadré sur Tarawa (Release imagerie-2025 mise à jour)"
```

---

### Task 8: Mise en ligne 1.1

**Files:**
- Modify: `deploy/k8s/countrizz.yaml` (étiquette d'image `1.0` → `1.1`)
- Modify: `docs/HANDOFF.md`

- [ ] **Step 1: Suite complète du Mac**

Run: `npm run check && npm run test:data && npm run e2e && npm run budget`
Expected : tout vert. Le budget de premier chargement (≤ 8 Mo) absorbe les quelques Ko de plus de `countries.json`.

- [ ] **Step 2: Monter l'étiquette et committer**

Dans `deploy/k8s/countrizz.yaml` : `image: pablohassan/countrizz-web:1.1`.

```bash
git add deploy/k8s/countrizz.yaml && git commit -m "deploy : countrizz-web 1.1 (données bilingues)"
```

- [ ] **Step 3: GO, construction et envoi de l'image**

Montrer puis, sur GO : `deploy/scripts/build-image.sh` (depuis la racine du dépôt).
Expected : dernière ligne `pablohassan/countrizz-web:1.1`.

- [ ] **Step 4: GO, application sur le cluster**

Montrer puis, sur GO : `ssh pablo1@192.168.1.171 'kubectl apply -f -' < deploy/k8s/countrizz.yaml`, puis `ssh pablo1@192.168.1.171 'kubectl -n countrizz rollout status deploy/countrizz-web'`.
Expected : `deployment.apps/countrizz-web configured`, rollout terminé.

- [ ] **Step 5: Contrôle public**

Run: `curl -fsS https://countrizz.fr/data/countries.json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s);const f=c.find(x=>x.cca3==="FRA");console.log(c.length,JSON.stringify(f.name),JSON.stringify(f.capital),JSON.stringify(f.capitalLngLat))})'`
Expected : `197 {"fr":"France","en":"France"} {"fr":"Paris","en":"Paris"} [2.35…,48.85…]`. Puis la démo sur téléphone : vols et nom affiché comme avant.

- [ ] **Step 6: Passation**

Ajouter en tête de la reprise de `docs/HANDOFF.md` une ligne datée : plan 2A-2 fait, image `1.1` en ligne, sorties des contrôles ; prochain plan 2A-3 (moteur du jeu).

```bash
git add docs/HANDOFF.md && git commit -m "passation : plan 2A-2 terminé, countrizz-web 1.1 en ligne"
```
