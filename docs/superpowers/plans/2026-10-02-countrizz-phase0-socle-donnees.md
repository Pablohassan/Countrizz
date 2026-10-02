# Countrizz — Phase 0 : socle et données · plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'ancien code par un socle `web/` (Vite, React 19, TypeScript) et produire, par un pipeline reproductible et testé, la donnée qui garantit l'identification des 197 pays : `countries.json`, frontières, drapeaux et patchs SDF.

**Architecture:** Un pipeline Node (TypeScript exécuté par `tsx`) découpé en fonctions pures (`web/scripts/geodata/lib/`), chacune testée sur des fixtures, puis assemblé par `build.ts`. Les sources sont téléchargées une fois par `fetch-sources.ts` depuis des URL épinglées, et vérifiées par empreinte (`sources.lock.json`). Les sorties sont versionnées dans `web/public/data/` et contrôlées par une seconde suite de tests (`test:data`).

**Tech Stack:** Node 24, TypeScript 5.9, Vite 8, React 19, Vitest 5, tsx, d3-geo, topojson (server/simplify/client), @mapbox/geojson-rewind, polylabel, pngjs.

**Spec:** `docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md` (§3 surtout ; §2 pour l'arborescence ; §9 pour les licences).

## Global Constraints

- Pays jouables : **197** = les 194 entrées `unMember: true` de `mledoze/countries` (Vatican inclus) + `PSE`, `UNK`, `TWN`.
- Code Natural Earth : `ISO_A3_EH`, repli `ADM0_A3` quand il vaut `-99` ; `UNK ↔ KOS` ; fusions `CYN → CYP`, `SOL → SOM` ; toute autre entité est **neutre** (tracée, jamais jouable).
- Sources épinglées : Natural Earth `9380cca83db5f9aef52d5e762765100745f84b27`, mledoze `c2ac0049c14edcf2436c7aa1b2493222a020b462`. Le build (`npm run geodata`) et le jeu n'appellent **aucune** API ; seuls `geodata:fetch` et `geodata:capitals` touchent le réseau.
- Corps principal : polygones à ≤ **25°** du centre du plus grand, puis **90 %** de la surface restante.
- Surface du contour retenu : entre **×0,5 et ×2** de la surface `mledoze`, sauf entrée motivée dans `overrides.areaWhitelist`.
- Patch SDF : **1024 px**, projection azimutale équidistante centrée sur la calotte, demi-côté `max(1,5 × rayon, 0,02°)`, canal R = distance signée (128 = bord, > 128 = dedans, ±127 niveaux = ±32 texels), canal G = distance aux frontières voisines (0 à 255 = 0 à 32 texels).
- Licences : Natural Earth domaine public ; mledoze ODbL ; geoBoundaries **licence lue pays par pays**, toute licence « NonCommercial » refusée ; crédits publiés dans `credits.json`.
- Noms et capitales **en français**.
- Règles du poste (hooks) : ne jamais appeler une API tierce sans avoir lu sa documentation dans la même session ; `grep`, `rg`, et `awk`/`sed` filtrant par motif sont **bloqués** — lire les fichiers en entier ou par plages de lignes.

## Review Focus

1. **Enclaves** — Vatican et Saint-Marin dans l'Italie, Monaco dans la France, le Lesotho dans l'Afrique du Sud : le patch du pays englobant doit les voir **dehors** dès qu'elles y font au moins 3 texels de large (Natural Earth 10m les porte en anneaux intérieurs : 2 pour l'Italie, 1 pour l'Afrique du Sud, 1 pour la France ; le Vatican, plus petit qu'un texel du patch italien, y est invisible au cadrage de l'Italie). Test : Task 12, `enclaves.test.ts`.
2. **Entités fusionnées** — un point de Chypre du Nord doit être **dedans** le patch de Chypre, Hargeisa **dedans** celui de la Somalie (non fusionnés, ils sont dehors). Test : Task 12, `merges.test.ts`.
3. **Antiméridien** — Fidji, Kiribati, Russie : calotte de taille raisonnable et balise dans le pays, rastérisation continue de part et d'autre de 180°. Tests : Task 11 (fixture) et Task 12 (`antimeridian.test.ts`).
4. **Kosovo à travers quatre sources** (`UNK` mledoze, `KOS` Natural Earth, `XKX` geoBoundaries, `Q1246` Wikidata) : géométrie, capitale et drapeau présents. Test : Task 12, `kosovo.test.ts`.
5. **Pays à plusieurs capitales** — jamais de capitale de jeu absente de la liste Wikidata, jamais d'arbitrage silencieux. Tests : Task 9 et Task 12.

---

## Arborescence produite par ce plan

```
.gitignore                                   (réécrit)
README.md                                    (réécrit, court)
.github/workflows/web-ci.yml                 (nouveau ; deploy.yml et lint.yml supprimés)
web/
├─ package.json · tsconfig.json · vite.config.ts · vitest.config.ts · index.html
├─ types/shims.d.ts                          déclaration de module pour @mapbox/geojson-rewind
├─ src/
│  ├─ main.tsx                               page provisoire
│  └─ data/types.ts                          contrat de countries.json (lu par le jeu en phase 1)
├─ public/data/                              SORTIES versionnées
│  ├─ countries.json · borders.json · credits.json
│  ├─ flags/<cca3>.svg                        (197)
│  └─ patches/sdf/<cca3>.png                  (197)
└─ scripts/geodata/
   ├─ config.ts · paths.ts
   ├─ fetch-sources.ts · fetch-capitals.ts · build.ts
   ├─ overrides.json · sources.lock.json · rapport-geodata.md
   ├─ data-src/capitals.fr.json              instantané Wikidata, versionné
   ├─ .cache/                                téléchargements, NON versionné
   ├─ lib/  playable · http · io · geometry · join · mainBody · cap · beacon · outline · capitals · borders · patch · report
   └─ __tests__/
      ├─ unit/   un fichier par module de lib/ (fixtures, sans réseau)
      └─ data/   contrôles des sorties réelles (exigent `npm run geodata`)
```

---

### Task 1 : Nettoyage du dépôt et socle `web/`

**Files:**
- Delete: `frontend/`, `backend/`, `package.json`, `package-lock.json`, `.husky/`, `.github/workflows/deploy.yml`, `.github/workflows/lint.yml`, `LISEZ-MOI.md`, tous les `.DS_Store` suivis
- Create: `.gitignore`, `README.md`, `.github/workflows/web-ci.yml`, `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`, `web/vitest.config.ts`, `web/index.html`, `web/types/shims.d.ts`, `web/src/main.tsx`, `web/src/data/types.ts`
- Test: `web/src/data/types.test.ts`

**Interfaces:**
- Produces: `web/src/data/types.ts` — types `LngLat`, `Cap`, `PatchMeta`, `CountryRecord` (définis ci-dessous, utilisés par les tâches 6, 11 et 12) ; scripts npm `check`, `test`, `test:data`, `geodata:fetch`, `geodata:capitals`, `geodata`.

- [ ] **Step 1 : Vérifier qu'aucun processus ne sert l'ancien backend**

Run: `lsof -iTCP:5000 -sTCP:LISTEN -n -P`
Expected : aucune ligne. Si un `node index.js` écoute (le 02/10, un tel processus tournait depuis `backend/`), **arrêter le travail et demander à l'utilisateur** de le stopper : on ne tue pas un processus qu'on n'a pas lancé.

- [ ] **Step 2 : Retirer l'ancien code et le hook husky**

```bash
cd /Users/rusmirsadikovic/projetsperso/countriz/countrizz
git rm -r -q frontend backend package.json package-lock.json .husky .github/workflows/deploy.yml .github/workflows/lint.yml LISEZ-MOI.md
git ls-files | while IFS= read -r f; do case "$f" in *.DS_Store) git rm -q --cached "$f";; esac; done
git config --unset core.hooksPath
rm -rf node_modules frontend/node_modules backend/node_modules
git status --short --ignored frontend backend
```

Expected : `git config core.hooksPath` ne rend plus rien. Il peut rester des fichiers **non suivis** dans `frontend/` ou `backend/` — notamment `backend/.env` (anciens identifiants MySQL). **Ne pas les supprimer** : les lister à l'utilisateur dans le compte rendu de la tâche.

- [ ] **Step 3 : Écrire `.gitignore` et `README.md`**

`.gitignore` :

```gitignore
node_modules/
dist/
.DS_Store
web/scripts/geodata/.cache/
*.log
```

`README.md` :

```markdown
# Countrizz

Jeu de géographie : un globe 3D (three.js WebGPU) vole vers un pays, à toi de le reconnaître.

- Design : `docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md`
- Plans : `docs/superpowers/plans/`
- Application : `web/` — `npm install`, `npm run dev`, `npm run check`
- Données : `cd web && npm run geodata:fetch && npm run geodata && npm run test:data`
```

- [ ] **Step 4 : Créer `web/package.json` et installer les dépendances**

```json
{
  "name": "countrizz-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "check": "tsc --noEmit && vitest run --project unit",
    "test": "vitest run --project unit",
    "test:data": "vitest run --project data",
    "geodata:fetch": "tsx scripts/geodata/fetch-sources.ts",
    "geodata:capitals": "tsx scripts/geodata/fetch-capitals.ts",
    "geodata": "tsx scripts/geodata/build.ts"
  }
}
```

```bash
cd web
npm install -E react@19.3.0 react-dom@19.3.0
npm install -E -D vite@8.3.2 @vitejs/plugin-react@6.1.1 typescript@5.9.3 vitest@5.0.3 tsx@4.23.15 \
  d3-geo@3.1.1 topojson-server@3.0.1 topojson-client@3.1.0 topojson-simplify@3.0.3 \
  @mapbox/geojson-rewind@0.5.2 polylabel@2.1.0 pngjs@7.0.0 \
  @types/d3-geo@3.1.1 @types/topojson-server@3.0.4 @types/topojson-client@3.1.5 @types/topojson-simplify@3.0.3 \
  @types/pngjs@6.0.5 @types/geojson@7946.0.16 @types/node@24 @types/react@19 @types/react-dom@19
```

Expected : `npm install` sans erreur. Si `typescript@5.9.3` n'existe pas, prendre la dernière `5.9.x` (`npm view typescript@5.9 version`) ; ne pas monter en 7.x (outillage pas encore aligné, cf. spec §2).

- [ ] **Step 5 : Configurer TypeScript, Vite et Vitest**

Lire d'abord la page « Projects » de la documentation Vitest (https://vitest.dev/guide/projects) pour confirmer la clé `test.projects` en version 5.

`web/tsconfig.json` :

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "scripts", "types", "vite.config.ts", "vitest.config.ts"]
}
```

`web/vite.config.ts` :

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
```

`web/vitest.config.ts` :

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'scripts/geodata/__tests__/unit/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'data',
          environment: 'node',
          include: ['scripts/geodata/__tests__/data/**/*.test.ts'],
          testTimeout: 120_000,
        },
      },
    ],
  },
});
```

`web/types/shims.d.ts` :

```ts
declare module '@mapbox/geojson-rewind' {
  import type { GeoJSON } from 'geojson';
  export default function rewind<T extends GeoJSON>(geojson: T, clockwise?: boolean): T;
}
```

- [ ] **Step 6 : Écrire le test du contrat de données**

`web/src/data/types.test.ts` :

```ts
import { describe, expectTypeOf, it } from 'vitest';
import type { CountryRecord, LngLat } from './types';

describe('contrat CountryRecord', () => {
  it('expose la calotte, la balise et le patch en [lng, lat]', () => {
    expectTypeOf<CountryRecord['cap']['center']>().toEqualTypeOf<LngLat>();
    expectTypeOf<CountryRecord['beacon']>().toEqualTypeOf<LngLat>();
    expectTypeOf<CountryRecord['beaconClearanceKm']>().toEqualTypeOf<number>();
    expectTypeOf<CountryRecord['patch']['center']>().toEqualTypeOf<LngLat>();
    expectTypeOf<CountryRecord['outlineSource']>().toEqualTypeOf<'geoboundaries' | 'naturalearth'>();
  });
});
```

- [ ] **Step 7 : Lancer le test, vérifier qu'il échoue**

Run: `cd web && npx vitest run --project unit src/data/types.test.ts`
Expected : FAIL — `Cannot find module './types'`.

- [ ] **Step 8 : Écrire `web/src/data/types.ts`**

```ts
/** Coordonnées géographiques en degrés : [longitude, latitude]. */
export type LngLat = [lng: number, lat: number];

/** Plus petite calotte sphérique englobant le corps principal d'un pays. */
export interface Cap {
  center: LngLat;
  radiusDeg: number;
}

/**
 * Patch SDF local d'un pays (PNG RGBA).
 * Projection : azimutale équidistante centrée sur `center`, échelle 1 (unités = radians d'arc).
 * Pixel (0,0) en haut à gauche ; les lignes du haut sont au NORD du centre.
 *   px = (x / extentRad + 1) * size / 2      py = (y / extentRad + 1) * size / 2
 * R : distance signée au bord du pays, 128 = bord, > 128 dedans, ±127 niveaux = ±rangeTexels.
 * G : distance aux frontières des autres pays, 0 → 255 pour 0 → rangeTexels.
 */
export interface PatchMeta {
  sdf: string;
  size: number;
  center: LngLat;
  extentRad: number;
  rangeTexels: number;
}

export interface CountryRecord {
  id: number;
  cca3: string;
  cca2: string;
  name: string;
  capital: string;
  capitals: string[];
  region: string;
  subregion: string;
  neighbors: string[];
  areaKm2: number;
  cap: Cap;
  /** Pôle d'inaccessibilité du plus grand polygone du corps principal. */
  beacon: LngLat;
  /** Distance de la balise au bord du pays (km) : sous un texel ou deux, le pays n'est lisible que par sa balise. */
  beaconClearanceKm: number;
  flag: string;
  outlineSource: 'geoboundaries' | 'naturalearth';
  patch: PatchMeta;
}
```

- [ ] **Step 9 : Page provisoire et `index.html`**

`web/index.html` :

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Countrizz</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`web/src/main.tsx` :

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <p>Countrizz — refonte en cours.</p>
  </StrictMode>,
);
```

- [ ] **Step 10 : CI GitHub**

`.github/workflows/web-ci.yml` :

```yaml
name: web
on:
  push:
    paths: ['web/**', '.github/workflows/web-ci.yml']
  pull_request:
    paths: ['web/**']
jobs:
  check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: web/package-lock.json
      - run: npm ci
      - run: npm run check
```

- [ ] **Step 11 : Vérifier**

Run: `cd web && npm run check && npm run build`
Expected : `tsc` sans erreur, 1 test passé, build Vite produit `dist/`.

- [ ] **Step 12 : Commit**

```bash
cd /Users/rusmirsadikovic/projetsperso/countriz/countrizz
git add -A .gitignore README.md .github web docs
git commit -m "Refonte : retrait de l'ancien code, socle web/ et contrat de données

Spec et plan de la phase 0 inclus."
```

(Ajouter les lignes d'attribution demandées par la session en fin de message.)

---

### Task 2 : Configuration et sélection des 197 pays jouables

**Files:**
- Create: `web/scripts/geodata/config.ts`, `web/scripts/geodata/lib/playable.ts`
- Test: `web/scripts/geodata/__tests__/unit/playable.test.ts`

**Interfaces:**
- Produces: constantes de `config.ts` (voir code) ; `interface MledozeCountry` ; `selectPlayable(all: MledozeCountry[], extra: readonly string[]): MledozeCountry[]` (trié par `cca3`).

- [ ] **Step 1 : Écrire `config.ts`** (constantes pures, sans test propre ; elles sont exercées par les tâches suivantes)

```ts
export const NE_SHA = '9380cca83db5f9aef52d5e762765100745f84b27';
export const MLEDOZE_SHA = 'c2ac0049c14edcf2436c7aa1b2493222a020b462';

export const SOURCES = {
  naturalEarth: `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_SHA}/geojson/ne_10m_admin_0_countries.geojson`,
  mledozeCountries: `https://raw.githubusercontent.com/mledoze/countries/${MLEDOZE_SHA}/countries.json`,
  mledozeFlag: (cca3: string) =>
    `https://raw.githubusercontent.com/mledoze/countries/${MLEDOZE_SHA}/data/${cca3.toLowerCase()}.svg`,
  geoBoundariesMeta: (iso: string) => `https://www.geoboundaries.org/api/current/gbOpen/${iso}/ADM0/`,
} as const;

export const PLAYABLE_EXTRA = ['PSE', 'UNK', 'TWN'] as const;
export const PLAYABLE_COUNT = 197;

export const MAIN_BODY = { maxDistanceDeg: 25, areaShare: 0.9 } as const;
export const AREA_RATIO = { min: 0.5, max: 2 } as const;
/** geoBoundaries n'est téléchargé que pour les pays de surface mledoze ≤ ce seuil (contours fins utiles). */
export const GEOBOUNDARIES_MAX_AREA_KM2 = 50_000;
export const PATCH = { size: 1024, rangeTexels: 32, extentFactor: 1.5, minExtentDeg: 0.02 } as const;
/** Fraction des points gardés pour les frontières de vue d'ensemble. */
export const BORDERS_KEEP = 0.12;
export const EARTH_RADIUS_KM = 6371.0088;
```

- [ ] **Step 2 : Écrire le test qui échoue**

`web/scripts/geodata/__tests__/unit/playable.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { selectPlayable, type MledozeCountry } from '../../lib/playable';

const c = (cca3: string, unMember: boolean): MledozeCountry => ({
  cca2: cca3.slice(0, 2),
  cca3,
  unMember,
  name: { common: cca3 },
  translations: { fra: { common: cca3, official: cca3 } },
  capital: [],
  region: 'Europe',
  subregion: 'Western Europe',
  borders: [],
  area: 1,
  latlng: [0, 0],
});

describe('selectPlayable', () => {
  const all = [c('FRA', true), c('GRL', false), c('PSE', false), c('VAT', true), c('UNK', false), c('PRI', false)];

  it('garde les membres ONU et les ajouts explicites, trié par cca3', () => {
    expect(selectPlayable(all, ['PSE', 'UNK']).map((x) => x.cca3)).toEqual(['FRA', 'PSE', 'UNK', 'VAT']);
  });

  it('exclut les territoires non listés', () => {
    const codes = selectPlayable(all, ['PSE']).map((x) => x.cca3);
    expect(codes).not.toContain('GRL');
    expect(codes).not.toContain('PRI');
  });
});
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/playable.test.ts`
Expected : FAIL — module `../../lib/playable` introuvable.

- [ ] **Step 4 : Implémenter `lib/playable.ts`**

```ts
export interface MledozeCountry {
  cca2: string;
  cca3: string;
  unMember: boolean;
  name: { common: string };
  translations: Record<string, { common: string; official: string }>;
  capital: string[];
  region: string;
  subregion: string;
  borders: string[];
  area: number;
  latlng: [number, number];
}

export function selectPlayable(all: MledozeCountry[], extra: readonly string[]): MledozeCountry[] {
  const wanted = new Set(extra);
  return all.filter((c) => c.unMember || wanted.has(c.cca3)).sort((a, b) => a.cca3.localeCompare(b.cca3));
}
```

- [ ] **Step 5 : Lancer, vérifier le succès**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/playable.test.ts`
Expected : PASS (2 tests).

- [ ] **Step 6 : Commit**

```bash
git add web/scripts/geodata/config.ts web/scripts/geodata/lib/playable.ts web/scripts/geodata/__tests__/unit/playable.test.ts
git commit -m "geodata : configuration épinglée et sélection des pays jouables"
```

---

### Task 3 : Sources épinglées — téléchargement, verrou, drapeaux, geoBoundaries

**Files:**
- Create: `web/scripts/geodata/paths.ts`, `web/scripts/geodata/lib/http.ts`, `web/scripts/geodata/lib/io.ts`, `web/scripts/geodata/fetch-sources.ts`
- Create (par exécution) : `web/scripts/geodata/sources.lock.json` (versionné), `web/scripts/geodata/.cache/**` (ignoré)
- Test: `web/scripts/geodata/__tests__/unit/http.test.ts`

**Interfaces:**
- Consumes: `SOURCES`, `PLAYABLE_EXTRA`, `PLAYABLE_COUNT`, `GEOBOUNDARIES_MAX_AREA_KM2` (Task 2) ; `selectPlayable` (Task 2).
- Produces: `sha256(buf: Uint8Array): string` ; `fetchBytes(url: string, attempts?: number): Promise<Uint8Array>` ; `readJson<T>(p: string): T` ; `writeJson(p: string, v: unknown): void` ; chemins `CACHE_DIR`, `DATA_SRC_DIR`, `OUT_DIR`, `REPORT_PATH`, `LOCK_PATH`, `OVERRIDES_PATH` ; fichiers de cache `.cache/ne_10m_admin_0_countries.geojson`, `.cache/mledoze-countries.json`, `.cache/flags/<cca3>.svg`, `.cache/gb/<cca3>.geojson` + `.cache/gb/<cca3>.meta.json`.

- [ ] **Step 1 : Lire la documentation de l'API geoBoundaries**

Lire https://www.geoboundaries.org/api.html (format d'URL `…/api/current/gbOpen/<ISO>/ADM0/`, champs `boundaryLicense`, `boundarySource`, `boundaryYearRepresented`, `gjDownloadURL`). C'est une condition des hooks du poste avant tout appel.

- [ ] **Step 2 : Écrire le test qui échoue**

`web/scripts/geodata/__tests__/unit/http.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { sha256 } from '../../lib/http';

describe('sha256', () => {
  it('rend le vecteur de référence de « abc »', () => {
    expect(sha256(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/http.test.ts`
Expected : FAIL — module introuvable.

- [ ] **Step 4 : Implémenter `paths.ts`, `lib/http.ts`, `lib/io.ts`**

`paths.ts` :

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const GEODATA_DIR = here;
export const CACHE_DIR = path.join(here, '.cache');
export const DATA_SRC_DIR = path.join(here, 'data-src');
export const OUT_DIR = path.resolve(here, '../../public/data');
export const REPORT_PATH = path.join(here, 'rapport-geodata.md');
export const LOCK_PATH = path.join(here, 'sources.lock.json');
export const OVERRIDES_PATH = path.join(here, 'overrides.json');
```

`lib/http.ts` :

```ts
import { createHash } from 'node:crypto';

export function sha256(buf: Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

export async function fetchBytes(url: string, attempts = 3): Promise<Uint8Array> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'countrizz-geodata/0.1 (https://countrizz.fr)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} pour ${url}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      lastError = e;
      if (i < attempts) await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
  throw lastError;
}
```

`lib/io.ts` :

```ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function readJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

export function writeJson(p: string, v: unknown): void {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 1) + '\n');
}

export function writeBytes(p: string, b: Uint8Array): void {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, b);
}
```

- [ ] **Step 5 : Lancer le test, vérifier le succès**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/http.test.ts`
Expected : PASS.

- [ ] **Step 6 : Écrire `fetch-sources.ts`**

Règles : toute entrée déjà présente dans `sources.lock.json` est re-téléchargée **depuis l'URL verrouillée** et son empreinte doit être identique, sinon le script s'arrête ; geoBoundaries n'est interrogé que pour les pays de surface ≤ `GEOBOUNDARIES_MAX_AREA_KM2`, une requête à la fois, 500 ms d'écart.

```ts
import { existsSync } from 'node:fs';
import path from 'node:path';
import { GEOBOUNDARIES_MAX_AREA_KM2, PLAYABLE_COUNT, PLAYABLE_EXTRA, SOURCES } from './config';
import { fetchBytes, sha256 } from './lib/http';
import { readJson, writeBytes, writeJson } from './lib/io';
import { selectPlayable, type MledozeCountry } from './lib/playable';
import { CACHE_DIR, LOCK_PATH, OVERRIDES_PATH } from './paths';

interface LockEntry { url: string; sha256: string }
interface GbLock extends LockEntry { license: string; source: string; year: string; iso: string }
interface Lock {
  naturalEarth?: LockEntry;
  mledozeCountries?: LockEntry;
  flags: Record<string, LockEntry>;
  geoBoundaries: Record<string, GbLock | { unavailable: string }>;
}

const lock: Lock = existsSync(LOCK_PATH) ? readJson<Lock>(LOCK_PATH) : { flags: {}, geoBoundaries: {} };

async function pinned(key: string, url: string, previous: LockEntry | undefined, dest: string): Promise<LockEntry> {
  const useUrl = previous?.url ?? url;
  const bytes = await fetchBytes(useUrl);
  const hash = sha256(bytes);
  if (previous && previous.sha256 !== hash) {
    throw new Error(`${key} : empreinte différente du verrou (${previous.sha256} attendu, ${hash} reçu) — ${useUrl}`);
  }
  writeBytes(dest, bytes);
  return { url: useUrl, sha256: hash };
}

async function main(): Promise<void> {
  lock.naturalEarth = await pinned('naturalEarth', SOURCES.naturalEarth, lock.naturalEarth,
    path.join(CACHE_DIR, 'ne_10m_admin_0_countries.geojson'));
  lock.mledozeCountries = await pinned('mledozeCountries', SOURCES.mledozeCountries, lock.mledozeCountries,
    path.join(CACHE_DIR, 'mledoze-countries.json'));

  const playable = selectPlayable(readJson<MledozeCountry[]>(path.join(CACHE_DIR, 'mledoze-countries.json')), PLAYABLE_EXTRA);
  if (playable.length !== PLAYABLE_COUNT) throw new Error(`${playable.length} pays jouables au lieu de ${PLAYABLE_COUNT}`);

  for (const c of playable) {
    lock.flags[c.cca3] = await pinned(`flag ${c.cca3}`, SOURCES.mledozeFlag(c.cca3), lock.flags[c.cca3],
      path.join(CACHE_DIR, 'flags', `${c.cca3.toLowerCase()}.svg`));
  }

  const overrides = readJson<{ gbIso: Record<string, string> }>(OVERRIDES_PATH);
  for (const c of playable.filter((x) => x.area <= GEOBOUNDARIES_MAX_AREA_KM2)) {
    const dest = path.join(CACHE_DIR, 'gb', `${c.cca3}.geojson`);
    const previous = lock.geoBoundaries[c.cca3];
    if (previous && 'unavailable' in previous) continue;
    if (previous) {
      const entry = await pinned(`gb ${c.cca3}`, previous.url, previous, dest);
      writeJson(path.join(CACHE_DIR, 'gb', `${c.cca3}.meta.json`), { ...previous, ...entry });
      continue;
    }
    const iso = overrides.gbIso[c.cca3] ?? c.cca3;
    try {
      const meta = JSON.parse(new TextDecoder().decode(await fetchBytes(SOURCES.geoBoundariesMeta(iso), 2))) as {
        gjDownloadURL: string; boundaryLicense: string; boundarySource: string; boundaryYearRepresented: string;
      };
      const entry = await pinned(`gb ${c.cca3}`, meta.gjDownloadURL, undefined, dest);
      const gb: GbLock = { ...entry, iso, license: meta.boundaryLicense, source: meta.boundarySource, year: meta.boundaryYearRepresented };
      lock.geoBoundaries[c.cca3] = gb;
      writeJson(path.join(CACHE_DIR, 'gb', `${c.cca3}.meta.json`), gb);
    } catch (e) {
      lock.geoBoundaries[c.cca3] = { unavailable: String(e) };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  writeJson(LOCK_PATH, lock);
  const gbOk = Object.values(lock.geoBoundaries).filter((v) => !('unavailable' in v)) as GbLock[];
  console.log(`OK : NE, mledoze, ${Object.keys(lock.flags).length} drapeaux, ${gbOk.length} contours geoBoundaries`);
  console.log('Licences geoBoundaries rencontrées :', [...new Set(gbOk.map((g) => g.license))]);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Créer en même temps `web/scripts/geodata/overrides.json` (complété en Task 5 et Task 9) :

```json
{
  "neCode": { "UNK": "KOS" },
  "merge": { "CYN": "CYP", "SOL": "SOM" },
  "gbIso": { "UNK": "XKX" },
  "capitals": {},
  "areaWhitelist": {}
}
```

- [ ] **Step 7 : Exécuter le téléchargement**

Run: `cd web && npm run geodata:fetch`
Expected : `OK : NE, mledoze, 197 drapeaux, N contours geoBoundaries`, puis la liste des licences.
**Si une licence listée contient « NonCommercial » ou ne ressemble à aucune de : ODbL, Creative Commons Attribution, Public Domain, Open Government Licence → s'arrêter et la montrer à l'utilisateur** (la Task 8 la refusera, mais il doit le savoir).

- [ ] **Step 8 : Vérifier l'idempotence du verrou**

Run: `cd web && npm run geodata:fetch`
Expected : même sortie, aucune erreur d'empreinte ; `git diff --stat web/scripts/geodata/sources.lock.json` ne montre aucun changement.

- [ ] **Step 9 : Commit**

```bash
git add web/scripts/geodata/paths.ts web/scripts/geodata/lib/http.ts web/scripts/geodata/lib/io.ts \
  web/scripts/geodata/fetch-sources.ts web/scripts/geodata/overrides.json web/scripts/geodata/sources.lock.json \
  web/scripts/geodata/__tests__/unit/http.test.ts
git commit -m "geodata : téléchargement épinglé des sources et verrou d'empreintes"
```

---

### Task 4 : Géométrie sphérique — enroulement et surface

**Files:**
- Create: `web/scripts/geodata/lib/geometry.ts`
- Test: `web/scripts/geodata/__tests__/unit/geometry.test.ts`

**Interfaces:**
- Consumes: `EARTH_RADIUS_KM` (Task 2).
- Produces: `type PolygonCoords = Position[][]` ; `polygonsOf(g: Polygon | MultiPolygon): PolygonCoords[]` ; `toMultiPolygon(polys: PolygonCoords[]): MultiPolygon` ; `forD3(g: Polygon | MultiPolygon): MultiPolygon` (anneaux extérieurs horaires, convention d3) ; `areaKm2(g: Polygon | MultiPolygon): number` ; `polygonAreaKm2(p: PolygonCoords): number`.

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { areaKm2, forD3, polygonsOf, toMultiPolygon } from '../../lib/geometry';

// Carré de 1° à l'équateur, anneau extérieur ANTI-horaire (convention RFC 7946)
const ccwSquare: Polygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
const EXPECTED_KM2 = 12364; // R² · Δλ · (sin φ2 − sin φ1), R = 6371,0088 km

describe('géométrie sphérique', () => {
  it('un anneau anti-horaire est lu par d3 comme le globe moins le carré', () => {
    expect(areaKm2(ccwSquare)).toBeGreaterThan(5e8);
  });

  it('forD3 remet l’anneau dans le sens attendu par d3', () => {
    expect(areaKm2(forD3(ccwSquare))).toBeCloseTo(EXPECTED_KM2, -2);
  });

  it('forD3 est idempotent', () => {
    expect(areaKm2(forD3(forD3(ccwSquare)))).toBeCloseTo(EXPECTED_KM2, -2);
  });

  it('polygonsOf et toMultiPolygon font l’aller-retour', () => {
    expect(polygonsOf(toMultiPolygon(polygonsOf(ccwSquare)))).toEqual(polygonsOf(ccwSquare));
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/geometry.test.ts`
Expected : FAIL — module introuvable.

- [ ] **Step 3 : Implémenter**

```ts
import rewind from '@mapbox/geojson-rewind';
import { geoArea } from 'd3-geo';
import type { MultiPolygon, Polygon, Position } from 'geojson';
import { EARTH_RADIUS_KM } from '../config';

export type PolygonCoords = Position[][];

export function polygonsOf(g: Polygon | MultiPolygon): PolygonCoords[] {
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

export function toMultiPolygon(polys: PolygonCoords[]): MultiPolygon {
  return { type: 'MultiPolygon', coordinates: polys };
}

/** Anneaux extérieurs dans le sens horaire, intérieurs anti-horaire : la convention de d3-geo. */
export function forD3(g: Polygon | MultiPolygon): MultiPolygon {
  return rewind(toMultiPolygon(polygonsOf(g)), true);
}

export function areaKm2(g: Polygon | MultiPolygon): number {
  return geoArea(g) * EARTH_RADIUS_KM ** 2;
}

export function polygonAreaKm2(p: PolygonCoords): number {
  return geoArea({ type: 'Polygon', coordinates: p }) * EARTH_RADIUS_KM ** 2;
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/geometry.test.ts`
Expected : PASS (4 tests).

- [ ] **Step 5 : Commit**

```bash
git add web/scripts/geodata/lib/geometry.ts web/scripts/geodata/__tests__/unit/geometry.test.ts
git commit -m "geodata : enroulement d3 et surfaces sphériques"
```

---

### Task 5 : Jointure Natural Earth ↔ mledoze et exceptions

**Files:**
- Create: `web/scripts/geodata/lib/join.ts`
- Test: `web/scripts/geodata/__tests__/unit/join.test.ts`

**Interfaces:**
- Consumes: `forD3`, `polygonsOf`, `toMultiPolygon`, `PolygonCoords` (Task 4).
- Produces: `interface NeProps { ISO_A3: string; ISO_A3_EH: string; ADM0_A3: string; NAME: string }` ; `interface Overrides { neCode; merge; gbIso; capitals; areaWhitelist }` (tous `Record<string, string>`) ; `neCode(p: NeProps): string` ; `joinNaturalEarth(ne, playable: string[], o: Pick<Overrides, 'neCode' | 'merge'>): JoinResult` avec `JoinResult = { byCountry: Map<string, MultiPolygon>; neutral: Feature<Polygon | MultiPolygon, NeProps>[]; unmatched: string[] }`.

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { joinNaturalEarth, neCode, type NeProps } from '../../lib/join';

const sq = (x: number, y: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[[x, y], [x, y + 1], [x + 1, y + 1], [x + 1, y], [x, y]]],
});
const f = (ISO_A3: string, ISO_A3_EH: string, ADM0_A3: string, x: number): Feature<Polygon, NeProps> => ({
  type: 'Feature', properties: { ISO_A3, ISO_A3_EH, ADM0_A3, NAME: ADM0_A3 }, geometry: sq(x, 0),
});

const ne: FeatureCollection<Polygon, NeProps> = {
  type: 'FeatureCollection',
  features: [
    f('-99', 'FRA', 'FRA', 0),   // France : ISO_A3 à -99
    f('-99', '-99', 'KOS', 2),   // Kosovo
    f('CYP', 'CYP', 'CYP', 4),
    f('-99', '-99', 'CYN', 5),   // Chypre du Nord
    f('GRL', 'GRL', 'GRL', 7),   // territoire neutre
  ],
};
const o = { neCode: { UNK: 'KOS' }, merge: { CYN: 'CYP' } };

describe('neCode', () => {
  it('prend ISO_A3_EH, sinon ADM0_A3', () => {
    expect(neCode(ne.features[0]!.properties)).toBe('FRA');
    expect(neCode(ne.features[1]!.properties)).toBe('KOS');
  });
});

describe('joinNaturalEarth', () => {
  const r = joinNaturalEarth(ne, ['CYP', 'FRA', 'UNK', 'MCO'], o);

  it('rattache le Kosovo par son code NE', () => {
    expect(r.byCountry.has('UNK')).toBe(true);
  });
  it('fusionne Chypre du Nord dans Chypre', () => {
    expect(r.byCountry.get('CYP')!.coordinates).toHaveLength(2);
  });
  it('classe le reste en neutre', () => {
    expect(r.neutral.map((x) => x.properties.ADM0_A3)).toEqual(['GRL']);
  });
  it('signale un pays jouable sans géométrie', () => {
    expect(r.unmatched).toEqual(['MCO']);
  });
  it('n’attribue aucune entité à deux pays', () => {
    const total = [...r.byCountry.values()].reduce((s, g) => s + g.coordinates.length, 0) + r.neutral.length;
    expect(total).toBe(ne.features.length);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/join.test.ts`
Expected : FAIL — module introuvable.

- [ ] **Step 3 : Implémenter**

```ts
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { forD3, polygonsOf, toMultiPolygon, type PolygonCoords } from './geometry';

export interface NeProps { ISO_A3: string; ISO_A3_EH: string; ADM0_A3: string; NAME: string }

export interface Overrides {
  /** cca3 → code Natural Earth (ex. UNK → KOS) */
  neCode: Record<string, string>;
  /** code Natural Earth → cca3 jouable qui l'absorbe (ex. CYN → CYP) */
  merge: Record<string, string>;
  /** cca3 → code ISO chez geoBoundaries (ex. UNK → XKX) */
  gbIso: Record<string, string>;
  /** cca3 → capitale de jeu imposée (doit figurer dans la liste Wikidata) */
  capitals: Record<string, string>;
  /** cca3 → raison d'accepter une surface hors de ×0,5–×2 */
  areaWhitelist: Record<string, string>;
}

export interface JoinResult {
  byCountry: Map<string, MultiPolygon>;
  neutral: Feature<Polygon | MultiPolygon, NeProps>[];
  unmatched: string[];
}

export function neCode(p: NeProps): string {
  return p.ISO_A3_EH && p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ADM0_A3;
}

export function joinNaturalEarth(
  ne: FeatureCollection<Polygon | MultiPolygon, NeProps>,
  playable: string[],
  o: Pick<Overrides, 'neCode' | 'merge'>,
): JoinResult {
  const playableSet = new Set(playable);
  const owner = new Map<string, string>();
  for (const cca3 of playable) owner.set(o.neCode[cca3] ?? cca3, cca3);
  for (const [code, cca3] of Object.entries(o.merge)) if (playableSet.has(cca3)) owner.set(code, cca3);

  const polys = new Map<string, PolygonCoords[]>();
  const neutral: JoinResult['neutral'] = [];
  for (const feature of ne.features) {
    const cca3 = owner.get(neCode(feature.properties));
    if (!cca3) { neutral.push(feature); continue; }
    const list = polys.get(cca3) ?? [];
    list.push(...polygonsOf(forD3(feature.geometry)));
    polys.set(cca3, list);
  }
  const byCountry = new Map([...polys].map(([k, v]) => [k, toMultiPolygon(v)] as const));
  return { byCountry, neutral, unmatched: playable.filter((c) => !byCountry.has(c)) };
}
```

Note : le dernier test compte des polygones et non des entités ; il passe ici parce que chaque fixture est un polygone simple. Il garantit que rien n'est compté deux fois.

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/join.test.ts`
Expected : PASS (6 tests).

- [ ] **Step 5 : Contrôle sur la vraie donnée**

Run:

```bash
cd web && npx tsx -e "
import { readJson } from './scripts/geodata/lib/io';
import { joinNaturalEarth } from './scripts/geodata/lib/join';
import { selectPlayable } from './scripts/geodata/lib/playable';
import { PLAYABLE_EXTRA } from './scripts/geodata/config';
const ne = readJson<any>('scripts/geodata/.cache/ne_10m_admin_0_countries.geojson');
const mz = readJson<any[]>('scripts/geodata/.cache/mledoze-countries.json');
const o = readJson<any>('scripts/geodata/overrides.json');
const r = joinNaturalEarth(ne, selectPlayable(mz, PLAYABLE_EXTRA).map((c) => c.cca3), o);
console.log('pays avec géométrie', r.byCountry.size, '| sans', r.unmatched, '| neutres', r.neutral.length);"
```

Expected : `pays avec géométrie 197 | sans [] | neutres 55` (mesuré le 02/10 : 258 entités, 55 non jouables une fois CYN et SOL fusionnés — un écart de ±2 sur les neutres est acceptable si `sans` est vide).

- [ ] **Step 6 : Commit**

```bash
git add web/scripts/geodata/lib/join.ts web/scripts/geodata/__tests__/unit/join.test.ts
git commit -m "geodata : jointure Natural Earth / mledoze, Kosovo, fusions, neutres"
```

---

### Task 6 : Corps principal et calotte de cadrage

**Files:**
- Create: `web/scripts/geodata/lib/mainBody.ts`, `web/scripts/geodata/lib/cap.ts`
- Test: `web/scripts/geodata/__tests__/unit/mainBody.test.ts`, `web/scripts/geodata/__tests__/unit/cap.test.ts`

**Interfaces:**
- Consumes: `PolygonCoords`, `polygonAreaKm2`, `forD3` (Task 4) ; `LngLat`, `Cap` (Task 1).
- Produces: `mainBody(polys: PolygonCoords[], opts: { maxDistanceDeg: number; areaShare: number }): { kept: PolygonCoords[]; excluded: PolygonCoords[] }` ; `boundingCap(points: LngLat[], iterations?: number): Cap` (2000 itérations par défaut, sur un échantillon d'au plus 4000 points ; rayon final exact sur tous les points) ; `capContains(cap: Cap, p: LngLat, epsDeg?: number): boolean`.

- [ ] **Step 1 : Écrire les tests qui échouent**

`mainBody.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { forD3, polygonsOf, type PolygonCoords } from '../../lib/geometry';
import { mainBody } from '../../lib/mainBody';

const box = (x: number, y: number, w: number, h: number): PolygonCoords =>
  polygonsOf(forD3({ type: 'Polygon', coordinates: [[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]] }))[0]!;
const opts = { maxDistanceDeg: 25, areaShare: 0.9 };

describe('mainBody', () => {
  it('écarte un territoire lointain (France / Guyane)', () => {
    const metropole = box(-4, 42, 12, 9);
    const guyane = box(-54, 2, 2, 3);
    const r = mainBody([guyane, metropole], opts);
    expect(r.kept).toEqual([metropole]);
    expect(r.excluded).toEqual([guyane]);
  });

  it('garde les îles proches d’un archipel équilibré', () => {
    const r = mainBody([box(0, 0, 1, 1), box(2, 0, 1, 1), box(4, 0, 1, 1)], opts);
    expect(r.kept).toHaveLength(3);
  });

  it('laisse tomber un îlot négligeable une fois 90 % atteints', () => {
    const big = Array.from({ length: 9 }, (_, i) => box(i * 2, 0, 1, 1));
    const islet = box(0, 3, 0.1, 0.1);
    const r = mainBody([...big, islet], opts);
    expect(r.kept).toHaveLength(9);
    expect(r.excluded).toEqual([islet]);
  });

  it('refuse une liste vide', () => {
    expect(() => mainBody([], opts)).toThrow();
  });
});
```

`cap.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { geoDistance } from 'd3-geo';
import type { LngLat } from '../../../../src/data/types';
import { boundingCap, capContains } from '../../lib/cap';

const deg = (a: LngLat, b: LngLat) => (geoDistance(a, b) * 180) / Math.PI;

describe('boundingCap', () => {
  it('centre une calotte sur des points symétriques', () => {
    const pts: LngLat[] = [[9, 19], [11, 19], [9, 21], [11, 21]];
    const cap = boundingCap(pts);
    expect(deg(cap.center, [10, 20])).toBeLessThan(0.1);
    expect(cap.radiusDeg).toBeCloseTo(deg([10, 20], [11, 21]), 1);
  });

  it('traverse l’antiméridien sans faire le tour du monde', () => {
    const pts: LngLat[] = [[179, -16], [-179, -16], [179, -18], [-179, -18]];
    const cap = boundingCap(pts);
    expect(Math.abs(cap.center[0])).toBeGreaterThan(178);
    expect(cap.radiusDeg).toBeLessThan(2);
  });

  it('contient toujours tous les points', () => {
    const pts: LngLat[] = [[-73, -55], [-70, -18], [-75, -40], [-68, -22], [-109, -27]];
    const cap = boundingCap(pts);
    for (const p of pts) expect(capContains(cap, p, 1e-6)).toBe(true);
  });

  it('refuse une liste vide', () => {
    expect(() => boundingCap([])).toThrow();
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/mainBody.test.ts scripts/geodata/__tests__/unit/cap.test.ts`
Expected : FAIL — modules introuvables.

- [ ] **Step 3 : Implémenter `lib/mainBody.ts`**

```ts
import { geoCentroid, geoDistance } from 'd3-geo';
import { polygonAreaKm2, type PolygonCoords } from './geometry';

export interface MainBody { kept: PolygonCoords[]; excluded: PolygonCoords[] }

export function mainBody(polys: PolygonCoords[], opts: { maxDistanceDeg: number; areaShare: number }): MainBody {
  if (polys.length === 0) throw new Error('mainBody : aucun polygone');
  const items = polys
    .map((p) => ({ p, area: polygonAreaKm2(p), c: geoCentroid({ type: 'Polygon', coordinates: p }) }))
    .sort((a, b) => b.area - a.area);
  const ref = items[0]!.c;
  const near = items.filter((i) => (geoDistance(ref, i.c) * 180) / Math.PI <= opts.maxDistanceDeg);
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

- [ ] **Step 4 : Implémenter `lib/cap.ts`** (algorithme de Bădoiu–Clarkson sur la sphère : une approximation à (1 + ε) demande de l'ordre de 1/ε² itérations, d'où 2000 ; il itère sur un échantillon d'au plus 4000 sommets pour rester rapide sur la Russie, et le rayon final est recalculé exactement sur **tous** les points, donc la calotte les contient toujours)

```ts
import type { Cap, LngLat } from '../../../src/data/types';

type V = [number, number, number];
const D = Math.PI / 180;

const toV = ([lng, lat]: LngLat): V => [
  Math.cos(lat * D) * Math.cos(lng * D),
  Math.cos(lat * D) * Math.sin(lng * D),
  Math.sin(lat * D),
];
const angle = (a: V, b: V): number => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
const toLngLat = (v: V): LngLat => [Math.atan2(v[1], v[0]) / D, Math.asin(Math.max(-1, Math.min(1, v[2]))) / D];
const normalize = (v: V, fallback: V): V => {
  const n = Math.hypot(v[0], v[1], v[2]);
  return n < 1e-12 ? fallback : [v[0] / n, v[1] / n, v[2] / n];
};

const MAX_SAMPLE = 4000;

export function boundingCap(points: LngLat[], iterations = 2000): Cap {
  if (points.length === 0) throw new Error('boundingCap : aucun point');
  const vs = points.map(toV);
  const stride = Math.ceil(vs.length / MAX_SAMPLE);
  const sample = stride > 1 ? vs.filter((_, i) => i % stride === 0) : vs;
  let c = normalize(sample.reduce<V>((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]), sample[0]!);
  for (let k = 1; k <= iterations; k++) {
    let far = sample[0]!;
    let best = -1;
    for (const v of sample) {
      const d = angle(c, v);
      if (d > best) { best = d; far = v; }
    }
    const t = 1 / (k + 1);
    c = normalize([c[0] + (far[0] - c[0]) * t, c[1] + (far[1] - c[1]) * t, c[2] + (far[2] - c[2]) * t], c);
  }
  let r = 0;
  for (const v of vs) r = Math.max(r, angle(c, v));
  return { center: toLngLat(c), radiusDeg: r / D };
}

export function capContains(cap: Cap, p: LngLat, epsDeg = 1e-9): boolean {
  return angle(toV(cap.center), toV(p)) / D <= cap.radiusDeg + epsDeg;
}
```

- [ ] **Step 5 : Lancer, vérifier le succès**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/mainBody.test.ts scripts/geodata/__tests__/unit/cap.test.ts`
Expected : PASS (8 tests).

- [ ] **Step 6 : Commit**

```bash
git add web/scripts/geodata/lib/mainBody.ts web/scripts/geodata/lib/cap.ts web/scripts/geodata/__tests__/unit/mainBody.test.ts web/scripts/geodata/__tests__/unit/cap.test.ts
git commit -m "geodata : corps principal et calotte de cadrage"
```

---

### Task 7 : Point de balise (pôle d'inaccessibilité)

**Files:**
- Create: `web/scripts/geodata/lib/beacon.ts`
- Test: `web/scripts/geodata/__tests__/unit/beacon.test.ts`

**Interfaces:**
- Consumes: `PolygonCoords`, `polygonAreaKm2`, `forD3`, `polygonsOf` (Task 4) ; `LngLat` (Task 1).
- Produces: `beaconPoint(mainBodyPolys: PolygonCoords[]): { point: LngLat; clearanceKm: number }` — `point` toujours à l'intérieur du plus grand polygone du corps principal ; `clearanceKm` = distance de ce point au bord (la `distance` rendue par polylabel, convertie en km).

- [ ] **Step 1 : Écrire le test qui échoue** (un « C » dont le centroïde tombe hors du polygone, comme la Croatie autour de la Bosnie)

```ts
import { describe, expect, it } from 'vitest';
import { geoCentroid, geoContains } from 'd3-geo';
import { beaconPoint } from '../../lib/beacon';
import { forD3, polygonsOf } from '../../lib/geometry';

const cShape = polygonsOf(forD3({
  type: 'Polygon',
  coordinates: [[[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [4, 3], [4, 4], [0, 4], [0, 0]]],
}))[0]!;

describe('beaconPoint', () => {
  it('le centroïde d’un C tombe dehors, la balise dedans', () => {
    const poly = { type: 'Polygon' as const, coordinates: cShape };
    expect(geoContains(poly, geoCentroid(poly))).toBe(false);
    expect(geoContains(poly, beaconPoint([cShape]).point)).toBe(true);
  });

  it('donne la distance au bord : environ ½ degré dans un bras de 1° de large', () => {
    const { clearanceKm } = beaconPoint([cShape]);
    expect(clearanceKm).toBeGreaterThan(45);   // ½° ≈ 55,6 km à l'équateur
    expect(clearanceKm).toBeLessThan(65);
  });

  it('choisit le plus grand polygone du corps principal', () => {
    const small = polygonsOf(forD3({ type: 'Polygon', coordinates: [[[10, 0], [10.2, 0], [10.2, 0.2], [10, 0.2], [10, 0]]] }))[0]!;
    const [lng] = beaconPoint([small, cShape]).point;
    expect(lng).toBeLessThan(5);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/beacon.test.ts`
Expected : FAIL — module introuvable.

- [ ] **Step 3 : Implémenter** (projection locale pour ne pas déformer en degrés ; précision `1e-7` rad ≈ 0,6 m, cf. README de polylabel sur le choix de précision selon l'unité)

```ts
import { geoAzimuthalEquidistant, geoCentroid } from 'd3-geo';
import polylabel from 'polylabel';
import type { LngLat } from '../../../src/data/types';
import { EARTH_RADIUS_KM } from '../config';
import { polygonAreaKm2, type PolygonCoords } from './geometry';

export function beaconPoint(mainBodyPolys: PolygonCoords[]): { point: LngLat; clearanceKm: number } {
  const largest = [...mainBodyPolys].sort((a, b) => polygonAreaKm2(b) - polygonAreaKm2(a))[0];
  if (!largest) throw new Error('beaconPoint : corps principal vide');
  const c = geoCentroid({ type: 'Polygon', coordinates: largest });
  // Échelle 1 : les coordonnées projetées sont des radians d'arc, donc distance × R = km.
  const proj = geoAzimuthalEquidistant().rotate([-c[0], -c[1]]).scale(1).translate([0, 0]);
  const projected = largest.map((ring) => ring.map((p) => proj([p[0]!, p[1]!])!));
  const pole = polylabel(projected, 1e-7);
  const ll = proj.invert!([pole[0]!, pole[1]!])!;
  return { point: [ll[0], ll[1]], clearanceKm: pole.distance * EARTH_RADIUS_KM };
}
```

Si `tsc` signale l'absence de types pour `polylabel`, ajouter à `web/types/shims.d.ts` :

```ts
declare module 'polylabel' {
  export default function polylabel(polygon: number[][][], precision?: number): number[] & { distance: number };
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/beacon.test.ts && npx tsc --noEmit`
Expected : PASS (3 tests), `tsc` sans erreur.

- [ ] **Step 5 : Commit**

```bash
git add web/scripts/geodata/lib/beacon.ts web/scripts/geodata/__tests__/unit/beacon.test.ts web/types/shims.d.ts
git commit -m "geodata : point de balise au pôle d'inaccessibilité"
```

---

### Task 8 : Contour retenu — geoBoundaries ou Natural Earth

**Files:**
- Create: `web/scripts/geodata/lib/outline.ts`
- Test: `web/scripts/geodata/__tests__/unit/outline.test.ts`

**Interfaces:**
- Consumes: `forD3`, `areaKm2` (Task 4).
- Produces: `licenseAllowed(l: string): boolean` ; `chooseOutline(ne: MultiPolygon, gb: { geometry: Polygon | MultiPolygon; license: string } | undefined, refAreaKm2: number, ratio: { min: number; max: number }): Outline` avec `Outline = { geometry: MultiPolygon; source: 'geoboundaries' | 'naturalearth'; license: string; note?: string }`.

Le contrôle de surface se fait contre la surface **mledoze** : Natural Earth donne 18,8 km² à Monaco (×9,3), geoBoundaries ≈ 2 km².

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { chooseOutline, licenseAllowed } from '../../lib/outline';
import { forD3 } from '../../lib/geometry';

const ccw = (s: number): Polygon => ({ type: 'Polygon', coordinates: [[[0, 0], [s, 0], [s, s], [0, s], [0, 0]]] });
const ne = forD3(ccw(1));            // ≈ 12 364 km²
const ratio = { min: 0.5, max: 2 };
const ODBL = 'Open Data Commons Open Database License 1.0';

describe('licenseAllowed', () => {
  it.each([
    [ODBL, true],
    ['Creative Commons Attribution 4.0 International (CC BY 4.0)', true],
    ['Public Domain', true],
    ['Open Government Licence v3.0', true],
    ['Creative Commons Attribution-NonCommercial 4.0', false],
    ['CC BY-NC-SA 4.0', false],
    ['Licence inconnue', false],
  ])('%s → %s', (l, ok) => expect(licenseAllowed(l)).toBe(ok));
});

describe('chooseOutline', () => {
  it('sans geoBoundaries : Natural Earth', () => {
    expect(chooseOutline(ne, undefined, 12364, ratio).source).toBe('naturalearth');
  });
  it('geoBoundaries ODbL, anneau anti-horaire : remis dans le sens d3 et retenu', () => {
    const r = chooseOutline(ne, { geometry: ccw(0.5), license: ODBL }, 3091, ratio);
    expect(r.source).toBe('geoboundaries');
  });
  it('licence non commerciale : refusée, avec une note', () => {
    const r = chooseOutline(ne, { geometry: ccw(1), license: 'CC BY-NC 4.0' }, 12364, ratio);
    expect(r.source).toBe('naturalearth');
    expect(r.note).toMatch(/licence/);
  });
  it('surface incohérente avec la référence : refusée, avec une note', () => {
    const r = chooseOutline(ne, { geometry: ccw(3), license: ODBL }, 12364, ratio);
    expect(r.source).toBe('naturalearth');
    expect(r.note).toMatch(/surface/);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/outline.test.ts`
Expected : FAIL — module introuvable.

- [ ] **Step 3 : Implémenter**

```ts
import type { MultiPolygon, Polygon } from 'geojson';
import { areaKm2, forD3 } from './geometry';

export interface Outline {
  geometry: MultiPolygon;
  source: 'geoboundaries' | 'naturalearth';
  license: string;
  note?: string;
}

const DENIED = [/non-?commercial/i, /\bNC\b/];
const ALLOWED = [/open database license/i, /\bodbl\b/i, /public domain/i, /open government licen[cs]e/i,
  /creative commons attribution/i, /\bcc[ -]by\b/i];

export function licenseAllowed(l: string): boolean {
  if (DENIED.some((r) => r.test(l))) return false;
  return ALLOWED.some((r) => r.test(l));
}

const NE_LICENSE = 'Natural Earth (domaine public)';

export function chooseOutline(
  ne: MultiPolygon,
  gb: { geometry: Polygon | MultiPolygon; license: string } | undefined,
  refAreaKm2: number,
  ratio: { min: number; max: number },
): Outline {
  const fallback = (note?: string): Outline => ({ geometry: ne, source: 'naturalearth', license: NE_LICENSE, ...(note ? { note } : {}) });
  if (!gb) return fallback();
  if (!licenseAllowed(gb.license)) return fallback(`licence geoBoundaries refusée : ${gb.license}`);
  const g = forD3(gb.geometry);
  const r = areaKm2(g) / refAreaKm2;
  if (r < ratio.min || r > ratio.max) return fallback(`surface geoBoundaries incohérente (×${r.toFixed(2)} de la référence)`);
  return { geometry: g, source: 'geoboundaries', license: gb.license };
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/outline.test.ts`
Expected : PASS (11 tests).

- [ ] **Step 5 : Commit**

```bash
git add web/scripts/geodata/lib/outline.ts web/scripts/geodata/__tests__/unit/outline.test.ts
git commit -m "geodata : choix du contour (geoBoundaries sous licence ouverte, sinon Natural Earth)"
```

---

### Task 9 : Capitales en français (instantané Wikidata)

**Files:**
- Create: `web/scripts/geodata/fetch-capitals.ts`, `web/scripts/geodata/lib/capitals.ts`, `web/scripts/geodata/data-src/capitals.fr.json` (par exécution, versionné)
- Modify: `web/scripts/geodata/overrides.json` (clé `capitals`)
- Test: `web/scripts/geodata/__tests__/unit/capitals.test.ts`

**Interfaces:**
- Consumes: `readJson`, `writeJson`, `DATA_SRC_DIR`, `CACHE_DIR` (Task 3) ; `selectPlayable` (Task 2).
- Produces: `capitalOfGame(cca3: string, wikidata: Record<string, string[]>, overrides: Record<string, string>): { capital: string; capitals: string[] }` ; fichier `data-src/capitals.fr.json` au format `{ "<cca3>": ["Capitale", …] }`.

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import { capitalOfGame } from '../../lib/capitals';

const wd = { FRA: ['Paris'], ZAF: ['Pretoria', 'Le Cap', 'Bloemfontein'], XXX: [] as string[] };

describe('capitalOfGame', () => {
  it('une seule capitale : retenue', () => {
    expect(capitalOfGame('FRA', wd, {})).toEqual({ capital: 'Paris', capitals: ['Paris'] });
  });
  it('plusieurs capitales avec arbitrage : retenue, liste triée', () => {
    expect(capitalOfGame('ZAF', wd, { ZAF: 'Pretoria' })).toEqual({
      capital: 'Pretoria', capitals: ['Bloemfontein', 'Le Cap', 'Pretoria'],
    });
  });
  it('plusieurs capitales sans arbitrage : erreur explicite', () => {
    expect(() => capitalOfGame('ZAF', wd, {})).toThrow(/arbitrer dans overrides\.capitals\.ZAF/);
  });
  it('arbitrage absent de la liste Wikidata : erreur (faute de frappe)', () => {
    expect(() => capitalOfGame('ZAF', wd, { ZAF: 'Pretoria ' })).toThrow(/absente de la liste/);
  });
  it('aucune capitale : erreur explicite', () => {
    expect(() => capitalOfGame('XXX', wd, {})).toThrow(/Aucune capitale/);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/capitals.test.ts`
Expected : FAIL — module introuvable.

- [ ] **Step 3 : Implémenter `lib/capitals.ts`**

```ts
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
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/capitals.test.ts`
Expected : PASS (5 tests).

- [ ] **Step 5 : Lire la documentation du service de requêtes Wikidata**

Lire https://www.mediawiki.org/wiki/Wikidata_Query_Service/User_Manual (point d'accès `https://query.wikidata.org/sparql`, format `application/sparql-results+json`) et la politique User-Agent https://meta.wikimedia.org/wiki/User-Agent_policy. Condition des hooks avant tout appel.

- [ ] **Step 6 : Écrire `fetch-capitals.ts`**

La requête ne garde que les déclarations P36 sans date de fin (`pq:P582`) et non dépréciées ; le Kosovo n'a pas de code P298 et passe par son identifiant `Q1246`.

```ts
import path from 'node:path';
import { PLAYABLE_EXTRA } from './config';
import { readJson, writeJson } from './lib/io';
import { selectPlayable, type MledozeCountry } from './lib/playable';
import { CACHE_DIR, DATA_SRC_DIR } from './paths';

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
      'User-Agent': 'countrizz-geodata/0.1 (https://countrizz.fr)',
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
```

- [ ] **Step 7 : Exécuter et arbitrer**

Run: `cd web && npm run geodata:capitals`
Expected : `197 pays avec capitale` (ou une courte liste « sans ») et une liste « À arbitrer ».

Renseigner `overrides.json` → `capitals` avec ces valeurs par défaut, **à faire valider par l'utilisateur** (choix de produit) :

```json
"capitals": { "ZAF": "Pretoria", "BOL": "Sucre", "PSE": "Ramallah" }
```

Pour tout autre pays listé « À arbitrer » ou « sans » : **s'arrêter et demander à l'utilisateur** la capitale de jeu ; ne jamais en choisir une soi-même. Chaque valeur doit être recopiée telle qu'elle apparaît dans `capitals.fr.json` (sinon `capitalOfGame` lève « absente de la liste »).

- [ ] **Step 8 : Vérifier qu'aucun pays ne lève d'erreur**

Run:

```bash
cd web && npx tsx -e "
import { readJson } from './scripts/geodata/lib/io';
import { capitalOfGame } from './scripts/geodata/lib/capitals';
import { selectPlayable } from './scripts/geodata/lib/playable';
import { PLAYABLE_EXTRA } from './scripts/geodata/config';
const wd = readJson<Record<string, string[]>>('scripts/geodata/data-src/capitals.fr.json');
const o = readJson<any>('scripts/geodata/overrides.json');
const p = selectPlayable(readJson<any[]>('scripts/geodata/.cache/mledoze-countries.json'), PLAYABLE_EXTRA);
for (const c of p) capitalOfGame(c.cca3, wd, o.capitals);
console.log('capitales OK pour', p.length, 'pays ; Kosovo :', capitalOfGame('UNK', wd, o.capitals).capital);"
```

Expected : `capitales OK pour 197 pays ; Kosovo : <nom non vide>`.

- [ ] **Step 9 : Commit**

```bash
git add web/scripts/geodata/lib/capitals.ts web/scripts/geodata/fetch-capitals.ts web/scripts/geodata/data-src/capitals.fr.json \
  web/scripts/geodata/overrides.json web/scripts/geodata/__tests__/unit/capitals.test.ts
git commit -m "geodata : capitales en français (instantané Wikidata) et arbitrages"
```

---

### Task 10 : Frontières — topologie, vue d'ensemble, lignes voisines

**Files:**
- Create: `web/scripts/geodata/lib/borders.ts`
- Test: `web/scripts/geodata/__tests__/unit/borders.test.ts`

**Interfaces:**
- Consumes: `LngLat` (Task 1).
- Produces: `interface CodedFeature { code: string; geometry: Polygon | MultiPolygon }` ; `buildTopology(features: CodedFeature[]): Topology` ; `overviewBorders(topo: Topology, keep: number): LngLat[][]` (coordonnées arrondies à 3 décimales) ; `neighborLines(topo: Topology, target: string): LngLat[][]` (tous les arcs sauf ceux qui bordent `target`).

Lire d'abord les README de `topojson-server` (`topology`), `topojson-simplify` (`presimplify`, `quantile`, `simplify`) et `topojson-client` (`mesh` et son filtre `(a, b) => …`), présents dans `web/node_modules/<paquet>/README.md`.

- [ ] **Step 1 : Écrire le test qui échoue** (deux carrés A et B qui partagent un côté, plus un carré C isolé)

```ts
import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { buildTopology, neighborLines, overviewBorders } from '../../lib/borders';

const sq = (x: number): Polygon => ({ type: 'Polygon', coordinates: [[[x, 0], [x, 1], [x + 1, 1], [x + 1, 0], [x, 0]]] });
const topo = buildTopology([
  { code: 'AAA', geometry: sq(0) },
  { code: 'BBB', geometry: sq(1) },
  { code: 'CCC', geometry: sq(5) },
]);
// Tolérance 1e-4 : la quantification topojson (1e6 pas sur l'emprise) déplace les sommets intérieurs de quelques 1e-6.
const hasPoint = (lines: number[][][], x: number, y: number) =>
  lines.some((l) => l.some(([px, py]) => Math.abs(px! - x) < 1e-4 && Math.abs(py! - y) < 1e-4));

describe('frontières', () => {
  it('la vue d’ensemble contient le côté partagé A|B une seule fois', () => {
    const lines = overviewBorders(topo, 1);
    const shared = lines.filter((l) => l.length === 2 && l.every(([x]) => Math.abs(x! - 1) < 1e-4));
    expect(shared).toHaveLength(1);
  });

  it('les lignes voisines de A ne touchent jamais A', () => {
    const lines = neighborLines(topo, 'AAA');
    expect(hasPoint(lines, 0, 0)).toBe(false);   // coin propre à A
    expect(hasPoint(lines, 0, 1)).toBe(false);
    expect(hasPoint(lines, 6, 1)).toBe(true);    // C reste présent
  });

  it('la simplification réduit le nombre de points', () => {
    const fine = buildTopology([{ code: 'ZZZ', geometry: {
      type: 'Polygon',
      coordinates: [[...Array.from({ length: 200 }, (_, i) => [i / 100, Math.sin(i / 10) / 50]), [2, 1], [0, 1], [0, 0]]],
    } }]);
    const count = (ls: number[][][]) => ls.reduce((s, l) => s + l.length, 0);
    expect(count(overviewBorders(fine, 0.12))).toBeLessThan(count(overviewBorders(fine, 1)));
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/borders.test.ts`
Expected : FAIL — module introuvable.

- [ ] **Step 3 : Implémenter**

```ts
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { mesh } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { LngLat } from '../../../src/data/types';

export interface CodedFeature { code: string; geometry: Polygon | MultiPolygon }
type Topo = Topology<{ countries: GeometryCollection<{ code: string }> }>;

export function buildTopology(features: CodedFeature[]): Topo {
  const fc: FeatureCollection<Polygon | MultiPolygon, { code: string }> = {
    type: 'FeatureCollection',
    features: features.map((f) => ({ type: 'Feature', properties: { code: f.code }, geometry: f.geometry })),
  };
  return topology({ countries: fc }, 1e6) as unknown as Topo;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function overviewBorders(topo: Topo, keep: number): LngLat[][] {
  const pre = presimplify(topo);
  const simp = keep >= 1 ? pre : simplify(pre, quantile(pre, 1 - keep));
  const m = mesh(simp, simp.objects.countries);
  return m.coordinates.map((line) => line.map(([x, y]) => [round3(x!), round3(y!)] as LngLat));
}

export function neighborLines(topo: Topo, target: string): LngLat[][] {
  const m = mesh(topo, topo.objects.countries, (a, b) => a.properties!.code !== target && b.properties!.code !== target);
  return m.coordinates.map((line) => line.map(([x, y]) => [x!, y!] as LngLat));
}
```

Si le paquet de types `topojson-specification` n'est pas déjà tiré par `@types/topojson-client`, l'installer : `npm install -E -D @types/topojson-specification`.

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/borders.test.ts && npx tsc --noEmit`
Expected : PASS (3 tests), `tsc` sans erreur.

- [ ] **Step 5 : Commit**

```bash
git add web/scripts/geodata/lib/borders.ts web/scripts/geodata/__tests__/unit/borders.test.ts web/package.json web/package-lock.json
git commit -m "geodata : topologie, frontières de vue d'ensemble et lignes voisines"
```

---

### Task 11 : Patchs SDF par pays

**Files:**
- Create: `web/scripts/geodata/lib/patch.ts`
- Test: `web/scripts/geodata/__tests__/unit/patch.test.ts`

**Interfaces:**
- Consumes: `LngLat`, `PatchMeta` (Task 1) ; `PolygonCoords` (Task 4).
- Produces: `patchExtentRad(capRadiusDeg: number, cfg: { extentFactor: number; minExtentDeg: number }): number` ; `makeProjector(f: PatchFrame): { toPixel(p: LngLat): [number, number]; toLngLat(px: number, py: number): LngLat }` avec `PatchFrame = { center: LngLat; extentRad: number; size: number }` ; `rasterizePolygons(rings: [number, number][][], size: number): Uint8Array` ; `squaredDistanceTo(seed: Uint8Array, size: number): Float64Array` ; `signedDistance(inside: Uint8Array, size: number): Float32Array` ; `rasterizeLines(lines: [number, number][][], size: number): Uint8Array` ; `buildPatch(outline: PolygonCoords[], neighbors: LngLat[][], frame: PatchFrame, rangeTexels: number): { png: Buffer; insidePixels: number }` ; `samplePatchPng(png: PNG, meta: PatchMeta, p: LngLat): { r: number; g: number } | null`.

- [ ] **Step 1 : Écrire le test qui échoue**

```ts
import { describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';
import {
  buildPatch, makeProjector, patchExtentRad, rasterizePolygons, samplePatchPng, signedDistance,
} from '../../lib/patch';
import type { PatchMeta } from '../../../../src/data/types';

describe('projection du patch', () => {
  const f = { center: [0, 0] as [number, number], extentRad: (2 * Math.PI) / 180, size: 1024 };
  const p = makeProjector(f);
  it('le centre tombe au milieu', () => {
    const [x, y] = p.toPixel([0, 0]);
    expect(x).toBeCloseTo(512, 6);
    expect(y).toBeCloseTo(512, 6);
  });
  it('le nord est en haut', () => {
    expect(p.toPixel([0, 1])[1]).toBeLessThan(512);
  });
  it('aller-retour pixel ↔ lng/lat', () => {
    const [lng, lat] = p.toLngLat(...p.toPixel([0.7, -1.2]));
    expect(lng).toBeCloseTo(0.7, 6);
    expect(lat).toBeCloseTo(-1.2, 6);
  });
  it('demi-côté : 1,5 × rayon, plancher 0,02°', () => {
    expect(patchExtentRad(10, { extentFactor: 1.5, minExtentDeg: 0.02 })).toBeCloseTo((15 * Math.PI) / 180, 9);
    expect(patchExtentRad(0.001, { extentFactor: 1.5, minExtentDeg: 0.02 })).toBeCloseTo((0.02 * Math.PI) / 180, 9);
  });
});

describe('rastérisation et champ de distance', () => {
  const size = 64;
  const square: [number, number][][] = [[[16, 16], [48, 16], [48, 48], [16, 48], [16, 16]]];
  const mask = rasterizePolygons(square, size);
  const sd = signedDistance(mask, size);
  it('remplit le carré, pas l’extérieur', () => {
    expect(mask[32 * size + 32]).toBe(1);
    expect(mask[4 * size + 4]).toBe(0);
  });
  it('distance positive dedans, négative dehors, nulle au bord', () => {
    expect(sd[32 * size + 32]!).toBeGreaterThan(10);
    expect(sd[4 * size + 4]!).toBeLessThan(-10);
    expect(Math.abs(sd[32 * size + 16]!)).toBeLessThanOrEqual(0.5);
  });
  it('respecte un trou (enclave) en pair-impair', () => {
    const withHole: [number, number][][] = [...square, [[28, 28], [36, 28], [36, 36], [28, 36], [28, 28]]];
    expect(rasterizePolygons(withHole, size)[32 * size + 32]).toBe(0);
  });
});

describe('patch complet', () => {
  it('franchit l’antiméridien d’un seul tenant (fixture Fidji)', () => {
    const west = [[[178, -17], [180, -17], [180, -16], [178, -16], [178, -17]]];
    const east = [[[-180, -17], [-178, -17], [-178, -16], [-180, -16], [-180, -17]]];
    const frame = { center: [180, -16.5] as [number, number], extentRad: (3 * Math.PI) / 180, size: 256 };
    const { png, insidePixels } = buildPatch([west, east], [], frame, 32);
    const meta: PatchMeta = { sdf: '', size: 256, center: frame.center, extentRad: frame.extentRad, rangeTexels: 32 };
    const decoded = PNG.sync.read(png);
    expect(insidePixels).toBeGreaterThan(0);
    expect(samplePatchPng(decoded, meta, [179.99, -16.5])!.r).toBeGreaterThan(128);
    expect(samplePatchPng(decoded, meta, [-179.99, -16.5])!.r).toBeGreaterThan(128);
    expect(samplePatchPng(decoded, meta, [180, -18.5])!.r).toBeLessThan(128);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/patch.test.ts`
Expected : FAIL — module introuvable.

- [ ] **Step 3 : Implémenter `lib/patch.ts`**

```ts
import { geoAzimuthalEquidistant } from 'd3-geo';
import { PNG } from 'pngjs';
import type { LngLat, PatchMeta } from '../../../src/data/types';
import type { PolygonCoords } from './geometry';

export interface PatchFrame { center: LngLat; extentRad: number; size: number }

export function patchExtentRad(capRadiusDeg: number, cfg: { extentFactor: number; minExtentDeg: number }): number {
  return (Math.max(capRadiusDeg * cfg.extentFactor, cfg.minExtentDeg) * Math.PI) / 180;
}

export function makeProjector(f: PatchFrame) {
  const proj = geoAzimuthalEquidistant().rotate([-f.center[0], -f.center[1]]).scale(1).translate([0, 0]);
  const half = f.size / 2;
  return {
    toPixel(p: LngLat): [number, number] {
      const xy = proj(p);
      return xy ? [(xy[0] / f.extentRad + 1) * half, (xy[1] / f.extentRad + 1) * half] : [NaN, NaN];
    },
    toLngLat(px: number, py: number): LngLat {
      const ll = proj.invert!([(px / half - 1) * f.extentRad, (py / half - 1) * f.extentRad])!;
      return [ll[0], ll[1]];
    },
  };
}

/** Remplissage pair-impair aux centres de pixels ; les anneaux sont en coordonnées pixel. */
export function rasterizePolygons(rings: [number, number][][], size: number): Uint8Array {
  const mask = new Uint8Array(size * size);
  const xs: number[] = [];
  for (let y = 0; y < size; y++) {
    const sy = y + 0.5;
    xs.length = 0;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x1, y1] = ring[i]!;
        const [x2, y2] = ring[j]!;
        if (y1 > sy !== y2 > sy) xs.push(x1 + ((sy - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k]! - 0.5));
      const to = Math.min(size - 1, Math.floor(xs[k + 1]! - 0.5));
      for (let x = from; x <= to; x++) mask[y * size + x] = 1;
    }
  }
  return mask;
}

const INF = 1e20;

function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    d[q] = (q - v[k]!) ** 2 + f[v[k]!]!;
  }
}

/** Distance euclidienne au carré (texels²) au plus proche pixel où seed vaut 1 (Felzenszwalb & Huttenlocher). */
export function squaredDistanceTo(seed: Uint8Array, size: number): Float64Array {
  const grid = new Float64Array(size * size);
  for (let i = 0; i < grid.length; i++) grid[i] = seed[i] ? 0 : INF;
  const f = new Float64Array(size), d = new Float64Array(size), v = new Int32Array(size), z = new Float64Array(size + 1);
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) f[y] = grid[y * size + x]!;
    edt1d(f, size, d, v, z);
    for (let y = 0; y < size; y++) grid[y * size + x] = d[y]!;
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) f[x] = grid[y * size + x]!;
    edt1d(f, size, d, v, z);
    for (let x = 0; x < size; x++) grid[y * size + x] = d[x]!;
  }
  return grid;
}

/** > 0 dedans, < 0 dehors ; le bord passe entre deux pixels (±0,5). */
export function signedDistance(inside: Uint8Array, size: number): Float32Array {
  const outside = new Uint8Array(inside.length);
  for (let i = 0; i < inside.length; i++) outside[i] = inside[i] ? 0 : 1;
  const toOutside = squaredDistanceTo(outside, size);
  const toInside = squaredDistanceTo(inside, size);
  const sd = new Float32Array(inside.length);
  for (let i = 0; i < sd.length; i++) {
    sd[i] = inside[i] ? Math.sqrt(toOutside[i]!) - 0.5 : -(Math.sqrt(toInside[i]!) - 0.5);
  }
  return sd;
}

/** Tracé des segments (échantillonnage à ½ texel), découpé au cadre par Liang–Barsky. */
export function rasterizeLines(lines: [number, number][][], size: number): Uint8Array {
  const mask = new Uint8Array(size * size);
  const lo = -1, hi = size + 1;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      let [x0, y0] = line[i - 1]!;
      let [x1, y1] = line[i]!;
      if (!Number.isFinite(x0 + y0 + x1 + y1)) continue;
      const dx = x1 - x0, dy = y1 - y0;
      let t0 = 0, t1 = 1;
      let visible = true;
      for (const [p, q] of [[-dx, x0 - lo], [dx, hi - x0], [-dy, y0 - lo], [dy, hi - y0]] as const) {
        if (p === 0) { if (q < 0) { visible = false; break; } continue; }
        const r = q / p;
        if (p < 0) { if (r > t1) { visible = false; break; } if (r > t0) t0 = r; }
        else { if (r < t0) { visible = false; break; } if (r < t1) t1 = r; }
      }
      if (!visible) continue;
      [x0, y0, x1, y1] = [x0 + dx * t0, y0 + dy * t0, x0 + dx * t1, y0 + dy * t1];
      const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
      for (let s = 0; s <= steps; s++) {
        const x = Math.floor(x0 + ((x1 - x0) * s) / steps);
        const y = Math.floor(y0 + ((y1 - y0) * s) / steps);
        if (x >= 0 && y >= 0 && x < size && y < size) mask[y * size + x] = 1;
      }
    }
  }
  return mask;
}

export function buildPatch(
  outline: PolygonCoords[],
  neighbors: LngLat[][],
  frame: PatchFrame,
  rangeTexels: number,
): { png: Buffer; insidePixels: number } {
  const { size } = frame;
  const proj = makeProjector(frame);
  const rings = outline.flatMap((poly) => poly.map((ring) => ring.map((p) => proj.toPixel([p[0]!, p[1]!]))));
  const inside = rasterizePolygons(rings, size);
  const sd = signedDistance(inside, size);
  const lines = rasterizeLines(neighbors.map((l) => l.map((p) => proj.toPixel(p))), size);
  const hasLines = lines.some((v) => v === 1);
  const border = hasLines ? squaredDistanceTo(lines, size) : null;

  const png = new PNG({ width: size, height: size });
  let insidePixels = 0;
  for (let i = 0; i < size * size; i++) {
    if (inside[i]) insidePixels++;
    const r = Math.round(128 + (Math.max(-rangeTexels, Math.min(rangeTexels, sd[i]!)) / rangeTexels) * 127);
    const g = border ? Math.round((Math.min(Math.sqrt(border[i]!), rangeTexels) / rangeTexels) * 255) : 255;
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = 0;
    png.data[i * 4 + 3] = 255;
  }
  return { png: PNG.sync.write(png), insidePixels };
}

export function samplePatchPng(png: PNG, meta: PatchMeta, p: LngLat): { r: number; g: number } | null {
  const [x, y] = makeProjector(meta).toPixel(p);
  const xi = Math.floor(x), yi = Math.floor(y);
  if (!(xi >= 0 && yi >= 0 && xi < png.width && yi < png.height)) return null;
  const i = (yi * png.width + xi) * 4;
  return { r: png.data[i]!, g: png.data[i + 1]! };
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/patch.test.ts && npx tsc --noEmit`
Expected : PASS (8 tests), `tsc` sans erreur.

- [ ] **Step 5 : Commit**

```bash
git add web/scripts/geodata/lib/patch.ts web/scripts/geodata/__tests__/unit/patch.test.ts
git commit -m "geodata : patchs SDF (projection locale, rastérisation, distance signée, frontières voisines)"
```

---

### Task 12 : Assemblage `npm run geodata`, sorties, rapport, crédits et contrôles de données

**Files:**
- Create: `web/scripts/geodata/lib/report.ts`, `web/scripts/geodata/build.ts`
- Create (par exécution, versionnés) : `web/public/data/countries.json`, `borders.json`, `credits.json`, `flags/*.svg`, `patches/sdf/*.png`, `web/scripts/geodata/rapport-geodata.md`
- Test: `web/scripts/geodata/__tests__/unit/report.test.ts`, `web/scripts/geodata/__tests__/data/helpers.ts`, `…/data/output.test.ts`, `…/data/enclaves.test.ts`, `…/data/merges.test.ts`, `…/data/antimeridian.test.ts`, `…/data/kosovo.test.ts`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: `renderReport(rows: ReportRow[], previous: CountryRecord[] | null, current: CountryRecord[]): string` ; les fichiers de `web/public/data/` au contrat `CountryRecord` (Task 1), lus par le jeu en phase 1.

- [ ] **Step 1 : Écrire le test du rapport qui échoue**

`__tests__/unit/report.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../../../../src/data/types';
import { renderReport, type ReportRow } from '../../lib/report';

const rec = (cca3: string, lng: number, areaKm2: number): CountryRecord => ({
  id: 1, cca3, cca2: 'XX', name: cca3, capital: 'X', capitals: ['X'], region: 'R', subregion: 'S', neighbors: [],
  areaKm2, cap: { center: [lng, 0], radiusDeg: 1 }, beacon: [lng, 0], beaconClearanceKm: 10, flag: '',
  outlineSource: 'naturalearth', patch: { sdf: '', size: 1024, center: [lng, 0], extentRad: 0.03, rangeTexels: 32 },
});
const row: ReportRow = {
  cca3: 'AAA', name: 'Aaa', source: 'naturalearth', license: 'NE', areaKm2: 100, refAreaKm2: 100,
  capRadiusDeg: 1, excluded: 0, centerInside: false, insidePixels: 5000, beaconClearanceKm: 0.2, texelKm: 0.4,
};

describe('renderReport', () => {
  it('liste les centres hors pays, les pays sous-texel et les écarts avec la génération précédente', () => {
    const md = renderReport([row], [rec('AAA', 0, 100), rec('OLD', 0, 1)], [rec('AAA', 2, 110), rec('NEW', 0, 1)]);
    expect(md).toContain('Centres de calotte hors du pays');
    expect(md).toMatch(/Lisibles seulement par leur balise[^\n]*\n\nAAA/);
    expect(md).toContain('AAA');
    expect(md).toContain('Ajoutés : NEW');
    expect(md).toContain('Retirés : OLD');
    expect(md).toMatch(/AAA.*calotte déplacée/);
    expect(md).toMatch(/AAA.*surface/);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/report.test.ts`
Expected : FAIL — module introuvable.

- [ ] **Step 3 : Implémenter `lib/report.ts`**

```ts
import { geoDistance } from 'd3-geo';
import type { CountryRecord } from '../../../src/data/types';

export interface ReportRow {
  cca3: string;
  name: string;
  source: string;
  license: string;
  areaKm2: number;
  refAreaKm2: number;
  capRadiusDeg: number;
  excluded: number;
  centerInside: boolean;
  insidePixels: number;
  beaconClearanceKm: number;
  texelKm: number;
  note?: string;
}

/** Une balise à moins de 1,5 texel du bord : le remplissage du patch ne suffit pas à lire le pays. */
export const isSubTexel = (r: { beaconClearanceKm: number; texelKm: number }) => r.beaconClearanceKm < 1.5 * r.texelKm;

const deg = (a: [number, number], b: [number, number]) => (geoDistance(a, b) * 180) / Math.PI;

export function renderReport(rows: ReportRow[], previous: CountryRecord[] | null, current: CountryRecord[]): string {
  const out: string[] = ['# Rapport de génération des données pays', ''];
  out.push(`${rows.length} pays.`, '');

  out.push('## Écarts avec la génération précédente', '');
  if (!previous) out.push('Première génération.', '');
  else {
    const prev = new Map(previous.map((r) => [r.cca3, r]));
    const cur = new Map(current.map((r) => [r.cca3, r]));
    out.push(`Ajoutés : ${[...cur.keys()].filter((k) => !prev.has(k)).join(', ') || 'aucun'}`);
    out.push(`Retirés : ${[...prev.keys()].filter((k) => !cur.has(k)).join(', ') || 'aucun'}`, '');
    for (const [k, c] of cur) {
      const p = prev.get(k);
      if (!p) continue;
      const moved = deg(p.cap.center, c.cap.center);
      const changes: string[] = [];
      if (moved > 0.5) changes.push(`calotte déplacée de ${moved.toFixed(2)}°`);
      if (Math.abs(c.cap.radiusDeg - p.cap.radiusDeg) > 0.1 * p.cap.radiusDeg) changes.push(`rayon ${p.cap.radiusDeg.toFixed(2)}° → ${c.cap.radiusDeg.toFixed(2)}°`);
      if (Math.abs(c.areaKm2 - p.areaKm2) > 0.05 * p.areaKm2) changes.push(`surface ${p.areaKm2} → ${c.areaKm2} km²`);
      if (changes.length) out.push(`- ${k} : ${changes.join(' ; ')}`);
    }
    out.push('');
  }

  out.push('## Centres de calotte hors du pays (informatif : archipels, pays en croissant)', '');
  out.push(rows.filter((r) => !r.centerInside).map((r) => r.cca3).join(' ') || 'aucun', '');

  out.push('## Lisibles seulement par leur balise (balise à moins de 1,5 texel du bord : atolls, micro-territoires)', '');
  out.push(rows.filter(isSubTexel).map((r) => r.cca3).join(' ') || 'aucun', '');

  out.push('## Détail par pays', '');
  out.push('| cca3 | nom | contour | licence | surface km² | réf. km² | rayon ° | polygones écartés | pixels dedans | balise→bord km | texel km | note |');
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    out.push(`| ${r.cca3} | ${r.name} | ${r.source} | ${r.license} | ${Math.round(r.areaKm2)} | ${r.refAreaKm2} | ${r.capRadiusDeg.toFixed(3)} | ${r.excluded} | ${r.insidePixels} | ${r.beaconClearanceKm.toFixed(2)} | ${r.texelKm.toFixed(3)} | ${r.note ?? ''} |`);
  }
  return out.join('\n') + '\n';
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `cd web && npx vitest run --project unit scripts/geodata/__tests__/unit/report.test.ts`
Expected : PASS.

- [ ] **Step 5 : Écrire `build.ts`**

Le build lève une erreur (et n'écrit rien de partiel dans `public/data/countries.json`) si : un pays n'a pas de géométrie, une capitale n'est pas arbitrée, la calotte ne contient pas un sommet du corps principal, un patch n'a aucun pixel « dedans » **alors que sa balise est à plus de 1,5 texel du bord** (un atoll plus fin qu'un texel peut légitimement n'en avoir aucun : il est listé dans le rapport, lisible par sa balise), ou une surface sort de ×0,5–×2 sans entrée motivée dans `areaWhitelist`.

```ts
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { geoContains } from 'd3-geo';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { CountryRecord, LngLat } from '../../src/data/types';
import { AREA_RATIO, BORDERS_KEEP, EARTH_RADIUS_KM, MAIN_BODY, PATCH, PLAYABLE_COUNT, PLAYABLE_EXTRA } from './config';
import { beaconPoint } from './lib/beacon';
import { buildTopology, neighborLines, overviewBorders } from './lib/borders';
import { boundingCap, capContains } from './lib/cap';
import { capitalOfGame } from './lib/capitals';
import { areaKm2, forD3, polygonsOf } from './lib/geometry';
import { readJson, writeBytes, writeJson } from './lib/io';
import { joinNaturalEarth, neCode, type NeProps, type Overrides } from './lib/join';
import { mainBody } from './lib/mainBody';
import { chooseOutline } from './lib/outline';
import { buildPatch, patchExtentRad } from './lib/patch';
import { selectPlayable, type MledozeCountry } from './lib/playable';
import { isSubTexel, renderReport, type ReportRow } from './lib/report';
import { CACHE_DIR, DATA_SRC_DIR, OUT_DIR, OVERRIDES_PATH, REPORT_PATH } from './paths';

function loadGb(cca3: string): { geometry: Polygon | MultiPolygon; license: string; source: string; year: string } | undefined {
  const geo = path.join(CACHE_DIR, 'gb', `${cca3}.geojson`);
  const meta = path.join(CACHE_DIR, 'gb', `${cca3}.meta.json`);
  if (!existsSync(geo) || !existsSync(meta)) return undefined;
  const fc = readJson<FeatureCollection<Polygon | MultiPolygon>>(geo);
  const m = readJson<{ license: string; source: string; year: string }>(meta);
  const polys = fc.features.flatMap((f) => polygonsOf(f.geometry));
  return { geometry: { type: 'MultiPolygon', coordinates: polys }, ...m };
}

function main(): void {
  const mz = readJson<MledozeCountry[]>(path.join(CACHE_DIR, 'mledoze-countries.json'));
  const playable = selectPlayable(mz, PLAYABLE_EXTRA);
  if (playable.length !== PLAYABLE_COUNT) throw new Error(`${playable.length} pays jouables au lieu de ${PLAYABLE_COUNT}`);
  const playableSet = new Set(playable.map((c) => c.cca3));
  const overrides = readJson<Overrides>(OVERRIDES_PATH);
  const wikidata = readJson<Record<string, string[]>>(path.join(DATA_SRC_DIR, 'capitals.fr.json'));
  const ne = readJson<FeatureCollection<Polygon | MultiPolygon, NeProps>>(path.join(CACHE_DIR, 'ne_10m_admin_0_countries.geojson'));

  const join = joinNaturalEarth(ne, [...playableSet], overrides);
  if (join.unmatched.length) throw new Error(`Sans géométrie Natural Earth : ${join.unmatched.join(', ')}`);

  const topo = buildTopology([
    ...[...join.byCountry].map(([code, geometry]) => ({ code, geometry })),
    ...join.neutral.map((f) => ({ code: neCode(f.properties), geometry: forD3(f.geometry) })),
  ]);

  const previousPath = path.join(OUT_DIR, 'countries.json');
  const previous = existsSync(previousPath) ? readJson<CountryRecord[]>(previousPath) : null;
  const records: CountryRecord[] = [];
  const rows: ReportRow[] = [];
  const gbCredits: { cca3: string; license: string; source: string; year: string }[] = [];

  for (const [index, c] of playable.entries()) {
    const lower = c.cca3.toLowerCase();
    const gb = loadGb(c.cca3);
    const outline = chooseOutline(join.byCountry.get(c.cca3)!, gb, c.area, AREA_RATIO);
    if (outline.source === 'geoboundaries' && gb) gbCredits.push({ cca3: c.cca3, license: gb.license, source: gb.source, year: gb.year });

    const area = areaKm2(outline.geometry);
    const ratio = area / c.area;
    if ((ratio < AREA_RATIO.min || ratio > AREA_RATIO.max) && !overrides.areaWhitelist[c.cca3]) {
      throw new Error(`${c.cca3} : surface ×${ratio.toFixed(2)} de la référence (${Math.round(area)} / ${c.area} km²) — motiver dans overrides.areaWhitelist ou corriger`);
    }

    const polys = polygonsOf(outline.geometry);
    const body = mainBody(polys, MAIN_BODY);
    const bodyPoints = body.kept.flatMap((p) => p[0]!.map((q) => [q[0]!, q[1]!] as LngLat));
    const cap = boundingCap(bodyPoints);
    for (const q of bodyPoints) if (!capContains(cap, q, 1e-6)) throw new Error(`${c.cca3} : la calotte ne contient pas ${q}`);
    const { point: beacon, clearanceKm } = beaconPoint(body.kept);
    const { capital, capitals } = capitalOfGame(c.cca3, wikidata, overrides.capitals);

    const frame = { center: cap.center, extentRad: patchExtentRad(cap.radiusDeg, PATCH), size: PATCH.size };
    const texelKm = (2 * frame.extentRad * EARTH_RADIUS_KM) / frame.size;
    const { png, insidePixels } = buildPatch(polys, neighborLines(topo, c.cca3), frame, PATCH.rangeTexels);
    if (insidePixels === 0 && !isSubTexel({ beaconClearanceKm: clearanceKm, texelKm })) {
      throw new Error(`${c.cca3} : patch vide alors que la balise est à ${clearanceKm.toFixed(2)} km du bord (texel ${texelKm.toFixed(3)} km)`);
    }
    writeBytes(path.join(OUT_DIR, 'patches', 'sdf', `${lower}.png`), png);

    mkdirSync(path.join(OUT_DIR, 'flags'), { recursive: true });
    copyFileSync(path.join(CACHE_DIR, 'flags', `${lower}.svg`), path.join(OUT_DIR, 'flags', `${lower}.svg`));

    records.push({
      id: index + 1,
      cca3: c.cca3,
      cca2: c.cca2,
      name: c.translations.fra?.common ?? c.name.common,
      capital,
      capitals,
      region: c.region,
      subregion: c.subregion,
      neighbors: c.borders.filter((b) => playableSet.has(b)).sort(),
      areaKm2: Math.round(area),
      cap: { center: cap.center, radiusDeg: cap.radiusDeg },
      beacon,
      beaconClearanceKm: Math.round(clearanceKm * 1000) / 1000,
      flag: `flags/${lower}.svg`,
      outlineSource: outline.source,
      patch: { sdf: `patches/sdf/${lower}.png`, size: PATCH.size, center: cap.center, extentRad: frame.extentRad, rangeTexels: PATCH.rangeTexels },
    });
    rows.push({
      cca3: c.cca3, name: records.at(-1)!.name, source: outline.source, license: outline.license,
      areaKm2: area, refAreaKm2: c.area, capRadiusDeg: cap.radiusDeg, excluded: body.excluded.length,
      centerInside: geoContains(outline.geometry, cap.center), insidePixels, beaconClearanceKm: clearanceKm, texelKm,
      ...(outline.note ? { note: outline.note } : {}),
    });
    process.stdout.write(`\r${index + 1}/${playable.length} ${c.cca3}   `);
  }

  writeJson(path.join(OUT_DIR, 'borders.json'), overviewBorders(topo, BORDERS_KEEP));
  writeJson(path.join(OUT_DIR, 'credits.json'), {
    naturalEarth: { licence: 'domaine public', url: 'https://www.naturalearthdata.com/' },
    mledoze: { licence: 'ODbL 1.0', url: 'https://github.com/mledoze/countries' },
    wikidata: { url: 'https://www.wikidata.org/' },
    geoBoundaries: gbCredits,
    note: 'countries.json et les contours dérivés sont publiés sous ODbL 1.0.',
  });
  writeFileSync(REPORT_PATH, renderReport(rows, previous, records));
  writeJson(previousPath, records);
  console.log(`\nOK : ${records.length} pays → ${OUT_DIR}`);
}

main();
```

Note : `countries.json` est écrit en dernier, une fois toutes les vérifications passées, pour qu'une génération qui échoue en cours de route ne laisse pas de fichier principal incohérent.

- [ ] **Step 6 : Lancer la génération**

Run: `cd web && npm run geodata`
Expected : `OK : 197 pays → …/public/data`.
- Si le build s'arrête sur une **surface** : ouvrir le cas, vérifier dans la source s'il s'agit d'un écart connu (par exemple une définition différente des eaux intérieures) ; si l'écart est légitime, l'ajouter à `overrides.areaWhitelist` **avec une raison écrite** et relancer ; sinon, corriger la jointure. En cas de doute, demander à l'utilisateur.
- Si le build s'arrête sur une **capitale** : revenir à la Task 9, Step 7 (arbitrage par l'utilisateur).

- [ ] **Step 7 : Mesurer le poids des sorties**

Run: `cd web && du -sh public/data public/data/patches/sdf public/data/flags && ls -la public/data/borders.json public/data/countries.json`
Expected : `patches/sdf` ≤ 50 Mo, `borders.json` ≤ 2 Mo. **Au-delà, s'arrêter et montrer les mesures à l'utilisateur** avant de commiter (le spec prévoit des sorties versionnées ; un poids excessif changerait cette décision).

- [ ] **Step 8 : Écrire les contrôles de données**

`__tests__/data/helpers.ts` :

```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import type { CountryRecord, LngLat } from '../../../../src/data/types';
import { samplePatchPng } from '../../lib/patch';
import { OUT_DIR } from '../../paths';

export function loadCountries(): CountryRecord[] {
  const p = path.join(OUT_DIR, 'countries.json');
  if (!existsSync(p)) throw new Error('public/data/countries.json absent : lancer `npm run geodata` avant `npm run test:data`');
  return JSON.parse(readFileSync(p, 'utf8')) as CountryRecord[];
}

const cache = new Map<string, PNG>();
export function sample(rec: CountryRecord, p: LngLat): { r: number; g: number } {
  let png = cache.get(rec.cca3);
  if (!png) { png = PNG.sync.read(readFileSync(path.join(OUT_DIR, rec.patch.sdf))); cache.set(rec.cca3, png); }
  const s = samplePatchPng(png, rec.patch, p);
  if (!s) throw new Error(`${p} hors de l'emprise du patch ${rec.cca3}`);
  return s;
}

export const byCca3 = (all: CountryRecord[], cca3: string): CountryRecord => {
  const r = all.find((c) => c.cca3 === cca3);
  if (!r) throw new Error(`${cca3} absent de countries.json`);
  return r;
};

/** Côté d'un texel du patch, en km. */
export const texelKm = (c: CountryRecord): number => (2 * c.patch.extentRad * EARTH_RADIUS_KM) / c.patch.size;

/** La balise est-elle assez loin du bord pour que le remplissage du patch la couvre ? (même règle que le build) */
export const beaconReadable = (c: CountryRecord): boolean => !isSubTexel({ beaconClearanceKm: c.beaconClearanceKm, texelKm: texelKm(c) });
```

Ajouter en tête de `helpers.ts` : `import { EARTH_RADIUS_KM } from '../../config';` et `import { isSubTexel } from '../../lib/report';`.

`__tests__/data/output.test.ts` :

```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MledozeCountry } from '../../lib/playable';
import { readJson } from '../../lib/io';
import { CACHE_DIR, OUT_DIR, OVERRIDES_PATH } from '../../paths';
import { AREA_RATIO } from '../../config';
import { beaconReadable, loadCountries, sample } from './helpers';

const all = loadCountries();

describe('countries.json', () => {
  it('197 pays, identifiants 1..197, cca3 uniques', () => {
    expect(all).toHaveLength(197);
    expect(all.map((c) => c.id)).toEqual(Array.from({ length: 197 }, (_, i) => i + 1));
    expect(new Set(all.map((c) => c.cca3)).size).toBe(197);
  });

  it('contient Vatican, Palestine, Kosovo, Taïwan ; pas le Groenland ni Porto Rico', () => {
    const codes = all.map((c) => c.cca3);
    for (const k of ['VAT', 'PSE', 'UNK', 'TWN']) expect(codes).toContain(k);
    for (const k of ['GRL', 'PRI']) expect(codes).not.toContain(k);
  });

  it('nom et capitale non vides, capitale de jeu dans la liste', () => {
    for (const c of all) {
      expect(c.name.trim(), c.cca3).not.toBe('');
      expect(c.capitals, c.cca3).toContain(c.capital);
    }
  });

  it('drapeau et patch présents pour chacun', () => {
    for (const c of all) {
      expect(existsSync(path.join(OUT_DIR, c.flag)), c.flag).toBe(true);
      expect(readFileSync(path.join(OUT_DIR, c.flag), 'utf8').slice(0, 200), c.flag).toMatch(/<svg|<\?xml/);
      expect(existsSync(path.join(OUT_DIR, c.patch.sdf)), c.patch.sdf).toBe(true);
    }
  });

  it('la balise tombe dans le pays selon son propre patch (pays lisibles au texel)', () => {
    const readable = all.filter(beaconReadable);
    // Garde-fou contre un test vide : la très grande majorité des pays est lisible au texel.
    expect(readable.length).toBeGreaterThan(170);
    for (const c of readable) expect(sample(c, c.beacon).r, c.cca3).toBeGreaterThan(128);
  });

  it('les pays sous-texel sont des atolls ou des micro-territoires (balise à moins de 2 km du bord)', () => {
    for (const c of all.filter((x) => !beaconReadable(x))) expect(c.beaconClearanceKm, c.cca3).toBeLessThan(2);
  });

  it('surface entre ×0,5 et ×2 de la référence, sauf exception motivée', () => {
    const mz = new Map(readJson<MledozeCountry[]>(path.join(CACHE_DIR, 'mledoze-countries.json')).map((m) => [m.cca3, m]));
    const whitelist = readJson<{ areaWhitelist: Record<string, string> }>(OVERRIDES_PATH).areaWhitelist;
    for (const c of all) {
      const r = c.areaKm2 / mz.get(c.cca3)!.area;
      if (whitelist[c.cca3]) { expect(whitelist[c.cca3]!.trim().length, c.cca3).toBeGreaterThan(10); continue; }
      expect(r, c.cca3).toBeGreaterThanOrEqual(AREA_RATIO.min);
      expect(r, c.cca3).toBeLessThanOrEqual(AREA_RATIO.max);
    }
  });

  it('voisins : uniquement des pays jouables', () => {
    const codes = new Set(all.map((c) => c.cca3));
    for (const c of all) for (const n of c.neighbors) expect(codes.has(n), `${c.cca3} → ${n}`).toBe(true);
  });
});
```

`__tests__/data/enclaves.test.ts` :

On échantillonne à la **balise de l'enclave** (son point le plus éloigné du bord). Une enclave plus petite que 3 texels du patch englobant ne peut pas y apparaître ; elle est alors invisible au cadrage du pays englobant, et l'on n'exige rien — mais on vérifie que Saint-Marin et le Lesotho, eux, franchissent le seuil, pour que le test ne soit jamais vide.

```ts
import { describe, expect, it } from 'vitest';
import { byCca3, loadCountries, sample, texelKm } from './helpers';

const all = loadCountries();
const widthPx = (outer: string, enclave: string) =>
  Math.sqrt(byCca3(all, enclave).areaKm2) / texelKm(byCca3(all, outer));

describe('enclaves', () => {
  it.each([['VAT'], ['SMR'], ['MCO'], ['LSO']] as const)('%s : sa balise est dedans selon son propre patch', (e) => {
    const c = byCca3(all, e);
    expect(sample(c, c.beacon).r).toBeGreaterThan(128);
  });

  it.each([['ITA', 'VAT'], ['ITA', 'SMR'], ['FRA', 'MCO'], ['ZAF', 'LSO']] as const)(
    '%s exclut %s dès qu’elle fait au moins 3 texels', (outer, enclave) => {
      if (widthPx(outer, enclave) < 3) return;
      expect(sample(byCca3(all, outer), byCca3(all, enclave).beacon).r).toBeLessThan(128);
    },
  );

  it('Saint-Marin et le Lesotho sont assez grands pour être exigés', () => {
    expect(widthPx('ITA', 'SMR')).toBeGreaterThanOrEqual(3);
    expect(widthPx('ZAF', 'LSO')).toBeGreaterThanOrEqual(3);
  });
});
```

`__tests__/data/merges.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { byCca3, loadCountries, sample } from './helpers';

const all = loadCountries();

describe('entités fusionnées', () => {
  it('Chypre du Nord s’allume avec Chypre', () => {
    expect(sample(byCca3(all, 'CYP'), [33.5, 35.25]).r).toBeGreaterThan(128);
  });
  it('Hargeisa (Somaliland) s’allume avec la Somalie', () => {
    expect(sample(byCca3(all, 'SOM'), [44.06, 9.56]).r).toBeGreaterThan(128);
  });
});
```

`__tests__/data/antimeridian.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { beaconReadable, byCca3, loadCountries, sample } from './helpers';

const all = loadCountries();

describe('pays à cheval sur l’antiméridien', () => {
  it.each([['FJI', 5], ['KIR', 15], ['RUS', 45]] as const)('%s : calotte < %s°', (cca3, maxDeg) => {
    expect(byCca3(all, cca3).cap.radiusDeg).toBeLessThan(maxDeg);
  });

  it.each([['FJI'], ['RUS']] as const)('%s : lisible au texel, balise dedans', (cca3) => {
    const c = byCca3(all, cca3);
    expect(beaconReadable(c)).toBe(true);
    expect(sample(c, c.beacon).r).toBeGreaterThan(128);
  });

  it('KIR : si ses atolls sont sous-texel, sa balise reste à moins d’un texel du pays', () => {
    const c = byCca3(all, 'KIR');
    // R ≥ 124 ⇔ distance signée ≥ −1 texel (128 − 127/32 ≈ 124).
    expect(sample(c, c.beacon).r).toBeGreaterThanOrEqual(beaconReadable(c) ? 129 : 124);
  });
});
```

`__tests__/data/kosovo.test.ts` :

```ts
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUT_DIR } from '../../paths';
import { beaconReadable, byCca3, loadCountries, sample } from './helpers';

describe('Kosovo à travers mledoze, Natural Earth, geoBoundaries et Wikidata', () => {
  const k = byCca3(loadCountries(), 'UNK');
  it('a une capitale, un drapeau et une balise dans son patch', () => {
    expect(k.capital.trim()).not.toBe('');
    expect(existsSync(path.join(OUT_DIR, k.flag))).toBe(true);
    expect(beaconReadable(k)).toBe(true);
    expect(sample(k, k.beacon).r).toBeGreaterThan(128);
  });
});
```

- [ ] **Step 9 : Lancer les contrôles de données**

Run: `cd web && npm run test:data`
Expected : PASS sur les 5 fichiers. Un échec n'est **jamais** « corrigé » en assouplissant le test : il désigne un défaut de donnée à comprendre (jointure, enroulement, fusion, projection). En particulier, si `KIR` échoue sur la calotte, vérifier dans `rapport-geodata.md` les polygones écartés par la règle des 25° avant toute autre hypothèse.

- [ ] **Step 10 : Relire le rapport**

Ouvrir `web/scripts/geodata/rapport-geodata.md` **en entier** et vérifier : la liste « Centres de calotte hors du pays » est cohérente avec la mesure du 02/10 (≈ 41 pays : archipels et pays en croissant comme `CHN`, `HRV`, `VNM`) ; la colonne « contour » montre `geoboundaries` pour les micro-États (`MCO`, `SMR`, `VAT`, `LIE`) ; les notes de refus de licence sont comprises.

- [ ] **Step 11 : Vérification complète**

Run: `cd web && npm run check && npm run test:data`
Expected : tout passe.

- [ ] **Step 12 : Commit**

```bash
git add web/scripts/geodata/lib/report.ts web/scripts/geodata/build.ts web/scripts/geodata/__tests__ \
  web/scripts/geodata/rapport-geodata.md web/scripts/geodata/overrides.json web/public/data
git commit -m "geodata : génération des 197 pays (countries.json, frontières, drapeaux, patchs SDF) et contrôles"
```

---

## Feuille de route des phases suivantes (plans à écrire après la phase 0)

Chaque phase aura son propre plan, rédigé quand la précédente aura livré, parce qu'il dépend de ses résultats.

| Phase | Contenu (spec) | Entrée requise |
|---|---|---|
| **1 — Rendu et caméra** | §4 et §5 : `WebGPURenderer` + repli, matériau Terre en couches, lecture du patch SDF dans le shader (même projection que `makeProjector`), lignes de frontières, balises, `CameraDirector` (`slerp` + profil van Wijk, formule de cadrage, calibration de `k`), patchs **image** Sentinel-2 (documentation EOX lue d'abord) | `public/data/` de la phase 0 ; décisions §10.2 (lignes épaisses) et §10.3 (KTX2) prises sur prototype |
| **2 — Jeu, interface, intro, PWA** | §6 : machine d'états, tirage progressif, HUD cartoon mobile d'abord, intro three.js, compte à rebours en scène, `vite-plugin-pwa`, file hors ligne | phase 1 (globe et `flyTo`) |
| **3 — Scores et déploiement** | §7 et §8 (parties API, Helm, CI arm64) : service Fastify + PostgreSQL, chart Helm (`.101`/`.102`), NetworkPolicies, secret Vault, sauvegarde Garage | phase 2 (format d'envoi des scores) ; lecture de `garage-s3.md` |
