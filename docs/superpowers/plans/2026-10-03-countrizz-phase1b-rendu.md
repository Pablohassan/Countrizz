# Countrizz — Phase 1B : rendu complet (imagerie Sentinel-2, nuages, post-traitement, régression visuelle) · plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le globe de la phase 1A prend son apparence finale — Terre de jour Sentinel-2 2025, patch image net du pays visé, nuages qui s'effacent à l'arrivée, bloom et TRAA, soleil et halo, résolution dynamique — et cette apparence est figée par six plans de référence et un budget de premier chargement mesuré.

**Architecture:** Un nouveau pipeline Node (`scripts/imagery/`) interroge le WMS d'EOX (requêtes ≤ 4096 px, coupées à l'antiméridien, mises en cache) : il fournit la texture de jour mondiale au pipeline de textures existant, et produit un patch image KTX2 par pays dans le cadre azimutal du contrat `PatchMeta`, avec le masque d'eau en alpha. Les patchs image sont **hors dépôt** ; seul leur index (`public/data/imagery.json`) est versionné. Côté rendu, tout reste dans le matériau TSL de la Terre (patch image, nuages) ; un `RenderPipeline` (bloom sur l'émissif, TRAA en « haute », MSAA en « standard ») remplace le rendu direct de R3F ; la sonde (`probe.html`) rend les mêmes effets pour les contrôles Playwright.

**Tech Stack:** three 0.186.1 (`three/webgpu`, `three/tsl`, addons `BloomNode`, `TRAANode`, `KTX2Loader`), @react-three/fiber 9.8.1, React 19.3.0, TypeScript 5.9.3, Vite 8.3.2, Vitest 5.0.3, @playwright/test 1.63.0, sharp 0.35.5, d3-geo 3.1.1, toktx 4.4.2 (KTX-Software, sur le poste, pas en CI). Aucune nouvelle dépendance npm.

**Spec:** `docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md` (§4 rendu, §6.6 performance mobile, §8 tests, §9 licences, §10.5 budget) — **amendé à la Task 1** selon les décisions de l'utilisateur du 02/10 au soir. Contrat des patchs : `web/src/data/types.ts` (`PatchMeta`). Plan précédent : `docs/superpowers/plans/2026-10-02-countrizz-phase1a-globe-camera.md` (feuille de route 1B en fin de fichier).

## Global Constraints

- Versions **inchangées** (`package-lock.json` non régénéré) : three 0.186.1, @react-three/fiber 9.8.1, @playwright/test 1.63.0, sharp 0.35.5, d3-geo 3.1.1 ; Node ≥ 24 ; toktx 4.4.x sur le poste.
- Imagerie : **EOxCloudless 2025**, couche WMS `s2cloudless-2025` de `https://tiles.maps.eox.at/wms`, GetMap WMS 1.1.1 en `EPSG:4326`, **4096 px au plus par requête** (assemblage permis), sans clé ; licence **CC BY-NC-SA 4.0** (jeu non commercial) ; attribution **mot pour mot**, visible près de l'image : « EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025) » (conditions lues le 02/10 sur https://cloudless.eox.at/license-non-commercial et /documentation/license).
- Le service sert du **PNG** au lieu du JPEG demandé dès qu'un bord est partiellement transparent (constaté à 180°) et peut répondre une erreur XML avec un code 200 : seule la signature de l'image fait foi.
- Patch image : même projection que le patch SDF (contrat de `PatchMeta` : azimutale équidistante, ligne 0 au nord, **sans** `--lower_left_maps_to_s0t0`, en-tête `KTXorientation = rd`) ; ETC1S sRGB avec mipmaps ; **alpha = mer (255) / terre (0)** ; 2048 texels en « haute », 1024 en « standard ».
- Fichiers **hors dépôt** (ignorés par git) : `web/public/data/patches/img/`, `web/scripts/imagery/.cache/`. **Versionnés** : `web/public/data/imagery.json`, les rapports de génération, les textures globales.
- Le build et le jeu n'appellent **aucune API** ; seuls `npm run textures:fetch` et `npm run imagery` touchent le réseau (EOX, NASA).
- La sortie reste **neutre** (`NoToneMapping`, prop `flat` de R3F) : le jaune `#ffee03` du pays reste exact ; le bloom ne lit que l'émissif.
- Toute nouvelle couche de rendu vit **dans le matériau de la Terre** ou dans un matériau qui alimente correctement la cible `emissive` du rendu multiple : une coque transparente au-dessus du globe écrase cette cible et éteint le bloom (constaté, voir le prototype).
- Headless : mêmes options Chromium que la 1A (`CHROME_ARGS` de `playwright.config.ts`, `--use-vulkan=swiftshader` compris) ; SwiftShader rend le **jeu complet à moins d'une image par seconde** : les tests de `GlobeView` attendent des états (`window.__demo`, `window.__globe`), jamais des durées, et sont marqués `test.slow` en CI quand il le faut.
- Règles du poste (hooks) : `grep`, `rg`, et `awk`/`sed` filtrant par motif sont **bloqués** — lire les fichiers en entier ou par plages ; toute API tierce exige la lecture de sa documentation dans la même session ; recopier les nombres exacts des sorties.

## Review Focus

1. **Patchs image près de l'antiméridien et des pôles** (Fidji, Kiribati, Russie, Norvège) — la mosaïque se recolle sans colonne vide, le cadre qui contient un pôle prend toutes les longitudes, aucune couture à l'écran. Tests : Task 1 (`grid.test.ts`, coupes à ±180°), Task 3 (`patchImage.test.ts`, « franchit l'antiméridien », « un pôle dans le cadre »), génération complète des 197 pays (Task 3, étape 8).
2. **Patch image absent, en échec ou lent** (fichiers hors dépôt, absents en CI) — la texture globale reste, aucune erreur, la manche continue ; un patch arrivé en retard apparaît en fondu. Tests : Task 4 (`controller.test.ts`, `image-patch.spec.ts` « absent (404) »).
3. **Perte du GPU avec le post-traitement** — le `RenderPipeline` est recréé avec le renderer, la révélation survit. Test : Task 7 (relance de `flight.spec.ts`, perte du GPU sur les deux backends).
4. **MSAA et dérivées d'écran** — sous MSAA en WebGL 2, `fwidth` devient aberrant sur certains anneaux du maillage : un trait de la couleur du pays traversait l'Irlande (défaut présent dans le jeu 1A, canvas MSAA). Test : Task 7 (`msaa-edge.spec.ts`).
5. **Onglet caché, mouvement réduit, téléphone lent** — plus aucune frame onglet caché ; nuages sans dérive en mouvement réduit ; densité de pixels qui baisse puis remonte. Tests : Task 9 (`dynamic-resolution.spec.ts`, `dynamicResolution.test.ts`), Task 6 (dérive nulle en mouvement réduit, `GlobeView`).

---

## Décisions de l'utilisateur (02/10/2026, au soir) et amendements du spec

| Sujet | Décision | Constat qui l'a motivée |
|---|---|---|
| Millésime EOX | **2025**, CC BY-NC-SA 4.0 | 2017 (CC BY, d'abord retenu comme « plus récent CC BY ») ne couvre **que l'Europe** ; 2016, seul CC BY mondial, a des bandes nuageuses (Irlande, Chine du Nord) et des halos côtiers ; 2024 et 2025 sont propres partout. |
| Rôle de Sentinel-2 | **Texture de jour mondiale + patchs image** | Au cadrage « B » (k 1, m 3, θ_min 3°), la texture globale 8K n'est grossie qu'au plus ×1,73 à l'arrivée (bureau, densité 1) mais ×3,47 en densité 2 et ×3,77 sur téléphone en 4K ; un patch Sentinel-2 posé sur Blue Marble laissait une couture (maquette). |
| Hébergement des patchs image | **Hors dépôt** : générés et mis en cache sur le poste, déposés sur Garage au déploiement (phase 3) | 197 pays : 140 335 406 octets en 2048 px et 21 665 916 en 1024 px (génération complète du 03/10). |

La Task 1 reporte ces décisions dans le spec (§1, §3.1, §4.2, §4.3, §9).

## Prototype des 02 et 03/10/2026 : ce qui est déjà prouvé

Tout le code de ce plan a tourné dans un bac à sable qui reproduit `web/` (scratchpad de la session) ; chaque mesure sur les **deux** backends.

| Point | Résultat |
|---|---|
| WMS EOX | GetMap `s2cloudless-2025`, 2 requêtes de 4096 × 4096 pour le monde en 8192 × 4096 (3 108 834 octets) ; 197 patchs en ≈ 1 h 20 sur le poste (≈ 300 requêtes, cache rejoué en quelques secondes). |
| Texture de jour | 8K ETC1S : 3 873 228 octets (Blue Marble : 2 527 997) ; 4K : 1 096 801. Groenland et Antarctique en blanc plat (absence de donnée) → glace de Blue Marble au-delà de 58–62°. `earth.spec.ts` inchangé passe : Sahara [176,127,86], Pacifique [41,54,74]. |
| Patch image | Emprise = vue d'arrivée : max(θ, θ_min) × m × 2,2, plafonnée à 30° (au-delà, 2048 texels ne sont plus plus fins que la 8K) : de 19,80° (92 pays au contexte minimal) à 30° (74 pays plafonnés). Orientation vérifiée par une fixture à quatre quadrants (NO [192,55,65], NE [44,154,62], SO [44,63,175], SE [150,141,52]) ; inversion nord-sud détectée (mutation). Fidji (antiméridien) et Norvège (pôle dans le cadre) sans couture. |
| Masque d'eau | Le masque 4K de la surface, agrandi ×7 au cadrage d'un petit pays, dessinait des côtes en escalier dans le reflet du soleil : l'alpha du patch le précise. |
| Nuages | `cloud_combined_8192.tif` (NASA, 35 870 468 octets) → 4K ETC1S linéaire : 1 283 240 octets. **Dans le matériau de la Terre** : une coque transparente (première version) écrasait la cible `emissive` et le bloom disparaissait (couronne de Paris 75 893 au lieu de 176 566) ; `material.mrtNode` rend le rendu direct WebGPU noir. |
| Post-traitement | `RenderPipeline` + `pass` + `mrt({ output, emissive [, velocity] })` + `bloom` + `traa` : aucune erreur sur les deux backends ; couronne de 6 à 14 px autour de Paris la nuit : WebGPU haute 83 420 → 184 064, standard 75 919 → 176 566, WebGL 2 standard 75 916 → 176 554. `pass(scene, camera, { samples: 4 })` accepté par les deux backends. |
| Soleil | Sprite additif à 40 rayons, `emissiveNode` (lu par tout matériau nœud) : disque [255,255,255] au-dessus du limbe, halo 5 → 134 avec le bloom ; caché par la Terre (mutation sans test de profondeur détectée). |
| Résolution dynamique | Médiane par fenêtre de 30 frames ; en headless, SwiftShader rend le jeu à 0,3–1 image/s (même avant le post-traitement) : l'e2e vérifie le branchement en densité 1. |
| Régression visuelle | 24 références (6 plans × 2 backends × téléphone/bureau), 5,5 Mo pour macOS ; stables sur 3 passes (72/72) avec une tolérance de 20 pixels, qui voit un trait d'un pixel sur 100. |
| Budget | Build de production servi par `vite preview`, niveau « standard », jusqu'à l'arrivée sur le premier pays : **6 512 996 octets** (texte compté gzip). |

**Pièges trouvés au prototype (à ne pas refaire) :**
- Une coque transparente dessinée après la Terre **écrase la cible `emissive`** du rendu multiple (le mélange s'applique à chaque cible) : le bloom des villes disparaît. `material.mrtNode` n'est pas la parade : sans rendu multiple, le matériau sort sa seule sortie MRT et l'image WebGPU est noire.
- `emissiveNode` n'est déclaré par `@types/three` que sur les matériaux éclairés, mais `NodeMaterial.setupLighting` le lit sur **tout** matériau nœud (sprite compris) : cast documenté.
- Deux `Sprite` partagent la géométrie statique de three : un `dispose` qui parcourt la scène la libère deux fois.
- Sous MSAA en WebGL 2, `fwidth` est aberrant sur certains anneaux du maillage : borner l'empreinte du pixel (au-delà de `rangeTexels`, bord net).
- Dans le shell du poste (zsh), une variable non citée n'est pas découpée en mots (`for c in "a b"; do set -- $c` ne sépare rien) : écrire ces boucles en Node.
- Docker sur le poste est **arm64** ; la CI est x86_64 : les références visuelles Linux se génèrent **sur le runner de la CI** (workflow manuel, Task 10).

## Points à trancher avec l'utilisateur au cours de ce plan

1. **Budget du premier chargement** (Task 10) : le plan fixe **8 000 000 octets** au niveau « standard » (mesuré : 6 512 996). À confirmer.
2. **Rendu de nuit et intensité du bloom** (Task 7, Task 10) : le bloom sur l'émissif (force 1,2, rayon 0,4, seuil 0) voile toute la face de nuit d'une lueur mauve ; les six plans de référence sont montrés à l'utilisateur avant d'être commités (Task 10, étape 4) — réglage à revoir alors s'il le souhaite.
3. **Saturation de Sentinel-2** : le Sahara est nettement plus rouge qu'avec Blue Marble (planche du 02/10) ; rien n'est retouché sans son avis.

## Arborescence produite par ce plan

```
web/
├─ playwright.budget.config.ts · e2e-budget/first-load.spec.ts     budget du premier chargement (build + vite preview)
├─ e2e/   image-patch · image-flight · credit · clouds · post · msaa-edge · sun · dynamic-resolution · visual .spec.ts
│         fixtures/make-quadrants.mjs + quadrants.ktx2 (versionnée) · visual.spec.ts-snapshots/ (références darwin et linux)
├─ scripts/
│  ├─ imagery/                                  pipeline EOX → texture de jour et patchs image
│  │  ├─ config.ts · paths.ts · build-patches.ts · rapport-imagerie.md
│  │  ├─ lib/  grid · wms · mosaic · patchImage
│  │  └─ __tests__/ unit/ (grid, mosaic, patchImage) · data/ (imagery)
│  └─ textures/   lib/polarFill.ts (+ test) ; config, fetch, build étendus (jour Sentinel-2, nuages)
├─ public/
│  ├─ textures/   day-8k · day-4k (Sentinel-2) · clouds-4k (.ktx2), credits.json (5 couches)
│  └─ data/       imagery.json (versionné) · patches/img/ (HORS dépôt)
└─ src/
   ├─ data/imagery.ts                           contrat de imagery.json
   └─ globe/  frameNodes · imageLayer · imagePatch · clouds · credits.tsx · postprocessing · sunDisc · dynamicResolution
              (+ tests) ; earth, globe, controller, countryLayer, textures, GlobeView, probe étendus
.github/workflows/visual-baselines.yml          références visuelles Linux (déclenchement manuel)
```

Exécution : sur une branche `phase1b-rendu` créée depuis `newcountri` (qui porte la 1A, `1099e7a`). Toutes les commandes se lancent depuis `web/` sauf mention contraire.

**Prérequis :** toktx 4.4.x ; les caches `web/scripts/geodata/.cache/` (Natural Earth) et `web/scripts/textures/.cache/` (sources NASA, dont `clouds-8192.tif` déjà téléchargé le 02/10) présents ; accès réseau à `tiles.maps.eox.at`. La génération complète des patchs image (Task 3) prend ≈ 1 h 20 ; si le cache du prototype existe encore (`<scratchpad>/plan1b/web/scripts/imagery/.cache`), le copier dans `web/scripts/imagery/.cache` la réduit à quelques minutes.

**Vérification du plan lui-même (03/10) :** un script a lu ce document, appliqué ses blocs « Créer » et « Modifier » dans l'ordre sur une copie de `1099e7a`, vérifié `tsc` et les tests unitaires à la fin de **chaque** tâche, puis comparé le résultat au bac à sable : 141 opérations (40 créations, 101 modifications), `tsc` et tests unitaires verts à la fin de chacune des 10 tâches (148, 152, 159, 163, 164, 166, 168, 168, 173 et 173 tests), 561 fichiers identiques au bac à sable (0 écart). Sur ce résultat, avec les sorties générées : `npm run test:data` → 56 passed, `npm run e2e` → 483 passed (11,6 min), `npm run budget` → 6 512 996 octets.

---
### Task 1 : Spec amendé ; imagerie EOX — grille, requêtes WMS, mosaïque en cache

**Files:**
- Modify: `docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md` (§0 statut, §1, §3.1, §4.2, §4.3, §9), `.gitignore`, `web/vitest.config.ts`
- Create: `web/scripts/imagery/config.ts`, `web/scripts/imagery/paths.ts`, `web/scripts/imagery/lib/grid.ts`, `web/scripts/imagery/lib/wms.ts`, `web/scripts/imagery/lib/mosaic.ts`
- Test: `web/scripts/imagery/__tests__/unit/grid.test.ts`, `web/scripts/imagery/__tests__/unit/mosaic.test.ts`

**Interfaces:**
- Consumes: `fetchBytes(url): Promise<Uint8Array>`, `sha256(buf): string` (`scripts/geodata/lib/http.ts`) ; `writeBytes(path, bytes)` (`scripts/geodata/lib/io.ts`).
- Produces: `interface GeoBox { west; south; east; north }` (longitudes déroulables) ; `interface Grid extends GeoBox { step; width; height }` ; `snapGrid(box, maxStepDeg): Grid` (pas = 90/n) ; `interface WmsRequest { bbox: [w, s, e, n]; width; height; x; y }` ; `planRequests(grid, maxPx = 4096): WmsRequest[]` ; `interface WmsService { base; layer }` ; `getMapUrl(service, request): string` ; `isImage(bytes): boolean` ; `interface Mosaic { grid; rgb: Uint8Array }` ; `assemble(grid, tiles): Mosaic` ; `sampleBilinear(mosaic, lon, lat): [r, g, b]` ; `loadMosaic(grid, { service, cacheDir, maxPx?, offline? }): Promise<{ mosaic; tiles: FetchedTile[] }>` ; `interface FetchedTile { url; file; sha256; bytes }` ; `EOX = { service, year, maxPx, license, attribution }` ; `IMG_CACHE_DIR`.

La grille est calée sur la grille mondiale (pas de 90/n degrés) pour que ±90° et ±180° tombent sur des bords de pixels : une requête coupée à l'antiméridien se recolle sans demi-pixel. Les morceaux sont égaux au plus près (deux requêtes de 4096 pour le monde en 8192).

- [ ] **Step 1 : Reporter dans le spec les décisions de l'utilisateur du 02/10 au soir**

**Modifier** `docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md` — remplacer :

```md
- **Statut** : design validé section par section avec l'utilisateur ; ce document attend sa relecture avant le plan d'implémentation.
```

par :

```md
- **Statut** : design validé section par section avec l'utilisateur ; ce document attend sa relecture avant le plan d'implémentation.
- **Amendements** : 02/10 au soir, avant la phase 1B — imagerie (§1, §3.1, §4.2, §4.3, §9) : millésime EOX 2025, Sentinel-2 en texture de jour mondiale et en patchs image, patchs image hors dépôt (décisions de l'utilisateur).
```

**Modifier** `docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md` — remplacer :

```md
| Imagerie des patchs | **Sentinel-2 cloudless (EOX)** — le jeu reste **non commercial** |
```

par :

```md
| Imagerie | **Sentinel-2 cloudless (EOX), millésime 2025** : texture de jour mondiale **et** patchs image des pays ; le jeu reste **non commercial** ; patchs image **hors dépôt** (générés sur le poste, déposés sur Garage au déploiement) — amendé le 02/10 |
```

**Modifier** `docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md` — remplacer :

```md
| EOX Sentinel-2 cloudless | imagerie des patchs (10 m) | CC BY-NC-SA 4.0, non commercial (vérifiée) |
| NASA Blue Marble / Black Marble | textures globales jour / nuit | à confirmer au plan |
```

par :

```md
| EOX Sentinel-2 cloudless 2025 | texture de jour mondiale et patchs image | CC BY-NC-SA 4.0, non commercial (vérifiée le 02/10 ; 2017, dernier millésime CC BY, ne couvre que l'Europe ; 2016 a des bandes nuageuses) |
| NASA Blue Marble / Black Marble / nuages | glaces polaires du jour, nuit, relief, nuages | crédits NASA (plans 1A et 1B) |
```

**Modifier** `docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md` — remplacer :

```md
1. jour — Blue Marble ;
```

par :

```md
1. jour — Sentinel-2 cloudless 2025 (glaces polaires de Blue Marble, que Sentinel-2 rend en blanc plat), précisé par le patch image du pays visé (§4.3) ;
```

**Modifier** `docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md` — remplacer :

```md
| imagerie en gros plan | **patch image local** (Sentinel-2 cloudless) fondu sur la texture globale à l'intérieur de son emprise |
```

par :

```md
| imagerie en gros plan | **patch image local** (Sentinel-2 cloudless 2025) fondu sur la texture globale à l'intérieur de son emprise ; emprise = **la vue d'arrivée** (max(θ, θ_min) × m × 2,2, plafonnée à 30°), et non celle du patch SDF ; alpha = masque d'eau (amendé le 02/10) |
```

**Modifier** `docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md` — remplacer :

```md
- **Sentinel-2 cloudless** : attribution obligatoire, visible dans l'interface de la carte : « Data & Viewing Products: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data "year") ». Licence NC-SA : les patchs dérivés restent sous CC BY-NC-SA 4.0 ; **tout passage au commercial impose la licence payante EOX**.
```

par :

```md
- **Sentinel-2 cloudless** : attribution obligatoire, visible dans l'interface de la carte : « Data & Viewing Products: EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data "year") ». Licence NC-SA : les patchs dérivés restent sous CC BY-NC-SA 4.0 ; **tout passage au commercial impose la licence payante EOX**. Millésime retenu le 02/10 : **2025** (« … Copernicus Sentinel data 2025) »).
```

**Modifier** `.gitignore` — remplacer :

```gitignore
web/scripts/textures/.cache/
```

par :

```gitignore
web/scripts/textures/.cache/
web/scripts/imagery/.cache/
```

- [ ] **Step 2 : Écrire les tests qui échouent**

**Créer** `web/scripts/imagery/__tests__/unit/grid.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { planRequests, snapGrid } from '../../lib/grid';

describe('grille plate carrée calée sur la grille mondiale', () => {
  it('le pas divise 90° : ±90° et ±180° tombent sur des bords de pixels', () => {
    const g = snapGrid({ west: -10.3, south: 40.2, east: 15.7, north: 52.9 }, 0.031);
    expect(90 / g.step).toBe(Math.round(90 / g.step));
    expect(g.step).toBeLessThanOrEqual(0.031);
    expect(g.west).toBeLessThanOrEqual(-10.3);
    expect(g.east).toBeGreaterThanOrEqual(15.7);
    expect(g.width).toBe(Math.round((g.east - g.west) / g.step));
    expect(g.height).toBe(Math.round((g.north - g.south) / g.step));
  });
  it('borne la latitude à ±90°', () => {
    const g = snapGrid({ west: -180, south: -95, east: 180, north: 95 }, 360 / 8192);
    expect([g.south, g.north, g.width, g.height]).toEqual([-90, 90, 8192, 4096]);
  });
});

describe('requêtes WMS ≤ 4096 px', () => {
  it('le monde en 8192 × 4096 : deux requêtes côte à côte, sans coupe à l’antiméridien', () => {
    const r = planRequests(snapGrid({ west: -180, south: -90, east: 180, north: 90 }, 360 / 8192));
    expect(r.map((q) => [q.bbox, q.width, q.height, q.x, q.y])).toEqual([
      [[-180, -90, 0, 90], 4096, 4096, 0, 0],
      [[0, -90, 180, 90], 4096, 4096, 4096, 0],
    ]);
  });
  it('une petite emprise : une seule requête, la boîte calée', () => {
    const g = snapGrid({ west: 5.7, south: 49.4, east: 6.6, north: 50.2 }, 0.01);
    const [q, ...rest] = planRequests(g);
    expect(rest).toEqual([]);
    expect(q).toEqual({ bbox: [g.west, g.south, g.east, g.north], width: g.width, height: g.height, x: 0, y: 0 });
  });
  it('coupe à l’antiméridien et ramène les longitudes dans [−180, 180]', () => {
    const g = snapGrid({ west: 170, south: -20, east: 190, north: -10 }, 0.5);
    const r = planRequests(g);
    expect(r.map((q) => [q.bbox, q.x, q.width])).toEqual([
      [[170, -20, 180, -10], 0, 20],
      [[-180, -20, -170, -10], 20, 20],
    ]);
  });
  it('coupe aussi à −180° (emprise déroulée vers l’ouest)', () => {
    const r = planRequests(snapGrid({ west: -190, south: 0, east: -170, north: 10 }, 0.5));
    expect(r.map((q) => q.bbox)).toEqual([[170, 0, 180, 10], [-180, 0, -170, 10]]);
  });
  it('découpe en colonnes et en lignes de taille égale au plus près, sans trou ni recouvrement', () => {
    const g = snapGrid({ west: -100, south: -60, east: 100, north: 60 }, 0.02);
    const r = planRequests(g);
    expect(r.every((q) => q.width <= 4096 && q.height <= 4096)).toBe(true);
    const cells = new Set<string>();
    let area = 0;
    for (const q of r) { area += q.width * q.height; cells.add(`${q.x},${q.y}`); }
    expect(area).toBe(g.width * g.height);
    expect(cells.size).toBe(r.length);
  });
});
```

**Créer** `web/scripts/imagery/__tests__/unit/mosaic.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { snapGrid } from '../../lib/grid';
import { assemble, sampleBilinear } from '../../lib/mosaic';
import { getMapUrl, isImage } from '../../lib/wms';

describe('requête GetMap (WMS 1.1.1, EPSG:4326)', () => {
  it('écrit la boîte en lon/lat, la taille et le format JPEG', () => {
    const url = getMapUrl({ base: 'https://tiles.maps.eox.at/wms', layer: 's2cloudless-2025' },
      { bbox: [-180, -90, 0, 90], width: 4096, height: 4096, x: 0, y: 0 });
    expect(url).toBe('https://tiles.maps.eox.at/wms?service=WMS&version=1.1.1&request=GetMap&layers=s2cloudless-2025&styles=&srs=EPSG:4326'
      + '&bbox=-180,-90,0,90&width=4096&height=4096&format=image/jpeg');
  });
  it('n’écrit jamais de notation exponentielle ni de bruit flottant', () => {
    const url = getMapUrl({ base: 'b', layer: 'l' }, { bbox: [0.1 + 0.2, 1e-7, 6.6000000000000005, 50.2], width: 1, height: 1, x: 0, y: 0 });
    expect(url).toContain('&bbox=0.3,0.0000001,6.6,50.2&');
  });
  it('accepte un JPEG, ou un PNG (servi dès qu’un bord est transparent, ex. à 180°), refuse une erreur XML servie en 200', () => {
    expect(isImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(isImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(isImage(new TextEncoder().encode('<?xml version="1.0"?><ServiceExceptionReport>'))).toBe(false);
  });
});

describe('mosaïque plate carrée', () => {
  // grille de 4 × 2 pixels de 45° : ouest −180, nord 90
  const g = snapGrid({ west: -180, south: -90, east: 0, north: 90 }, 45);
  const tile = (rgb: number[]) => new Uint8Array(Array.from({ length: 2 * 2 }, () => rgb).flat());

  it('place chaque requête à sa colonne et à sa ligne', () => {
    const m = assemble(g, [
      { request: { bbox: [-90, -90, 0, 90], width: 2, height: 2, x: 2, y: 0 }, rgb: tile([0, 0, 255]) },
      { request: { bbox: [-180, -90, -90, 90], width: 2, height: 2, x: 0, y: 0 }, rgb: tile([255, 0, 0]) },
    ]);
    expect([g.width, g.height]).toEqual([4, 4]);
    expect([...m.rgb.subarray(0, 3)]).toEqual([255, 0, 0]);
    expect([...m.rgb.subarray(3 * 3, 3 * 4)]).toEqual([0, 0, 255]);
  });

  it('échantillonne en bilinéaire aux centres de pixels, et déroule la longitude', () => {
    const grid = snapGrid({ west: 170, south: 0, east: 190, north: 10 }, 10); // 2 × 1 pixels : [170, 180] puis [180, 190]
    const m = { grid, rgb: new Uint8Array([0, 0, 0, 200, 100, 50]) };
    expect(sampleBilinear(m, 175, 5)).toEqual([0, 0, 0]);
    expect(sampleBilinear(m, -175, 5)).toEqual([200, 100, 50]); // −175° = 185° dans la grille déroulée
    expect(sampleBilinear(m, 180, 5)).toEqual([100, 50, 25]);
  });

  it('refuse une requête dont l’image n’a pas la taille demandée', () => {
    expect(() => assemble(g, [{ request: { bbox: [-180, -90, -90, 90], width: 2, height: 2, x: 0, y: 0 }, rgb: new Uint8Array(3) }])).toThrow(/taille/);
  });
});
```

**Modifier** `web/vitest.config.ts` — remplacer :

```ts
          include: ['src/**/*.test.ts', 'scripts/geodata/__tests__/unit/**/*.test.ts', 'scripts/textures/__tests__/unit/**/*.test.ts'],
```

par :

```ts
          include: ['src/**/*.test.ts', 'scripts/geodata/__tests__/unit/**/*.test.ts', 'scripts/textures/__tests__/unit/**/*.test.ts', 'scripts/imagery/__tests__/unit/**/*.test.ts'],
```

**Modifier** `web/vitest.config.ts` — remplacer :

```ts
          include: ['scripts/geodata/__tests__/data/**/*.test.ts', 'scripts/textures/__tests__/data/**/*.test.ts'],
```

par :

```ts
          include: ['scripts/geodata/__tests__/data/**/*.test.ts', 'scripts/textures/__tests__/data/**/*.test.ts', 'scripts/imagery/__tests__/data/**/*.test.ts'],
```

- [ ] **Step 3 : Lancer les tests pour les voir échouer**

Run: `npx vitest run --project unit scripts/imagery`
Expected: FAIL — `Test Files  2 failed (2)`, modules `../../lib/grid`, `../../lib/mosaic`, `../../lib/wms` introuvables.

- [ ] **Step 4 : Écrire la configuration, les chemins et la bibliothèque**

**Créer** `web/scripts/imagery/config.ts` :

```ts
/**
 * EOxCloudless (EOX IT Services GmbH), choisi par l'utilisateur le 02/10/2026 : millésime 2025, mondial et sans défaut
 * visible (2016, seul CC BY mondial, a des bandes nuageuses ; 2017 ne couvre que l'Europe). Conditions lues le 02/10 sur
 * https://cloudless.eox.at/license-non-commercial et /documentation/license : usage non commercial sous CC BY-NC-SA 4.0,
 * attribution visible près de l'image, requêtes de 4096 px au plus (assemblage permis), service sans clé.
 */
export const EOX = {
  service: { base: 'https://tiles.maps.eox.at/wms', layer: 's2cloudless-2025' },
  year: 2025,
  maxPx: 4096,
  license: 'CC BY-NC-SA 4.0',
  attribution: 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
} as const;
```

**Créer** `web/scripts/imagery/paths.ts` :

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** Réponses WMS en cache (non versionnées), partagées par la texture globale et les patchs image. */
export const IMG_CACHE_DIR = path.join(here, '.cache');
```

**Créer** `web/scripts/imagery/lib/grid.ts` :

```ts
/** Boîte géographique (degrés) ; `west` et `east` peuvent sortir de [−180, 180] (longitudes déroulées autour d'un centre). */
export interface GeoBox { west: number; south: number; east: number; north: number }

/**
 * Grille plate carrée calée sur la grille mondiale : le pas vaut 90 / n degrés, de sorte que ±90° et ±180° tombent
 * sur des bords de pixels (les requêtes coupées à l'antiméridien se recollent sans demi-pixel).
 */
export interface Grid extends GeoBox { step: number; width: number; height: number }

export function snapGrid(box: GeoBox, maxStepDeg: number): Grid {
  const step = 90 / Math.ceil(90 / maxStepDeg);
  const i0 = Math.floor(box.west / step + 1e-9), i1 = Math.ceil(box.east / step - 1e-9);
  const j0 = Math.max(-90 / step, Math.floor(box.south / step + 1e-9)), j1 = Math.min(90 / step, Math.ceil(box.north / step - 1e-9));
  return { west: i0 * step, east: i1 * step, south: j0 * step, north: j1 * step, step, width: i1 - i0, height: j1 - j0 };
}

/** Une requête GetMap : boîte en longitudes de [−180, 180], taille, et place (x, y) dans la mosaïque. */
export interface WmsRequest { bbox: [number, number, number, number]; width: number; height: number; x: number; y: number }

/** Découpe la grille en requêtes de `maxPx` au plus (colonnes et lignes égales au plus près), coupées à l'antiméridien. */
export function planRequests(g: Grid, maxPx = 4096): WmsRequest[] {
  const i0 = Math.round(g.west / g.step), j1 = Math.round(g.north / g.step), half = Math.round(180 / g.step);
  const split = (n: number) => {
    const parts = Math.ceil(n / maxPx);
    return Array.from({ length: parts + 1 }, (_, k) => Math.round((k * n) / parts));
  };
  const xs = new Set(split(g.width));
  // antiméridien : colonne globale i telle que i · pas = 180 + 360 k
  for (let x = 1; x < g.width; x++) if ((((i0 + x - half) % (2 * half)) + 2 * half) % (2 * half) === 0) xs.add(x);
  const cols = [...xs].sort((a, b) => a - b), rows = split(g.height);
  const out: WmsRequest[] = [];
  for (let r = 0; r + 1 < rows.length; r++) {
    const ya = rows[r]!, yb = rows[r + 1]!;
    const north = (j1 - ya) * g.step, south = (j1 - yb) * g.step;
    for (let c = 0; c + 1 < cols.length; c++) {
      const xa = cols[c]!, xb = cols[c + 1]!;
      const west = (i0 + xa) * g.step, east = (i0 + xb) * g.step;
      const shift = 360 * Math.floor((west + 180) / 360);
      out.push({ bbox: [west - shift, south, east - shift, north], width: xb - xa, height: yb - ya, x: xa, y: ya });
    }
  }
  return out;
}
```

**Créer** `web/scripts/imagery/lib/wms.ts` :

```ts
import type { WmsRequest } from './grid';

export interface WmsService { base: string; layer: string }

/** Nombre décimal court, sans notation exponentielle ni bruit flottant (9 décimales suffisent : 0,1 mm). */
const num = (v: number) => {
  const s = v.toFixed(9).replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
};

/** GetMap WMS 1.1.1 en EPSG:4326 : la boîte s'écrit ouest, sud, est, nord (documentation EOX, lue le 02/10/2026). */
export function getMapUrl(s: WmsService, r: WmsRequest): string {
  return `${s.base}?service=WMS&version=1.1.1&request=GetMap&layers=${s.layer}&styles=&srs=EPSG:4326`
    + `&bbox=${r.bbox.map(num).join(',')}&width=${r.width}&height=${r.height}&format=image/jpeg`;
}

/**
 * Le service répond parfois une erreur XML avec un code 200 : seule la signature de l'image fait foi. Il sert du PNG (RVBA)
 * au lieu du JPEG demandé dès qu'un bord est partiellement transparent (dernière colonne à 180°, alpha 241, couleur juste :
 * constaté le 02/10) ; l'alpha est ignoré.
 */
export const isImage = (b: Uint8Array): boolean =>
  (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47);
```

**Créer** `web/scripts/imagery/lib/mosaic.ts` :

```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { fetchBytes, sha256 } from '../../geodata/lib/http';
import { writeBytes } from '../../geodata/lib/io';
import { planRequests, type Grid, type WmsRequest } from './grid';
import { getMapUrl, isImage, type WmsService } from './wms';

/** Image RVB d'une grille plate carrée : pixel (x, y) = colonne x depuis `west`, ligne y depuis `north`. */
export interface Mosaic { grid: Grid; rgb: Uint8Array }

export function assemble(grid: Grid, tiles: { request: WmsRequest; rgb: Uint8Array }[]): Mosaic {
  const rgb = new Uint8Array(grid.width * grid.height * 3);
  for (const { request: r, rgb: t } of tiles) {
    if (t.length !== r.width * r.height * 3) throw new Error(`image de ${t.length / 3} pixels au lieu de ${r.width} × ${r.height} : taille inattendue`);
    for (let y = 0; y < r.height; y++) rgb.set(t.subarray(y * r.width * 3, (y + 1) * r.width * 3), ((r.y + y) * grid.width + r.x) * 3);
  }
  return { grid, rgb };
}

/** Bilinéaire aux centres de pixels ; la longitude est déroulée dans [west, west + 360[, les bords sont prolongés. */
export function sampleBilinear(m: Mosaic, lon: number, lat: number): [number, number, number] {
  const g = m.grid;
  let l = lon;
  while (l < g.west) l += 360;
  while (l >= g.west + 360) l -= 360;
  const fx = Math.min(g.width - 1, Math.max(0, (l - g.west) / g.step - 0.5));
  const fy = Math.min(g.height - 1, Math.max(0, (g.north - lat) / g.step - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(g.width - 1, x0 + 1), y1 = Math.min(g.height - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const at = (x: number, y: number, k: number) => m.rgb[(y * g.width + x) * 3 + k]!;
  const out: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    out[k] = Math.round((at(x0, y0, k) * (1 - tx) + at(x1, y0, k) * tx) * (1 - ty) + (at(x0, y1, k) * (1 - tx) + at(x1, y1, k) * tx) * ty);
  }
  return out;
}

export interface FetchedTile { url: string; file: string; sha256: string; bytes: number }

/**
 * Mosaïque d'une grille : une requête GetMap par morceau (≤ 4096 px, coupée à l'antiméridien), chacune mise en cache
 * sous l'empreinte de son URL. `offline` interdit le réseau (construction : tout doit déjà être en cache).
 */
export async function loadMosaic(grid: Grid, o: { service: WmsService; cacheDir: string; maxPx?: number; offline?: boolean }): Promise<{ mosaic: Mosaic; tiles: FetchedTile[] }> {
  const tiles: { request: WmsRequest; rgb: Uint8Array }[] = [];
  const fetched: FetchedTile[] = [];
  for (const request of planRequests(grid, o.maxPx ?? 4096)) {
    const url = getMapUrl(o.service, request);
    const file = path.join(o.cacheDir, `${sha256(new TextEncoder().encode(url)).slice(0, 24)}.img`);
    let bytes: Uint8Array;
    if (existsSync(file)) bytes = readFileSync(file);
    else {
      if (o.offline) throw new Error(`absent du cache (lancer d'abord la récupération) : ${url}`);
      bytes = await fetchBytes(url);
      if (!isImage(bytes)) throw new Error(`réponse qui n'est pas une image pour ${url} : ${new TextDecoder().decode(bytes.subarray(0, 300))}`);
      writeBytes(file, bytes);
    }
    const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== request.width || info.height !== request.height) throw new Error(`${url} : ${info.width} × ${info.height} reçu`);
    tiles.push({ request, rgb: new Uint8Array(data.buffer, data.byteOffset, data.length) });
    fetched.push({ url, file: path.basename(file), sha256: sha256(bytes), bytes: bytes.length });
  }
  return { mosaic: assemble(grid, tiles), tiles: fetched };
}
```

- [ ] **Step 5 : Relancer les tests**

Run: `npx vitest run --project unit scripts/imagery`
Expected: PASS — `Tests  13 passed (13)`.

- [ ] **Step 6 : Vérification complète**

Run: `npm run check`
Expected: `tsc` sans erreur ; `Tests  148 passed (148)` (135 + 13).

- [ ] **Step 7 : Commit**

```bash
git add ../.gitignore ../docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md vitest.config.ts scripts/imagery
git commit -m "imagerie : spec amendé (EOX 2025) ; grille calée, requêtes WMS ≤ 4096 px coupées à l'antiméridien, mosaïque en cache"
```

---
### Task 2 : Texture de jour Sentinel-2 2025 (glaces polaires de Blue Marble)

**Files:**
- Create: `web/scripts/textures/lib/polarFill.ts`
- Modify: `web/scripts/textures/config.ts`, `web/scripts/textures/fetch-textures.ts`, `web/scripts/textures/build-textures.ts`
- Test: `web/scripts/textures/__tests__/unit/polarFill.test.ts`, `web/scripts/textures/__tests__/data/textures.test.ts`
- Sorties régénérées (versionnées) : `web/public/textures/day-8k.ktx2`, `day-4k.ktx2`, `credits.json`, `web/scripts/textures/textures.lock.json`, `web/scripts/textures/rapport-textures.md`

**Interfaces:**
- Consumes: Task 1 — `EOX`, `snapGrid`, `loadMosaic` (option `offline` à la construction), `IMG_CACHE_DIR`.
- Produces: `DAY_S2 = { box, maxStepDeg: 360 / 8192 }` ; `POLAR = { fromLat: 58, toLat: 62, whiteFrom: 240, whiteTo: 252 }` ; `polarFill(s2, bm, width, height): Uint8Array` ; entrée `s2day` du verrou des textures (tuiles WMS, empreintes) ; crédit « jour » = attribution EOX + Blue Marble pour les glaces.

Sentinel-2 rend le Groenland et l'Antarctique en blanc plat (255 sur les trois canaux : absence de donnée) ; la neige des montagnes (Mont-Blanc [246,249,232]) et toute terre colorée restent celles de Sentinel-2. Le fichier source garde son nom (`day-8k.ktx2`) : le jeu n'a rien à changer.

- [ ] **Step 1 : Écrire les tests qui échouent**

**Créer** `web/scripts/textures/__tests__/unit/polarFill.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { polarFill } from '../../lib/polarFill';

// grille de 1 × 180 pixels : la ligne y a pour latitude 89,5° − y
const H = 180;
const column = (rgb: number[]) => new Uint8Array(Array.from({ length: H }, () => rgb).flat());
const at = (img: Uint8Array, lat: number) => [...img.subarray(Math.floor(89.5 - lat) * 3, Math.floor(89.5 - lat) * 3 + 3)];

describe('glaces polaires : le blanc plat de Sentinel-2 cède la place à Blue Marble', () => {
  const bm = column([180, 190, 200]);
  it('au-delà de 62°, un blanc plat prend la glace de Blue Marble', () => {
    const out = polarFill(column([255, 255, 255]), bm, 1, H);
    expect(at(out, 75.5)).toEqual([180, 190, 200]);
    expect(at(out, -80.5)).toEqual([180, 190, 200]);
  });
  it('sous 58°, la neige reste celle de Sentinel-2 (Alpes, Himalaya)', () => {
    expect(at(polarFill(column([255, 255, 255]), bm, 1, H), 45.5)).toEqual([255, 255, 255]);
  });
  it('une terre colorée près du pôle reste celle de Sentinel-2', () => {
    expect(at(polarFill(column([90, 80, 60]), bm, 1, H), 75.5)).toEqual([90, 80, 60]);
  });
  it('transition continue entre 58° et 62°', () => {
    const out = polarFill(column([255, 255, 255]), bm, 1, H);
    const r = at(out, 60.5)[0]!;
    expect(r).toBeGreaterThan(180);
    expect(r).toBeLessThan(255);
  });
});
```

**Modifier** `web/scripts/textures/__tests__/data/textures.test.ts` — remplacer :

```ts
  it('publie les crédits des quatre couches', () => {
    expect(JSON.parse(readFileSync(path.join(TEX_OUT_DIR, 'credits.json'), 'utf8'))).toHaveLength(4);
  });
});
```

par :

```ts
  it('publie les crédits des quatre couches', () => {
    expect(JSON.parse(readFileSync(path.join(TEX_OUT_DIR, 'credits.json'), 'utf8'))).toHaveLength(4);
  });
  it('le jour crédite EOxCloudless 2025 avec l’attribution exacte (spec §9)', () => {
    const credits = JSON.parse(readFileSync(path.join(TEX_OUT_DIR, 'credits.json'), 'utf8')) as { layer: string; text: string }[];
    expect(credits.find((c) => c.layer === 'jour')!.text).toContain('EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)');
  });
});
```

- [ ] **Step 2 : Les voir échouer**

Run: `npx vitest run --project unit scripts/textures` puis `npx vitest run --project data scripts/textures`
Expected: unitaires — FAIL, `../../lib/polarFill` introuvable ; données — `1 failed | 7 passed`, le crédit du jour est encore celui de Blue Marble.

- [ ] **Step 3 : Écrire le remplissage polaire**

**Créer** `web/scripts/textures/lib/polarFill.ts` :

```ts
/** Au-delà de 58–62° de latitude, un blanc plat (≥ 240–252 sur les trois canaux) est l'absence de donnée de Sentinel-2. */
export const POLAR = { fromLat: 58, toLat: 62, whiteFrom: 240, whiteTo: 252 } as const;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Jour équirectangulaire RVB (`width × height`, ligne 0 au nord) : les glaces polaires que Sentinel-2 rend en blanc plat
 * (Groenland, Antarctique) prennent la glace ombrée de Blue Marble ; la neige des montagnes et toute terre colorée
 * restent celles de Sentinel-2.
 */
export function polarFill(s2: Uint8Array, bm: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(s2.length);
  for (let y = 0; y < height; y++) {
    const wl = smooth(POLAR.fromLat, POLAR.toLat, Math.abs(90 - ((y + 0.5) / height) * 180));
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const w = wl === 0 ? 0 : wl * smooth(POLAR.whiteFrom, POLAR.whiteTo, Math.min(s2[i]!, s2[i + 1]!, s2[i + 2]!));
      for (let k = 0; k < 3; k++) out[i + k] = Math.round(s2[i + k]! * (1 - w) + bm[i + k]! * w);
    }
  }
  return out;
}
```

Run: `npx vitest run --project unit scripts/textures`
Expected: PASS — `Tests  10 passed (10)` (6 existants + 4).

- [ ] **Step 4 : Brancher Sentinel-2 dans la configuration, la récupération et la construction**

**Modifier** `web/scripts/textures/config.ts` — remplacer :

```ts
/** Sources NASA (lues et vérifiées par HEAD le 02/10/2026 ; tailles = Content-Length relevé ce jour-là). */
export const TEXTURE_SOURCES = {
  /** Blue Marble Next Generation, juillet 2004, sans ombrage, PNG sans perte (l'original documenté). */
```

par :

```ts
import { EOX } from '../imagery/config';

/**
 * Jour : mosaïque mondiale Sentinel-2 cloudless 2025 (EOX, scripts/imagery/config.ts), 8192 × 4096 en deux requêtes WMS ;
 * Blue Marble n'y comble plus que les glaces polaires (lib/polarFill.ts).
 */
export const DAY_S2 = { box: { west: -180, south: -90, east: 180, north: 90 }, maxStepDeg: 360 / 8192 } as const;

/** Sources NASA (lues et vérifiées par HEAD le 02/10/2026 ; tailles = Content-Length relevé ce jour-là). */
export const TEXTURE_SOURCES = {
  /** Blue Marble Next Generation, juillet 2004, sans ombrage, PNG sans perte : glaces polaires du jour. */
```

**Modifier** `web/scripts/textures/config.ts` — remplacer :

```ts
  { layer: 'jour', text: 'Blue Marble: Next Generation (juillet 2004), NASA Earth Observatory (Reto Stöckli).' },
```

par :

```ts
  { layer: 'jour', text: `Data & Viewing Products: ${EOX.attribution}, CC BY-NC-SA 4.0. Glaces polaires : Blue Marble: Next Generation (juillet 2004), NASA Earth Observatory (Reto Stöckli).` },
```

**Modifier** `web/scripts/textures/fetch-textures.ts` — remplacer :

```ts
import { TEXTURE_SOURCES } from './config';
import { TEX_CACHE_DIR, TEX_LOCK_PATH } from './paths';

interface LockEntry { url: string; sha256: string; bytes: number }

async function main(): Promise<void> {
  const lock: Record<string, LockEntry> = existsSync(TEX_LOCK_PATH) ? readJson(TEX_LOCK_PATH) : {};
```

par :

```ts
import { EOX } from '../imagery/config';
import { snapGrid } from '../imagery/lib/grid';
import { loadMosaic, type FetchedTile } from '../imagery/lib/mosaic';
import { IMG_CACHE_DIR } from '../imagery/paths';
import { DAY_S2, TEXTURE_SOURCES } from './config';
import { TEX_CACHE_DIR, TEX_LOCK_PATH } from './paths';

interface LockEntry { url: string; sha256: string; bytes: number }
type Lock = Record<string, LockEntry> & { s2day?: FetchedTile[] };

async function main(): Promise<void> {
  const lock: Lock = existsSync(TEX_LOCK_PATH) ? readJson(TEX_LOCK_PATH) : {};
```

**Modifier** `web/scripts/textures/fetch-textures.ts` — remplacer :

```ts
    console.log(`${key} : ${bytes.length} octets`);
  }
  writeJson(TEX_LOCK_PATH, lock);
}
```

par :

```ts
    console.log(`${key} : ${bytes.length} octets`);
  }
  // Jour Sentinel-2 : réponses WMS en cache ; une empreinte qui change (EOX a refait ses tuiles) arrête tout — retirer
  // l'entrée « s2day » du verrou pour accepter le nouveau rendu après l'avoir regardé.
  const { tiles } = await loadMosaic(snapGrid(DAY_S2.box, DAY_S2.maxStepDeg), { service: EOX.service, cacheDir: IMG_CACHE_DIR, maxPx: EOX.maxPx });
  if (lock.s2day) {
    for (const t of tiles) {
      const prev = lock.s2day.find((p) => p.url === t.url);
      if (prev && prev.sha256 !== t.sha256) throw new Error(`s2day : empreinte différente du verrou pour ${t.url}`);
    }
  }
  lock.s2day = tiles;
  console.log(`s2day : ${tiles.length} requêtes, ${tiles.reduce((s, t) => s + t.bytes, 0)} octets`);
  writeJson(TEX_LOCK_PATH, lock);
}
```

**Modifier** `web/scripts/textures/build-textures.ts` — remplacer :

```ts
import { BUDGET_BYTES, COLOR_SIZES, CREDITS, SURFACE_SIZE, TEXTURE_SOURCES } from './config';
```

par :

```ts
import { EOX } from '../imagery/config';
import { snapGrid } from '../imagery/lib/grid';
import { loadMosaic } from '../imagery/lib/mosaic';
import { IMG_CACHE_DIR } from '../imagery/paths';
import { BUDGET_BYTES, COLOR_SIZES, CREDITS, DAY_S2, SURFACE_SIZE, TEXTURE_SOURCES } from './config';
import { polarFill } from './lib/polarFill';
```

**Modifier** `web/scripts/textures/build-textures.ts` — remplacer :

```ts
/** Couleur (jour, nuit) : ETC1S sRGB, mipmaps, origine en bas à gauche (sinon le globe sort retourné nord-sud). */
async function colorTexture(key: 'day' | 'night', size: number, qlevel: number): Promise<string> {
  const png = path.join(TMP, `${key}-${size}.png`);
  await sharp(source(key), { limitInputPixels: false }).resize(size, size / 2, { kernel: 'lanczos3' }).removeAlpha().png({ compressionLevel: 6 }).toFile(png);
```

par :

```ts
/** Jour pleine résolution (8192 × 4096) : mosaïque Sentinel-2 2025 du cache, glaces polaires de Blue Marble. */
async function daySource(): Promise<string> {
  const png = path.join(TMP, 'day-source.png');
  const { mosaic } = await loadMosaic(snapGrid(DAY_S2.box, DAY_S2.maxStepDeg), { service: EOX.service, cacheDir: IMG_CACHE_DIR, maxPx: EOX.maxPx, offline: true });
  const { width, height } = mosaic.grid;
  const { data: bm } = await sharp(source('day'), { limitInputPixels: false }).resize(width, height, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const rgb = polarFill(mosaic.rgb, bm, width, height);
  await sharp(rgb, { raw: { width, height, channels: 3 } }).png({ compressionLevel: 6 }).toFile(png);
  return png;
}

/** Couleur (jour, nuit) : ETC1S sRGB, mipmaps, origine en bas à gauche (sinon le globe sort retourné nord-sud). */
async function colorTexture(key: 'day' | 'night', size: number, qlevel: number, from: string): Promise<string> {
  const png = path.join(TMP, `${key}-${size}.png`);
  await sharp(from, { limitInputPixels: false }).resize(size, size / 2, { kernel: 'lanczos3' }).removeAlpha().png({ compressionLevel: 6 }).toFile(png);
```

**Modifier** `web/scripts/textures/build-textures.ts` — remplacer :

```ts
  const names: string[] = [];
  for (const size of COLOR_SIZES) {
    names.push(await colorTexture('day', size, 192));
    names.push(await colorTexture('night', size, 128));
  }
```

par :

```ts
  const names: string[] = [];
  const day = await daySource();
  for (const size of COLOR_SIZES) {
    names.push(await colorTexture('day', size, 192, day));
    names.push(await colorTexture('night', size, 128, source('night')));
  }
```

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 5 : Récupérer la mosaïque mondiale (réseau : 2 requêtes EOX)**

Run: `npm run textures:fetch`
Expected: `day : déjà en cache (123901191 octets)`, `night : déjà en cache (8106233 octets)`, `elevation : déjà en cache (233345166 octets)`, puis `s2day : 2 requêtes, 3108834 octets` (le nombre d'octets peut changer si EOX refait ses tuiles : le relever dans le rapport).

- [ ] **Step 6 : Construire les textures**

Run: `npm run textures`
Expected : rapport avec `day-8k.ktx2 | 3873228`, `night-8k.ktx2 | 1123251`, `day-4k.ktx2 | 1096801`, `night-4k.ktx2 | 323745`, `surface-4k.ktx2 | 2042258` ; niveau « standard » 3462804 octets (budget 15000000), « haute » 7038737 (budget 25000000). Les tailles des deux `day-*` peuvent différer si la mosaïque a changé.

- [ ] **Step 7 : Vérifier les données et la Terre rendue**

Run: `npx vitest run --project data scripts/textures`
Expected: PASS — `Tests  8 passed (8)`.

Run: `npm run e2e -- e2e/earth.spec.ts`
Expected: `6 passed` ; journal `sahara [176,127,86] pacifique [41,54,74]` sur les deux backends.

- [ ] **Step 8 : Montrer le rendu à l'utilisateur**

Avec le serveur de dev (`npm run dev -- --port 5180 --strictPort`), capturer `probe.html?mode=game&tier=haute&w=1300&h=750` avec `cca3=FRA`, `cca3=EGY`, `at=-42,72&alt=0.6&sun=-42,72` (Groenland) et `at=0,-75&alt=0.8&sun=0,-75` (Antarctique), et les lui envoyer (Sahara plus rouge qu'avec Blue Marble, glaces de Blue Marble). Ne pas attendre sa réponse pour continuer : un avis contraire rouvrira cette tâche.

- [ ] **Step 9 : Commit**

```bash
git add scripts/textures public/textures
git commit -m "textures : jour Sentinel-2 cloudless 2025 (mosaïque WMS en cache), glaces polaires de Blue Marble, crédit EOX"
```

---
### Task 3 : Patchs image Sentinel-2 — cadre, reprojection, masque d'eau, index versionné

**Files:**
- Create: `web/scripts/imagery/lib/patchImage.ts`, `web/scripts/imagery/build-patches.ts`, `web/src/data/imagery.ts`
- Modify: `web/scripts/imagery/config.ts`, `web/scripts/imagery/paths.ts`, `web/package.json`, `.gitignore`
- Test: `web/scripts/imagery/__tests__/unit/patchImage.test.ts`, `web/scripts/imagery/__tests__/data/imagery.test.ts`
- Sorties : `web/public/data/imagery.json` et `web/scripts/imagery/rapport-imagerie.md` (versionnés) ; `web/public/data/patches/img/<cca3>-{2048,1024}.ktx2` (HORS dépôt)

**Interfaces:**
- Consumes: Task 1 — `snapGrid`, `loadMosaic`, `sampleBilinear`, `EOX`, `IMG_CACHE_DIR` ; `makeProjector(frame)` et `PatchFrame` (`scripts/geodata/lib/patch.ts`) ; `polygonsOf` (`scripts/geodata/lib/geometry.ts`) ; `NE_COUNTRIES` (`scripts/textures/paths.ts`) ; `FRAMING` (`src/camera/config.ts`).
- Produces: `IMAGE_PATCH = { sizes: [2048, 1024], viewFactor: 2.2, maxExtentDeg: 30, qlevel: 192 }` ; `imageExtentRad(capRadiusDeg, framing, { viewFactor, maxExtentDeg }): number` ; `frameBox(frame): GeoBox` ; `rasterizeLandGrid(polygons, grid): Uint8Array` ; `sampleMask(grid, mask): (lon, lat) => number` ; `renderPatch(frame, color, land): Uint8Array` (RVBA) ; `IMG_OUT_DIR`, `IMG_INDEX_PATH`, `IMG_REPORT_PATH` ; côté application (`src/data/imagery.ts`) : `interface ImageFile { bytes; sha256 }`, `interface ImagePatchMeta { center: LngLat; extentRad; files: Record<string, ImageFile> }`, `interface ImageryIndex { layer; year; license; attribution; framing: { margin; minContextDeg }; viewFactor; maxExtentDeg; sizes; countries: Record<cca3, ImagePatchMeta> }`, `imagePatchUrl(baseUrl, cca3, size): string`.

Emprise : la vue d'arrivée montre la calotte max(θ, θ_min) sur 1/m du demi-champ limitant ; × 2,2 couvre le grand côté de l'écran (paysage 16:9 et portrait de téléphone). Au-delà de 30°, 2048 texels ne seraient plus plus fins que la texture globale 8K. Mesuré sur les 197 pays : de 19,80° (92 pays au contexte minimal) à 30° (74 pays plafonnés).

- [ ] **Step 1 : Écrire les tests unitaires qui échouent**

**Créer** `web/scripts/imagery/__tests__/unit/patchImage.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { makeProjector } from '../../../geodata/lib/patch';
import { snapGrid } from '../../lib/grid';
import { frameBox, imageExtentRad, rasterizeLandGrid, renderPatch } from '../../lib/patchImage';

const RAD = Math.PI / 180;
const B = { margin: 3, minContextDeg: 3 };

describe('emprise du patch image : la vue d’arrivée, plafonnée', () => {
  it('petit pays : contexte minimal × marge × facteur de vue (3 × 3 × 2,2 = 19,8°)', () => {
    expect(imageExtentRad(0.38, B, { viewFactor: 2.2, maxExtentDeg: 30 })).toBeCloseTo(19.8 * RAD, 12);
  });
  it('pays moyen : son rayon × marge × facteur (France, θ = 4,866° → 32,1°, plafonné à 30°)', () => {
    expect(imageExtentRad(4.866456, B, { viewFactor: 2.2, maxExtentDeg: 40 })).toBeCloseTo(4.866456 * 3 * 2.2 * RAD, 12);
    expect(imageExtentRad(4.866456, B, { viewFactor: 2.2, maxExtentDeg: 30 })).toBeCloseTo(30 * RAD, 12);
  });
});

describe('boîte géographique d’un cadre azimutal', () => {
  it('contient le cadre, longitudes déroulées autour du centre', () => {
    const b = frameBox({ center: [2, 46], extentRad: 20 * RAD, size: 64 });
    expect(b.south).toBeLessThan(26.1);
    expect(b.north).toBeGreaterThan(65.9);
    expect(b.west).toBeLessThan(2 - 20);
    expect(b.east).toBeGreaterThan(2 + 20);
  });
  it('franchit l’antiméridien sans se retourner (Fidji)', () => {
    const b = frameBox({ center: [178, -17], extentRad: 20 * RAD, size: 64 });
    expect(b.east).toBeGreaterThan(180);
    expect(b.west).toBeLessThan(178);
    expect(b.east - b.west).toBeLessThan(90);
  });
  it('un pôle dans le cadre : toutes les longitudes jusqu’au pôle', () => {
    const b = frameBox({ center: [15, 70], extentRad: 30 * RAD, size: 64 });
    expect(b.north).toBe(90);
    expect(b.east - b.west).toBe(360);
  });
});

describe('masque terre sur une grille déroulée', () => {
  const square = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  it('les polygones coupés à ±180° se rejoignent dans une grille qui franchit l’antiméridien', () => {
    const g = snapGrid({ west: 175, south: -20, east: 185, north: -10 }, 1);
    const land = rasterizeLandGrid([[square(170, -20, 180, -10)], [square(-180, -20, -178, -10)]], g);
    const at = (lon: number, lat: number) => land[Math.floor(g.north - lat) * g.width + Math.floor(lon - g.west)];
    expect(at(176.5, -15.5)).toBe(1);
    expect(at(181.5, -15.5)).toBe(1); // −178,5°
    expect(at(183.5, -15.5)).toBe(0);
  });
});

describe('reprojection dans le cadre du contrat (PatchMeta)', () => {
  it('ligne 0 au nord, colonne 0 à l’ouest ; alpha = mer', () => {
    const frame = { center: [10, 45] as [number, number], extentRad: 10 * RAD, size: 32 };
    // couleur = (longitude + 20, latitude) × 4, dans [0, 255] ; terre à l'est du méridien 10°
    const rgba = renderPatch(frame, (lon, lat) => [Math.round((lon + 20) * 4), Math.round(lat * 4), 0], (lon) => (lon > 10 ? 1 : 0));
    const px = (x: number, y: number) => [...rgba.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4)];
    const proj = makeProjector(frame);
    const [lonN, latN] = proj.toLngLat(16.5, 0.5);
    expect(px(16, 0).slice(0, 2)).toEqual([Math.round((lonN + 20) * 4), Math.round(latN * 4)]);
    expect(px(16, 0)[1]!).toBeGreaterThan(px(16, 31)[1]!); // nord en haut
    expect(px(0, 16)[0]!).toBeLessThan(px(31, 16)[0]!); // ouest à gauche
    expect(px(2, 16)[3]).toBe(255); // ouest : mer
    expect(px(29, 16)[3]).toBe(0); // est : terre
  });
});
```

Run: `npx vitest run --project unit scripts/imagery`
Expected: FAIL — `../../lib/patchImage` introuvable (les 13 tests de la Task 1 passent).

- [ ] **Step 2 : Écrire la configuration, le contrat de l'index et la bibliothèque**

**Modifier** `web/scripts/imagery/config.ts` — remplacer :

```ts
  attribution: 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
} as const;
```

par :

```ts
  attribution: 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
} as const;

/**
 * Patchs image (spec §4.3, amendé le 02/10) : emprise = vue d'arrivée (lib/patchImage.ts), 2048 texels en « haute »,
 * 1024 en « standard » (réduction du 2048) ; ETC1S sRGB, alpha = masque d'eau ; fichiers HORS dépôt.
 */
export const IMAGE_PATCH = { sizes: [2048, 1024] as const, viewFactor: 2.2, maxExtentDeg: 30, qlevel: 192 } as const;
```

**Modifier** `web/scripts/imagery/paths.ts` — remplacer :

```ts
export const IMG_CACHE_DIR = path.join(here, '.cache');
```

par :

```ts
export const IMG_CACHE_DIR = path.join(here, '.cache');

/** Patchs image générés (non versionnés : web/public/data/patches/img/ est ignoré par git). */
export const IMG_OUT_DIR = path.resolve(here, '../../public/data/patches/img');
/** Index versionné des patchs image : cadre de chaque pays, attribution, empreintes des fichiers. */
export const IMG_INDEX_PATH = path.resolve(here, '../../public/data/imagery.json');
export const IMG_REPORT_PATH = path.join(here, 'rapport-imagerie.md');
```

**Créer** `web/src/data/imagery.ts` :

```ts
import type { LngLat } from './types';

/** Fichier d'un patch image (taille en texels → octets et empreinte). */
export interface ImageFile { bytes: number; sha256: string }

/**
 * Patch image d'un pays (public/data/imagery.json, scripts/imagery) : même projection que le patch SDF (contrat de
 * PatchMeta : azimutale équidistante, ligne 0 au nord, sans retournement), emprise propre ; KTX2 ETC1S sRGB, alpha = mer.
 * URL : `data/patches/img/<cca3 en minuscules>-<taille>.ktx2`.
 */
export interface ImagePatchMeta { center: LngLat; extentRad: number; files: Record<string, ImageFile> }

export interface ImageryIndex {
  layer: string;
  year: number;
  license: string;
  attribution: string;
  framing: { margin: number; minContextDeg: number };
  viewFactor: number;
  maxExtentDeg: number;
  sizes: number[];
  countries: Record<string, ImagePatchMeta>;
}

export const imagePatchUrl = (baseUrl: string, cca3: string, size: number) => `${baseUrl}data/patches/img/${cca3.toLowerCase()}-${size}.ktx2`;
```

**Créer** `web/scripts/imagery/lib/patchImage.ts` :

```ts
import { makeProjector, type PatchFrame } from '../../geodata/lib/patch';
import type { GeoBox, Grid } from './grid';

const RAD = Math.PI / 180;

/**
 * Emprise (demi-côté, rad) du patch image : la vue à l'arrivée, pas le pays. Le cadrage montre la calotte
 * max(θ, θ_min) sur 1/m du demi-champ limitant ; `viewFactor` étend au grand côté de l'écran (paysage 16:9 et portrait de
 * téléphone, ≈ 2,2). Au-delà de `maxExtentDeg`, 2048 texels ne seraient plus plus fins que la texture globale 8K.
 */
export function imageExtentRad(capRadiusDeg: number, framing: { margin: number; minContextDeg?: number }, o: { viewFactor: number; maxExtentDeg: number }): number {
  return Math.min(Math.max(capRadiusDeg, framing.minContextDeg ?? 0) * framing.margin * o.viewFactor, o.maxExtentDeg) * RAD;
}

/** Boîte géographique d'un cadre : bord et intérieur échantillonnés (65 × 65), longitudes déroulées autour du centre ; un pôle dans le cadre ouvre toutes les longitudes. */
export function frameBox(frame: PatchFrame): GeoBox {
  const proj = makeProjector(frame), n = 64, lon0 = frame.center[0];
  const wrap = (d: number) => ((d + 540) % 360) - 180;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const [lon, lat] = proj.toLngLat((i / n) * frame.size, (j / n) * frame.size);
    const d = wrap(lon - lon0);
    west = Math.min(west, lon0 + d); east = Math.max(east, lon0 + d); south = Math.min(south, lat); north = Math.max(north, lat);
  }
  for (const pole of [90, -90]) {
    const [x, y] = proj.toPixel([lon0, pole]);
    if (x >= 0 && x <= frame.size && y >= 0 && y <= frame.size) {
      west = lon0 - 180; east = lon0 + 180;
      if (pole > 0) north = 90; else south = -90;
    }
  }
  return { west, south, east, north };
}

/** Masque terre (1) sur une grille plate carrée, en pair-impair aux centres de pixels ; chaque polygone est aussi posé à ±360° pour une grille déroulée. */
export function rasterizeLandGrid(polygons: number[][][][], g: Grid): Uint8Array {
  const mask = new Uint8Array(g.width * g.height);
  const xs: number[] = [];
  for (const poly of polygons) {
    let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
    for (const ring of poly) for (const p of ring) {
      minLon = Math.min(minLon, p[0]!); maxLon = Math.max(maxLon, p[0]!); minLat = Math.min(minLat, p[1]!); maxLat = Math.max(maxLat, p[1]!);
    }
    for (const shift of [-360, 0, 360]) {
      if (maxLon + shift < g.west || minLon + shift > g.east || maxLat < g.south || minLat > g.north) continue;
      const rowFrom = Math.max(0, Math.floor((g.north - maxLat) / g.step)), rowTo = Math.min(g.height - 1, Math.ceil((g.north - minLat) / g.step));
      for (let y = rowFrom; y <= rowTo; y++) {
        const lat = g.north - (y + 0.5) * g.step;
        xs.length = 0;
        for (const ring of poly) {
          for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [lonA, latA] = ring[i]!, [lonB, latB] = ring[j]!;
            if (latA! > lat !== latB! > lat) xs.push(lonA! + shift + ((lat - latA!) * (lonB! - lonA!)) / (latB! - latA!));
          }
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const from = Math.max(0, Math.ceil((xs[k]! - g.west) / g.step - 0.5)), to = Math.min(g.width - 1, Math.floor((xs[k + 1]! - g.west) / g.step - 0.5));
          for (let x = from; x <= to; x++) mask[y * g.width + x] = 1;
        }
      }
    }
  }
  return mask;
}

/** Fraction de terre (bilinéaire) d'un masque de grille, longitude déroulée comme la grille. */
export function sampleMask(g: Grid, mask: Uint8Array) {
  return (lon: number, lat: number): number => {
    let l = lon;
    while (l < g.west) l += 360;
    while (l >= g.west + 360) l -= 360;
    const fx = Math.min(g.width - 1, Math.max(0, (l - g.west) / g.step - 0.5)), fy = Math.min(g.height - 1, Math.max(0, (g.north - lat) / g.step - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(g.width - 1, x0 + 1), y1 = Math.min(g.height - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    const m = (x: number, y: number) => mask[y * g.width + x]!;
    return (m(x0, y0) * (1 - tx) + m(x1, y0) * tx) * (1 - ty) + (m(x0, y1) * (1 - tx) + m(x1, y1) * tx) * ty;
  };
}

/**
 * Patch image RVBA dans le cadre du contrat (PatchMeta : azimutale équidistante, ligne 0 au nord) : chaque texel prend
 * la couleur de son centre ; alpha = mer (255) / terre (0), comme le canal G de la texture de surface.
 */
export function renderPatch(frame: PatchFrame, color: (lon: number, lat: number) => [number, number, number], land: (lon: number, lat: number) => number): Uint8Array {
  const proj = makeProjector(frame), n = frame.size;
  const out = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const [lon, lat] = proj.toLngLat(i + 0.5, j + 0.5);
    const [r, g, b] = color(lon, lat);
    const k = (j * n + i) * 4;
    out[k] = r; out[k + 1] = g; out[k + 2] = b; out[k + 3] = Math.round(255 * (1 - land(lon, lat)));
  }
  return out;
}
```

Run: `npx vitest run --project unit scripts/imagery`
Expected: PASS — `Tests  20 passed (20)` (13 + 7).

- [ ] **Step 3 : Écrire la génération (`npm run imagery`)**

**Créer** `web/scripts/imagery/build-patches.ts` :

```ts
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import sharp from 'sharp';
import { FRAMING } from '../../src/camera/config';
import type { ImageryIndex } from '../../src/data/imagery';
import type { CountryRecord } from '../../src/data/types';
import { polygonsOf } from '../geodata/lib/geometry';
import { sha256 } from '../geodata/lib/http';
import { readJson, writeJson } from '../geodata/lib/io';
import { NE_COUNTRIES } from '../textures/paths';
import { EOX, IMAGE_PATCH } from './config';
import { snapGrid } from './lib/grid';
import { loadMosaic, sampleBilinear } from './lib/mosaic';
import { frameBox, imageExtentRad, rasterizeLandGrid, renderPatch, sampleMask } from './lib/patchImage';
import { IMG_CACHE_DIR, IMG_INDEX_PATH, IMG_OUT_DIR, IMG_REPORT_PATH } from './paths';

sharp.cache(false);
const TMP = path.join(IMG_CACHE_DIR, 'tmp');
const RAD = Math.PI / 180;

function toktx(out: string, png: string): void {
  // Pas de --lower_left_maps_to_s0t0 : le patch se lit en (u, v) calculés, ligne 0 = nord = v 0 (contrat de PatchMeta).
  const r = spawnSync('toktx', ['--t2', '--encode', 'etc1s', '--clevel', '2', '--qlevel', String(IMAGE_PATCH.qlevel), '--genmipmap', '--assign_oetf', 'srgb', out, png], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`toktx ${out} : code ${r.status}`);
}

/** `npm run imagery [CCA3 …]` : patchs image des pays nommés (tous par défaut) ; réseau seulement pour ce qui manque au cache. */
async function main(): Promise<void> {
  const countries = readJson<CountryRecord[]>(path.resolve(IMG_OUT_DIR, '../../countries.json'));
  const only = process.argv.slice(2).map((s) => s.toUpperCase());
  const ne = readJson<FeatureCollection<Polygon | MultiPolygon>>(NE_COUNTRIES);
  const polygons = ne.features.flatMap((f) => polygonsOf(f.geometry)) as number[][][][];
  const previous: ImageryIndex | null = existsSync(IMG_INDEX_PATH) ? readJson(IMG_INDEX_PATH) : null;
  const index: ImageryIndex = {
    layer: EOX.service.layer, year: EOX.year, license: EOX.license, attribution: EOX.attribution,
    framing: { margin: FRAMING.margin, minContextDeg: FRAMING.minContextDeg ?? 0 },
    viewFactor: IMAGE_PATCH.viewFactor, maxExtentDeg: IMAGE_PATCH.maxExtentDeg, sizes: [...IMAGE_PATCH.sizes],
    countries: { ...(previous?.countries ?? {}) },
  };
  mkdirSync(TMP, { recursive: true });
  mkdirSync(IMG_OUT_DIR, { recursive: true });
  const [big, small] = IMAGE_PATCH.sizes;
  for (const rec of countries) {
    if (only.length && !only.includes(rec.cca3)) continue;
    const extentRad = imageExtentRad(rec.cap.radiusDeg, FRAMING, IMAGE_PATCH);
    const frame = { center: rec.cap.center, extentRad, size: big };
    const texelDeg = (2 * extentRad) / big / RAD;
    const box = frameBox(frame);
    const pad = 2 * texelDeg;
    const grid = snapGrid({ west: box.west - pad, south: box.south - pad, east: box.east + pad, north: box.north + pad }, texelDeg);
    const { mosaic } = await loadMosaic(grid, { service: EOX.service, cacheDir: IMG_CACHE_DIR, maxPx: EOX.maxPx });
    const land = sampleMask(grid, rasterizeLandGrid(polygons, grid));
    const rgba = renderPatch(frame, (lon, lat) => sampleBilinear(mosaic, lon, lat), land);
    const id = rec.cca3.toLowerCase();
    const png = path.join(TMP, `${id}-${big}.png`), pngSmall = path.join(TMP, `${id}-${small}.png`);
    await sharp(rgba, { raw: { width: big, height: big, channels: 4 } }).png({ compressionLevel: 6 }).toFile(png);
    await sharp(png).resize(small, small, { kernel: 'lanczos3' }).png({ compressionLevel: 6 }).toFile(pngSmall);
    const files: Record<string, { bytes: number; sha256: string }> = {};
    for (const [size, src] of [[big, png], [small, pngSmall]] as const) {
      const out = path.join(IMG_OUT_DIR, `${id}-${size}.ktx2`);
      toktx(out, src);
      const bytes = readFileSync(out);
      files[String(size)] = { bytes: bytes.length, sha256: sha256(bytes) };
    }
    index.countries[rec.cca3] = { center: rec.cap.center, extentRad, files };
    console.log(`${rec.cca3} : ±${(extentRad / RAD).toFixed(2)}°, grille ${grid.width} × ${grid.height}, ${files[String(big)]!.bytes} + ${files[String(small)]!.bytes} octets`);
  }
  // ordre stable des pays dans l'index versionné
  index.countries = Object.fromEntries(Object.entries(index.countries).sort(([a], [b]) => a.localeCompare(b)));
  writeJson(IMG_INDEX_PATH, index);
  const rows = Object.entries(index.countries).map(([k, v]) => `| ${k} | ${((v.extentRad / RAD)).toFixed(2)} | ${v.files[String(big)]?.bytes ?? ''} | ${v.files[String(small)]?.bytes ?? ''} |`);
  const total = (s: number) => Object.values(index.countries).reduce((t, v) => t + (v.files[String(s)]?.bytes ?? 0), 0);
  writeFileSync(IMG_REPORT_PATH, ['# Patchs image — rapport de génération', '', `${EOX.attribution} — ${EOX.license}`, '',
    `- ${Object.keys(index.countries).length} pays ; ${big} px : ${total(big)} octets ; ${small} px : ${total(small)} octets`, '',
    '| Pays | Demi-emprise (°) | Octets ' + big + ' | Octets ' + small + ' |', '|---|---:|---:|---:|', ...rows, ''].join('\n'));
  rmSync(TMP, { recursive: true, force: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**Modifier** `web/package.json` — remplacer :

```json
    "e2e:countries": "playwright test e2e/countries.spec.ts"
```

par :

```json
    "e2e:countries": "playwright test e2e/countries.spec.ts",
    "imagery": "tsx scripts/imagery/build-patches.ts"
```

**Modifier** `.gitignore` — remplacer :

```gitignore
web/scripts/imagery/.cache/
```

par :

```gitignore
web/scripts/imagery/.cache/
web/public/data/patches/img/
```

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4 : Écrire le test de données de l'index**

**Créer** `web/scripts/imagery/__tests__/data/imagery.test.ts` :

```ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FRAMING } from '../../../../src/camera/config';
import type { ImageryIndex } from '../../../../src/data/imagery';
import type { CountryRecord } from '../../../../src/data/types';
import { sha256 } from '../../../geodata/lib/http';
import { readKtx2Header } from '../../../textures/lib/ktx2';
import { EOX, IMAGE_PATCH } from '../../config';
import { imageExtentRad } from '../../lib/patchImage';
import { IMG_INDEX_PATH, IMG_OUT_DIR } from '../../paths';

const countries = JSON.parse(readFileSync(path.resolve(IMG_OUT_DIR, '../../countries.json'), 'utf8')) as CountryRecord[];
const index = (): ImageryIndex => {
  if (!existsSync(IMG_INDEX_PATH)) throw new Error('imagery.json absent : lancer `npm run imagery`');
  return JSON.parse(readFileSync(IMG_INDEX_PATH, 'utf8')) as ImageryIndex;
};

describe('index des patchs image (public/data/imagery.json, versionné)', () => {
  it('attribution et licence EOX 2025 exactes (spec §9)', () => {
    const i = index();
    expect([i.layer, i.year, i.license, i.attribution]).toEqual([EOX.service.layer, EOX.year, EOX.license, EOX.attribution]);
  });
  it('généré au cadrage du jeu (sinon : `npm run imagery` après tout changement de FRAMING)', () => {
    expect(index().framing).toEqual({ margin: FRAMING.margin, minContextDeg: FRAMING.minContextDeg ?? 0 });
  });
  it('les 197 pays, centrés sur leur calotte, à l’emprise de la vue d’arrivée', () => {
    const i = index();
    expect(Object.keys(i.countries).sort()).toEqual(countries.map((c) => c.cca3).sort());
    for (const c of countries) {
      const m = i.countries[c.cca3]!;
      expect(m.center).toEqual(c.cap.center);
      expect(m.extentRad).toBeCloseTo(imageExtentRad(c.cap.radiusDeg, FRAMING, IMAGE_PATCH), 12);
    }
  });
});

describe('fichiers des patchs image (hors dépôt : web/public/data/patches/img)', () => {
  it('chaque fichier de l’index est présent, à sa taille et à son empreinte, sans retournement (KTXorientation rd)', () => {
    const i = index();
    const missing: string[] = [];
    for (const [cca3, m] of Object.entries(i.countries)) {
      for (const [size, f] of Object.entries(m.files)) {
        const p = path.join(IMG_OUT_DIR, `${cca3.toLowerCase()}-${size}.ktx2`);
        if (!existsSync(p)) { missing.push(path.basename(p)); continue; }
        const bytes = readFileSync(p);
        expect([bytes.length, sha256(bytes)]).toEqual([f.bytes, f.sha256]);
        const h = readKtx2Header(bytes);
        expect([h.width, h.height, h.supercompression, h.kv.KTXorientation]).toEqual([Number(size), Number(size), 1, 'rd']);
      }
    }
    expect(missing, 'patchs absents : lancer `npm run imagery`').toEqual([]);
  });
});
```

Run: `npx vitest run --project data scripts/imagery`
Expected: FAIL — `imagery.json absent : lancer \`npm run imagery\``.

- [ ] **Step 5 : Essai sur sept pays difficiles (réseau)**

Run: `npm run imagery -- LUX FRA FJI NOR VAT KIR RUS`
Expected (≈ 4 min ; mêmes valeurs au prototype, à l'octet près tant qu'EOX ne refait pas ses tuiles) :

```
FJI : ±19.80°, grille 2502 × 2086, 390038 + 138852 octets
FRA : ±30.00°, grille 4881 × 2210, 743344 + 124709 octets
KIR : ±19.80°, grille 2175 × 2053, 333579 + 120039 octets
LUX : ±19.80°, grille 4805 × 2188, 723876 + 130284 octets
NOR : ±30.00°, grille 12297 × 1999, 727834 + 151539 octets
RUS : ±30.00°, grille 12297 × 2100, 777521 + 88876 octets
VAT : ±19.80°, grille 3866 × 2160, 836997 + 110237 octets
```

Fidji franchit l'antiméridien (le service répond un PNG pour la colonne de 180°, accepté) ; la Norvège et la Russie ont le pôle Nord dans leur cadre (grille de 360°).

Run: `npx vitest run --project data scripts/imagery`
Expected: `1 failed | 3 passed` — seul « les 197 pays » échoue (7 pays générés).

- [ ] **Step 6 : Génération complète (réseau, ≈ 1 h 20 — se lance en arrière-plan)**

Run: `npm run imagery`
Expected: une ligne par pays, puis `rapport-imagerie.md` : `197 pays ; 2048 px : 140335406 octets ; 1024 px : 21665916 octets` (au prototype) ; 394 fichiers dans `public/data/patches/img/` (167 Mo sur disque).

Run: `npx vitest run --project data scripts/imagery`
Expected: PASS — `Tests  4 passed (4)`.

- [ ] **Step 7 : Vérification complète**

Run: `npm run check`
Expected: `tsc` sans erreur ; `Tests  159 passed (159)` (152 + 7).

- [ ] **Step 8 : Commit (index et rapport ; les patchs restent hors dépôt)**

```bash
git status --short public/data/patches/img | head -1   # rien : le dossier est ignoré
git add ../.gitignore package.json scripts/imagery src/data/imagery.ts public/data/imagery.json
git commit -m "imagerie : patchs image Sentinel-2 des 197 pays (emprise de la vue d'arrivée, masque d'eau en alpha), index versionné"
```

---
### Task 4 : Patch image dans le shader de la Terre, chargé en jeu

**Files:**
- Create: `web/src/globe/frameNodes.ts`, `web/src/globe/imageLayer.ts`, `web/src/globe/imagePatch.ts`, `web/e2e/fixtures/make-quadrants.mjs`, `web/e2e/fixtures/quadrants.ktx2` (générée, versionnée)
- Modify: `web/src/globe/countryLayer.ts`, `web/src/globe/earth.ts`, `web/src/globe/globe.ts`, `web/src/globe/controller.ts`, `web/src/globe/GlobeView.tsx`, `web/src/probe/main.ts`
- Test: `web/src/globe/controller.test.ts`, `web/e2e/image-patch.spec.ts`, `web/e2e/image-flight.spec.ts`

**Interfaces:**
- Consumes: Task 3 — `ImageryIndex`, `imagePatchUrl` ; `tangentFrame(center)` (`patchFrame.ts`) ; `createPatchCache(load, dispose)` (`patchCache.ts`) ; `QualityTier` (`renderer.ts`).
- Produces: `interface FrameUniforms { center; east; north; extentRad }` ; `exactSpherePoint(): Node<'vec3'>` ; `frameXY(P, u): Node<'vec2'>` (demi-côtés, y vers le sud) ; `IMAGE_FEATHER = 0.15` ; `createImageLayer(P) → { uniforms: FrameUniforms & { opacity }, weight, color, sea, setTexture(t) }` ; `createEarthMaterial(t) → { material, base, image, setSun }` ; `Globe.setImagePatch(meta | null, tex | null, fadeSeconds = 0)` ; `IMAGE_FADE_S = 0.4` ; `interface ImageSource { size; load(url): Promise<Texture> }` ; `GlobeController.setImagery(index | null, source | null)` ; `imagePatchSize(tier)`, `loadImageryIndex(baseUrl): Promise<ImageryIndex | null>`, `createImageSource(renderer, tier, baseUrl) → ImageSource & { dispose() }` ; paramètre de sonde `img` (`img=1024` force la taille).

Le patch se lit au **point exact** de la sphère (comme le patch SDF depuis la 1A) : le calcul passe dans `frameNodes.ts`, partagé par les deux couches. Son poids vaut 1 au cœur, 0 hors du cadre et sur l'hémisphère opposé, avec un fondu sur les 15 % extérieurs ; il mêle la couleur **et** le masque d'eau (alpha) à ceux de la texture globale, avant l'éclairage.

- [ ] **Step 1 : Factoriser le point exact de la sphère et le cadre azimutal (sans changer le comportement)**

**Créer** `web/src/globe/frameNodes.ts` :

```ts
import type * as THREE from 'three/webgpu';
import { atan, cameraPosition, cross, dot, float, length, max, normalize, positionWorld, select, sqrt, vec2 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type UniformNode from 'three/src/nodes/core/UniformNode.js';

/** Repère tangent d'un cadre de patch (C, E, N) et son demi-côté en radians — voir le contrat de PatchMeta. */
export interface FrameUniforms {
  center: UniformNode<'vec3', THREE.Vector3>;
  east: UniformNode<'vec3', THREE.Vector3>;
  north: UniformNode<'vec3', THREE.Vector3>;
  extentRad: UniformNode<'float', number>;
}

/**
 * Point exact de la sphère unité sous le pixel (intersection du rayon de vue), et non le point de la facette : au cadrage
 * du Vatican, l'écart entre la facette (maillage 512×256) et la sphère atteint une vingtaine de texels.
 */
export function exactSpherePoint(): Node<'vec3'> {
  const rayDir = normalize(positionWorld.sub(cameraPosition));
  const b = dot(cameraPosition, rayDir);
  const c = dot(cameraPosition, cameraPosition).sub(1);
  return normalize(cameraPosition.add(rayDir.mul(b.negate().sub(sqrt(max(b.mul(b).sub(c), 0))))));
}

/** Coordonnées du point P dans le cadre, en demi-côtés (±1 au bord), y vers le SUD : x = k·(P·E), y = −k·(P·N), k = c / sin c. */
export function frameXY(P: Node<'vec3'>, u: FrameUniforms): Node<'vec2'> {
  const cosC = dot(P, u.center);
  const sinC = length(cross(P, u.center));
  const k = select(sinC.greaterThan(1e-7), atan(sinC, cosC).div(sinC), float(1));
  return vec2(k.mul(dot(P, u.east)), k.mul(dot(P, u.north)).negate()).div(u.extentRad);
}
```

**Modifier** `web/src/globe/countryLayer.ts` — remplacer :

```ts
import {
  abs, atan, cameraPosition, clamp, cross, dot, exp, float, fwidth, length, max, mix, normalize, positionWorld, select, sin,
  smoothstep, sqrt, texture, uniform, vec2, vec3, vec4, output,
} from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
```

par :

```ts
import { abs, clamp, exp, float, fwidth, length, max, mix, select, sin, smoothstep, texture, uniform, vec3, vec4, output } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import { exactSpherePoint, frameXY } from './frameNodes';
```

**Modifier** `web/src/globe/countryLayer.ts` — remplacer :

```ts
  // Point exact de la sphère unité sous le pixel (intersection du rayon de vue), et non le point de la facette :
  // au cadrage du Vatican, l'écart entre la facette (maillage 512×256) et la sphère atteint une vingtaine de texels.
  const rayDir = normalize(positionWorld.sub(cameraPosition));
  const b = dot(cameraPosition, rayDir);
  const c = dot(cameraPosition, cameraPosition).sub(1);
  const P = normalize(cameraPosition.add(rayDir.mul(b.negate().sub(sqrt(max(b.mul(b).sub(c), 0))))));
  const cosC = dot(P, u.center);
  const sinC = length(cross(P, u.center));
  const k = select(sinC.greaterThan(1e-7), atan(sinC, cosC).div(sinC), float(1));
  const uv = vec2(k.mul(dot(P, u.east)), k.mul(dot(P, u.north)).negate()).div(u.extentRad).add(1).mul(0.5);
```

par :

```ts
  const uv = frameXY(exactSpherePoint(), u).add(1).mul(0.5);
```

Run: `npx tsc --noEmit && npm run e2e -- e2e/patch.spec.ts`
Expected: aucune erreur de type ; `16 passed` (contrôles SDF inchangés sur les deux backends).

- [ ] **Step 2 : Écrire le test du contrôleur qui échoue**

**Créer** `web/src/globe/controller.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import type * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import type { ImageryIndex } from '../data/imagery';
import type { CountryRecord } from '../data/types';
import { GlobeController, IMAGE_FADE_S } from './controller';
import type { Globe } from './globe';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const by = (cca3: string) => countries.find((c) => c.cca3 === cca3)!;
const meta = (extentRad: number) => ({ center: [0, 0] as [number, number], extentRad, files: {} });
const index = { countries: { FRA: meta(0.5), JPN: meta(0.4), FJI: meta(0.3) } } as unknown as ImageryIndex;
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(load: (url: string) => Promise<THREE.Texture>) {
  const calls: [number | null, unknown, number | undefined][] = [];
  const globe = {
    setPatch() {}, setBeacon() {},
    setImagePatch(m: { extentRad: number } | null, t: unknown, fade?: number) { calls.push([m?.extentRad ?? null, t, fade]); },
  };
  const c = new GlobeController('/');
  c.attach(globe as unknown as Globe);
  const urls: string[] = [];
  c.setImagery(index, { size: 2048, load: (url) => { urls.push(url); return load(url); } });
  return { c, calls, urls };
}
const tex = (name: string, disposed: string[] = []) => ({ name, dispose: () => disposed.push(name) }) as unknown as THREE.Texture;

describe('patch image du pays visé (GlobeController)', () => {
  it('le vol demande le patch à la taille du niveau, puis le pose en fondu', async () => {
    const t = tex('fra');
    const { c, calls, urls } = setup(async () => t);
    void c.flyTo(by('FRA'));
    await flush();
    expect(urls).toEqual(['/data/patches/img/fra-2048.ktx2']);
    expect(calls.at(-1)).toEqual([0.5, t, IMAGE_FADE_S]);
  });

  it('patch en échec : retiré, et la manche continue (rien ne lève)', async () => {
    const { c, calls } = setup(async () => { throw new Error('404'); });
    void c.flyTo(by('FRA'));
    await flush();
    expect(calls.at(-1)).toEqual([null, null, IMAGE_FADE_S]);
  });

  it('pays absent de l’index (ou index absent) : aucune requête', async () => {
    const { c, urls, calls } = setup(async () => tex('x'));
    void c.flyTo(by('LUX'));
    await flush();
    expect(urls).toEqual([]);
    expect(calls.at(-1)![0]).toBeNull();
  });

  it('précharge le suivant ; ne garde que le courant et le suivant', async () => {
    const disposed: string[] = [];
    const { c, urls } = setup(async (url) => tex(url.split('/').pop()!.slice(0, 3), disposed));
    c.prefetch(by('JPN'));
    void c.flyTo(by('FRA'));
    await flush();
    expect(urls).toEqual(['/data/patches/img/jpn-2048.ktx2', '/data/patches/img/fra-2048.ktx2']);
    c.prefetch(by('FJI'));
    void c.flyTo(by('JPN'));
    await flush();
    expect(disposed).toEqual(['fra']);
  });
});
```

Run: `npx vitest run --project unit src/globe/controller.test.ts`
Expected: FAIL — `Tests  4 failed (4)` (`setImagery` et `IMAGE_FADE_S` n'existent pas).

- [ ] **Step 3 : Charger les patchs image dans le contrôleur**

**Modifier** `web/src/globe/controller.ts` — remplacer :

```ts
import type { CountryRecord } from '../data/types';
```

par :

```ts
import { imagePatchUrl, type ImageryIndex } from '../data/imagery';
import type { CountryRecord } from '../data/types';
```

**Modifier** `web/src/globe/controller.ts` — remplacer :

```ts
import type { RevealTimeline } from './reveal';
```

par :

```ts
import type { RevealTimeline } from './reveal';

/** Fondu d'apparition d'un patch image arrivé en cours de route. */
export const IMAGE_FADE_S = 0.4;

/** Chargeur des patchs image, fourni par la scène quand le renderer est prêt (KTX2 → format du GPU) ; taille selon le niveau. */
export interface ImageSource { size: number; load(url: string): Promise<THREE.Texture> }
```

**Modifier** `web/src/globe/controller.ts` — remplacer :

```ts
  private readonly cache = createPatchCache((sdf: string) => loadPatchTexture(`${this.baseUrl}data/${sdf}`), disposePatchTexture);
```

par :

```ts
  private readonly cache = createPatchCache((sdf: string) => loadPatchTexture(`${this.baseUrl}data/${sdf}`), disposePatchTexture);
  private imagery: ImageryIndex | null = null;
  private imageSource: ImageSource | null = null;
  private image: THREE.Texture | null = null;
  private readonly images = createPatchCache((url: string) => this.imageSource!.load(url), (t: THREE.Texture) => t.dispose());
```

**Modifier** `web/src/globe/controller.ts` — remplacer :

```ts
  setFraming(p: FramingParams): void {
```

par :

```ts
  /**
   * Index des patchs image et leur chargeur (null : pas de patch image, la texture globale suffit). Rappelé à chaque
   * recréation du renderer : les textures déjà chargées restent valables.
   */
  setImagery(index: ImageryIndex | null, source: ImageSource | null): void {
    this.imagery = index;
    this.imageSource = source;
    this.requestImage();
    this.apply();
  }

  setFraming(p: FramingParams): void {
```

**Modifier** `web/src/globe/controller.ts` — remplacer :

```ts
      () => { if (this.target === rec) { this.patchFailed = true; this.apply(); } },
    );
    this.apply();
```

par :

```ts
      () => { if (this.target === rec) { this.patchFailed = true; this.apply(); } },
    );
    this.image = null;
    this.requestImage();
    this.apply();
```

**Modifier** `web/src/globe/controller.ts` — remplacer :

```ts
  prefetch(rec: CountryRecord): void {
    this.next = rec;
    this.cache.get(rec.patch.sdf).catch(() => {});
  }
```

par :

```ts
  prefetch(rec: CountryRecord): void {
    this.next = rec;
    this.cache.get(rec.patch.sdf).catch(() => {});
    const url = this.imageUrl(rec);
    if (url) this.images.get(url).catch(() => {});
  }

  private imageUrl(rec: CountryRecord): string | null {
    return this.imagery?.countries[rec.cca3] && this.imageSource ? imagePatchUrl(this.baseUrl, rec.cca3, this.imageSource.size) : null;
  }

  /** Patch image du pays visé : un échec laisse la texture globale (spec §8 : la manche n'attend jamais un patch). */
  private requestImage(): void {
    const rec = this.target;
    if (!rec) return;
    const url = this.imageUrl(rec);
    if (!url) return;
    const nextUrl = this.next && this.next !== rec ? this.imageUrl(this.next) : null;
    this.images.keep(nextUrl ? [url, nextUrl] : [url]);
    this.images.get(url).then((t) => { if (this.target === rec) { this.image = t; this.apply(); } }, () => {});
  }
```

**Modifier** `web/src/globe/controller.ts` — remplacer :

```ts
    g.setPatch(rec && this.patch ? rec.patch : null, this.patch);
```

par :

```ts
    g.setPatch(rec && this.patch ? rec.patch : null, this.patch);
    const imageMeta = rec && this.image ? this.imagery?.countries[rec.cca3] ?? null : null;
    g.setImagePatch(imageMeta, imageMeta ? this.image : null, IMAGE_FADE_S);
```

Run: `npx vitest run --project unit src/globe/controller.test.ts`
Expected: la compilation de `controller.ts` échoue tant que `Globe.setImagePatch` n'existe pas (`tsc`), mais Vitest ne vérifie pas les types : `Tests  4 passed (4)`.

- [ ] **Step 4 : Écrire la fixture et les contrôles e2e qui échouent**

**Créer** `web/e2e/fixtures/make-quadrants.mjs` :

```js
// Génère e2e/fixtures/quadrants.ktx2 (versionné) : 64 × 64, NO rouge, NE vert, SO bleu, SE jaune, alpha 0 (terre).
// Même encodage que les patchs image (ETC1S sRGB, mipmaps, sans --lower_left_maps_to_s0t0). Exige toktx 4.x.
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import sharp from 'sharp';

const N = 64, rgba = Buffer.alloc(N * N * 4);
const colors = { nw: [230, 30, 30], ne: [30, 200, 40], sw: [30, 60, 230], se: [230, 210, 30] };
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const c = colors[`${y < N / 2 ? 'n' : 's'}${x < N / 2 ? 'w' : 'e'}`];
  rgba.set([...c, 0], (y * N + x) * 4);
}
const png = 'e2e/fixtures/quadrants.png';
await sharp(rgba, { raw: { width: N, height: N, channels: 4 } }).png().toFile(png);
const r = spawnSync('toktx', ['--t2', '--encode', 'etc1s', '--qlevel', '255', '--genmipmap', '--assign_oetf', 'srgb', 'e2e/fixtures/quadrants.ktx2', png], { stdio: 'inherit' });
rmSync(png);
process.exit(r.status ?? 1);
```

Run: `node e2e/fixtures/make-quadrants.mjs && ls -l e2e/fixtures/quadrants.ktx2`
Expected: un fichier d'environ 1 Ko (981 octets au prototype).

**Créer** `web/e2e/image-patch.spec.ts` :

```ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { makeProjector } from '../scripts/geodata/lib/patch';
import type { ImageryIndex } from '../src/data/imagery';
import type { LngLat } from '../src/data/types';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

const fra = (JSON.parse(readFileSync('public/data/imagery.json', 'utf8')) as ImageryIndex).countries.FRA!;
const quadrants = readFileSync('e2e/fixtures/quadrants.ktx2');
// Cadre de 4 × 4 « pixels » : (1,5 ; 1,5) est au cœur du quadrant nord-ouest, etc. (à ±¼ de demi-côté du centre, à l'écran)
const proj = makeProjector({ center: fra.center, extentRad: fra.extentRad, size: 4 });
const [nw, ne, sw, se] = [[1.5, 1.5], [2.5, 1.5], [1.5, 2.5], [2.5, 2.5]].map(([x, y]) => proj.toLngLat(x!, y!) as LngLat);

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test(`${backend} patch image : nord en haut, ouest à gauche (contrat de PatchMeta, sans retournement)`, async ({ page }) => {
    await page.route('**/data/patches/img/fra-*.ktx2', (r) => r.fulfill({ body: quadrants, contentType: 'image/ktx2' }));
    const s = await shoot(page, backend, 'mode=game&cca3=FRA&img=2048');
    const [a, b, c, d] = await s.at([nw!, ne!, sw!, se!]);
    console.log(backend, 'NO', JSON.stringify(a), 'NE', JSON.stringify(b), 'SO', JSON.stringify(c), 'SE', JSON.stringify(d));
    expect(a![0]).toBeGreaterThan(Math.max(a![1], a![2]) + 40); // rouge
    expect(b![1]).toBeGreaterThan(Math.max(b![0], b![2]) + 40); // vert
    expect(c![2]).toBeGreaterThan(Math.max(c![0], c![1]) + 40); // bleu
    expect(Math.min(d![0], d![1])).toBeGreaterThan(d![2] + 40); // jaune
  });

  test(`${backend} patch image absent (404) : la texture globale, sans erreur`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.route('**/data/patches/img/**', (r) => r.fulfill({ status: 404 }));
    const withImg = await shoot(page, backend, 'mode=game&cca3=FRA&img=2048');
    const [p] = await withImg.at([nw!]);
    const plain = await shoot(page, backend, 'mode=game&cca3=FRA');
    const [q] = await plain.at([nw!]);
    expect(errors).toEqual([]);
    expect(p).toEqual(q);
  });
}
```

**Créer** `web/e2e/image-flight.spec.ts` :

```ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { makeProjector } from '../scripts/geodata/lib/patch';
import type { ImageryIndex } from '../src/data/imagery';
import type { LngLat } from '../src/data/types';
import type { BackendName } from './sdf-check';

const fra = (JSON.parse(readFileSync('public/data/imagery.json', 'utf8')) as ImageryIndex).countries.FRA!;
const quadrants = readFileSync('e2e/fixtures/quadrants.ktx2');
const nw = makeProjector({ center: fra.center, extentRad: fra.extentRad, size: 4 }).toLngLat(1.5, 1.5) as LngLat;

for (const [backend, size] of [['webgpu', 2048], ['webgl2', 1024]] as [BackendName, number][]) {
  test.describe(backend, () => {
    test.use({ viewport: { width: 960, height: 600 } });
    test.slow(() => backend === 'webgl2' && !!process.env.CI, 'SwiftShader WebGL 2 lent en CI');

    test(`en jeu : le patch image du niveau (${size} texels) se fond à l’arrivée`, async ({ page }) => {
      const requested: string[] = [];
      await page.route('**/data/patches/img/*.ktx2', (r) => {
        requested.push(r.request().url().split('/').pop()!);
        return r.fulfill({ body: quadrants, contentType: 'image/ktx2' });
      });
      await page.goto(`/?demo=FRA${backend === 'webgl2' ? '&webgl' : ''}`);
      await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true);
      await page.waitForTimeout(800); // fondu de 0,4 s
      expect(requested).toEqual([`fra-${size}.ktx2`]);
      const p = await page.evaluate((b) => window.__globe!.project(b), nw);
      const png = PNG.sync.read(await page.screenshot());
      const i = (Math.floor(p![1]) * png.width + Math.floor(p![0])) * 4;
      const c = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
      console.log(backend, 'quadrant nord-ouest', JSON.stringify(c));
      expect(c[0]!).toBeGreaterThan(Math.max(c[1]!, c[2]!) + 40);
    });
  });
}
```

Run: `npm run e2e -- e2e/image-patch.spec.ts e2e/image-flight.spec.ts`
Expected: FAIL — l'orientation échoue sur les deux backends (la sonde ignore `img` : couleurs de la Terre), « absent (404) » passe déjà (même raison), `image-flight` échoue (`requested` vide).

- [ ] **Step 5 : La couche image dans la Terre et le globe**

**Créer** `web/src/globe/imageLayer.ts` :

```ts
import * as THREE from 'three/webgpu';
import { abs, dot, float, select, smoothstep, texture, uniform } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import { frameXY } from './frameNodes';

/** Largeur du fondu au bord du cadre, en demi-côtés : le patch se fond dans la texture globale sur ses 15 % extérieurs. */
export const IMAGE_FEATHER = 0.15;

/**
 * Patch image (Sentinel-2) lu au point exact P de la sphère, dans son propre cadre azimutal (contrat de PatchMeta, sans
 * retournement) : `weight` vaut 1 au cœur, 0 hors du cadre et sur l'hémisphère opposé ; `color` (sRGB décodé) et `sea`
 * (alpha : mer = 1, terre = 0) se mêlent à la texture globale et à son masque d'océan.
 */
export function createImageLayer(P: Node<'vec3'>) {
  const u = {
    center: uniform(new THREE.Vector3(1, 0, 0)),
    east: uniform(new THREE.Vector3(0, 0, -1)),
    north: uniform(new THREE.Vector3(0, 1, 0)),
    extentRad: uniform(0.1),
    /** 0 = aucun patch ; monte à 1 en fondu quand le patch arrive. */
    opacity: uniform(0),
  };
  const node = texture(new THREE.Texture());
  const xy = frameXY(P, u);
  const edge = (t: Node<'float'>) => smoothstep(float(1 - IMAGE_FEATHER), float(1), abs(t)).oneMinus();
  const front = select(dot(P, u.center).greaterThan(0), float(1), float(0));
  const weight = edge(xy.x).mul(edge(xy.y)).mul(front).mul(u.opacity);
  const sample = node.sample(xy.add(1).mul(0.5));
  return { uniforms: u, weight, color: sample.rgb, sea: sample.a, setTexture(t: THREE.Texture) { node.value = t; } };
}
```

**Modifier** `web/src/globe/earth.ts` — remplacer :

```ts
import type { Vec3 } from '../geo/vec';
import type { GlobeTextures } from './textures';
```

par :

```ts
import type { Vec3 } from '../geo/vec';
import { exactSpherePoint } from './frameNodes';
import { createImageLayer } from './imageLayer';
import type { GlobeTextures } from './textures';
```

**Modifier** `web/src/globe/earth.ts` — remplacer :

```ts
/** Terre en couches (spec §4.2) : jour, relief, océan (rugosité, reflet du soleil), lumières de la face nocturne. */
export function createEarthMaterial(t: GlobeTextures): { material: THREE.MeshStandardNodeMaterial; base: Node<'vec4'>; setSun(dir: Vec3): void } {
  const sun = uniform(new THREE.Vector3(1, 0, 0));
  const material = new THREE.MeshStandardNodeMaterial();
  // L'océan profond de Blue Marble est un bleu uniforme presque noir : on le relève très légèrement (masque G).
  material.colorNode = texture(t.day).rgb.add(vec3(0.0, 0.012, 0.035).mul(texture(t.surface).g));
  material.normalNode = bumpMap(texture(t.surface), float(BUMP_SCALE));
  material.roughnessNode = mix(float(0.92), float(0.55), texture(t.surface).g);
```

par :

```ts
/**
 * Terre en couches (spec §4.2) : jour (Sentinel-2, précisé par le patch image du pays visé), relief, océan (rugosité,
 * reflet du soleil), lumières de la face nocturne.
 */
export function createEarthMaterial(t: GlobeTextures) {
  const sun = uniform(new THREE.Vector3(1, 0, 0));
  const material = new THREE.MeshStandardNodeMaterial();
  const image = createImageLayer(exactSpherePoint());
  // Mer (1) / terre (0) : masque de la texture de surface (4K), précisé par l'alpha du patch image là où il est
  // (agrandi ×7 au cadrage d'un petit pays, le masque 4K dessinait des côtes en escalier dans le reflet du soleil).
  const sea = mix(texture(t.surface).g, image.sea, image.weight);
  // L'océan profond est très sombre : on le relève très légèrement.
  material.colorNode = mix(texture(t.day).rgb, image.color, image.weight).add(vec3(0.0, 0.012, 0.035).mul(sea));
  material.normalNode = bumpMap(texture(t.surface), float(BUMP_SCALE));
  material.roughnessNode = mix(float(0.92), float(0.55), sea);
```

**Modifier** `web/src/globe/earth.ts` — remplacer :

```ts
  return { material, base, setSun(dir) { sun.value.set(...dir); } };
```

par :

```ts
  return { material, base: base as Node<'vec4'>, image, setSun(dir: Vec3) { sun.value.set(...dir); } };
```

**Modifier** `web/src/globe/globe.ts` — remplacer :

```ts
import { createEarthMaterial } from './earth';
```

par :

```ts
import { createEarthMaterial } from './earth';
import type { createImageLayer } from './imageLayer';
```

**Modifier** `web/src/globe/globe.ts` — remplacer :

```ts
  private hasPatch = false;
```

par :

```ts
  private hasPatch = false;
  /** Patch image (mode jeu) ; `null` en mode masque. */
  private readonly image: ReturnType<typeof createImageLayer> | null = null;
  private imageTexture: THREE.Texture | null = null;
  private imageFade: { seconds: number; since: number | null } = { seconds: 0, since: null };
```

**Modifier** `web/src/globe/globe.ts` — remplacer :

```ts
      this.earthMaterial = earth.material;
```

par :

```ts
      this.earthMaterial = earth.material;
      this.image = earth.image;
```

**Modifier** `web/src/globe/globe.ts` — remplacer :

```ts
  setLook(look: CountryLook): void {
```

par :

```ts
  /**
   * Patch image du pays visé (Sentinel-2), fondu sur la texture globale ; `null` le retire (absent, en échec, autre pays).
   * Un nouveau patch apparaît en `fadeSeconds` (horloge de `setTime`) ; le même patch redonné ne relance pas le fondu.
   */
  setImagePatch(meta: { center: LngLat; extentRad: number } | null, tex: THREE.Texture | null, fadeSeconds = 0): void {
    const img = this.image;
    if (!img) return;
    if (!meta || !tex) { this.imageTexture = null; img.uniforms.opacity.value = 0; return; }
    if (tex === this.imageTexture) return;
    this.imageTexture = tex;
    const f = tangentFrame(meta.center);
    img.uniforms.center.value.set(...f.center);
    img.uniforms.east.value.set(...f.east);
    img.uniforms.north.value.set(...f.north);
    img.uniforms.extentRad.value = meta.extentRad;
    img.setTexture(tex);
    this.imageFade = { seconds: fadeSeconds, since: null };
    img.uniforms.opacity.value = fadeSeconds > 0 ? 0 : 1;
  }

  setLook(look: CountryLook): void {
```

**Modifier** `web/src/globe/globe.ts` — remplacer :

```ts
  setTime(seconds: number): void { this.beacon.setTime(seconds); }
```

par :

```ts
  setTime(seconds: number): void {
    this.beacon.setTime(seconds);
    const f = this.imageFade;
    if (this.image && this.imageTexture && f.seconds > 0) {
      f.since ??= seconds;
      this.image.uniforms.opacity.value = Math.min(1, (seconds - f.since) / f.seconds);
    }
  }
```

- [ ] **Step 6 : Le chargeur KTX2 des patchs, dans la vue du jeu et dans la sonde**

**Créer** `web/src/globe/imagePatch.ts` :

```ts
import * as THREE from 'three/webgpu';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { ImageryIndex } from '../data/imagery';
import type { ImageSource } from './controller';
import type { QualityTier } from './renderer';

/** Spec §4.1 : patch image de 2048 texels en « haute », 1024 en « standard ». */
export const imagePatchSize = (tier: QualityTier): number => (tier === 'haute' ? 2048 : 1024);

/** Index des patchs image ; absent ou illisible → `null` : le jeu garde la texture globale (les patchs sont hors dépôt). */
export async function loadImageryIndex(baseUrl = '/'): Promise<ImageryIndex | null> {
  try {
    const r = await fetch(`${baseUrl}data/imagery.json`);
    return r.ok ? ((await r.json()) as ImageryIndex) : null;
  } catch {
    return null;
  }
}

/** Chargeur KTX2 des patchs image pour ce renderer (detectSupport exige `await renderer.init()`, fait par createRenderer). */
export function createImageSource(renderer: THREE.WebGPURenderer, tier: QualityTier, baseUrl = '/'): ImageSource & { dispose(): void } {
  const loader = new KTX2Loader().setTranscoderPath(`${baseUrl}basis/`).detectSupport(renderer);
  return {
    size: imagePatchSize(tier),
    async load(url) {
      const t = await loader.loadAsync(url);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8; // avant le premier rendu : l'échantillonneur se construit à ce moment-là
      return t;
    },
    dispose: () => loader.dispose(),
  };
}
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
import { createRenderer, qualityTier, type Backend, type QualityTier } from './renderer';
```

par :

```tsx
import { createImageSource, loadImageryIndex } from './imagePatch';
import { createRenderer, qualityTier, type Backend, type QualityTier } from './renderer';
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
  useEffect(() => { controller.setViewport({ width: size.width, height: size.height, fovYDeg: FOV_Y_DEG }); }, [controller, size.width, size.height]);
```

par :

```tsx
  // Patchs image (Sentinel-2) : facultatifs — sans index ni fichier, la texture globale suffit.
  useEffect(() => {
    let alive = true;
    const source = createImageSource(renderer, renderer.userData.tier);
    void loadImageryIndex().then((index) => { if (alive) controller.setImagery(index, source); });
    return () => {
      alive = false;
      controller.setImagery(null, null);
      source.dispose();
    };
  }, [renderer, controller]);

  useEffect(() => { controller.setViewport({ width: size.width, height: size.height, fovYDeg: FOV_Y_DEG }); }, [controller, size.width, size.height]);
```

**Modifier** `web/src/probe/main.ts` — remplacer :

```ts
import { loadGlobeTextures } from '../globe/textures';
```

par :

```ts
import { loadGlobeTextures } from '../globe/textures';
import { createImageSource, loadImageryIndex } from '../globe/imagePatch';
import { imagePatchUrl } from '../data/imagery';
```

**Modifier** `web/src/probe/main.ts` — remplacer :

```ts
 * - `k`, `margin`, `ctx` (θ_min) : cadrage autre que celui du jeu (contrôles de précision à cadrage serré).
```

par :

```ts
 * - `k`, `margin`, `ctx` (θ_min) : cadrage autre que celui du jeu (contrôles de précision à cadrage serré) ;
 * - `img` (avec `cca3`, mode jeu) : patch image du pays, à la taille du niveau (`img`) ou forcée (`img=1024`).
```

**Modifier** `web/src/probe/main.ts` — remplacer :

```ts
  globe.setPatch(rec.patch, await loadPatchTexture(`/data/${rec.patch.sdf}`));
```

par :

```ts
  globe.setPatch(rec.patch, await loadPatchTexture(`/data/${rec.patch.sdf}`));
  if (q.has('img') && mode === 'game') {
    const meta = (await loadImageryIndex())?.countries[rec.cca3];
    const source = createImageSource(renderer, q.get('tier') === 'haute' ? 'haute' : 'standard');
    const size = q.get('img') ? Number(q.get('img')) : source.size;
    // Patch absent (404) : on garde la texture globale, comme le jeu.
    const tex = meta ? await source.load(imagePatchUrl('/', rec.cca3, size)).catch(() => null) : null;
    source.dispose();
    globe.setImagePatch(meta ?? null, tex);
  }
```

- [ ] **Step 7 : Relancer les contrôles**

Run: `npx tsc --noEmit && npm run e2e -- e2e/image-patch.spec.ts e2e/image-flight.spec.ts`
Expected: `6 passed` ; journal `NO [192,55,65] NE [44,154,62] SO [44,63,175] SE [150,141,52]` sur les deux backends, `quadrant nord-ouest [192,55,65]` en jeu (2048 texels demandés en WebGPU, 1024 en WebGL 2).

Preuve que le test d'orientation mord : remplacer temporairement dans `imageLayer.ts` `node.sample(xy.add(1).mul(0.5))` par `node.sample(vec2(xy.x, xy.y.negate()).add(1).mul(0.5))` (importer `vec2`) → les deux tests d'orientation échouent (NO bleu, SO rouge) ; restaurer le fichier.

- [ ] **Step 8 : Vérification complète et regard sur de vrais patchs**

Run: `npm run check`
Expected: `Tests  163 passed (163)` (159 + 4).

Avec les patchs générés à la Task 3 : `probe.html?cca3=FJI&mode=game&tier=haute&img&w=800&h=500` et `cca3=NOR` — aucune couture, ni à l'antiméridien ni avec le pôle dans le cadre (vérifié au prototype).

- [ ] **Step 9 : Commit**

```bash
git add src/globe src/probe e2e/fixtures e2e/image-patch.spec.ts e2e/image-flight.spec.ts
git commit -m "globe : patch image Sentinel-2 au point exact de la sphère (couleur et masque d'eau fondus), chargé par le contrôleur selon le niveau"
```

---
### Task 5 : Crédit de l'imagerie visible dans la vue du globe

**Files:**
- Create: `web/src/globe/credits.tsx`
- Modify: `web/src/globe/GlobeView.tsx`
- Test: `web/src/globe/credits.test.ts`, `web/e2e/credit.spec.ts`

**Interfaces:**
- Consumes: Task 1 — `EOX.attribution` (le test unitaire lie les deux chaînes).
- Produces: `eoxAttribution(): string` ; `<ImageryCredit />` (pied de page `role="contentinfo"`, `aria-label="Crédits de l’imagerie"`).

Spec §9 : l'attribution est obligatoire, visible dans l'interface de la carte, mot pour mot. La texture de jour étant Sentinel-2 partout, le crédit est **toujours** affiché dans la vue du globe ; les crédits NASA iront sur la page « Crédits » (phase 2).

- [ ] **Step 1 : Écrire les tests qui échouent**

**Créer** `web/src/globe/credits.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { EOX } from '../../scripts/imagery/config';
import { eoxAttribution } from './credits';

describe('crédit de l’imagerie', () => {
  it('l’interface affiche l’attribution du pipeline, mot pour mot (spec §9)', () => {
    expect(eoxAttribution()).toBe(EOX.attribution);
  });
});
```

**Créer** `web/e2e/credit.spec.ts` :

```ts
import { expect, test } from '@playwright/test';

// Spec §9 : l'attribution EOX est visible dans l'interface de la carte, mot pour mot, avec un lien vers la source.
const ATTRIBUTION = 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)';

test('le crédit de l’imagerie est visible dans la vue du globe, mot pour mot', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?webgl');
  const credit = page.getByRole('contentinfo', { name: 'Crédits de l’imagerie' });
  await expect(credit).toBeVisible({ timeout: 120_000 });
  await expect(credit).toContainText(ATTRIBUTION);
  await expect(credit.getByRole('link', { name: 'https://cloudless.eox.at' })).toHaveAttribute('href', 'https://cloudless.eox.at');
  const box = (await credit.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390); // tient dans un écran de téléphone
});
```

Run: `npx vitest run --project unit src/globe/credits.test.ts` puis `npm run e2e -- e2e/credit.spec.ts`
Expected: FAIL — `./credits` introuvable ; en e2e, `element(s) not found` pour `getByRole('contentinfo', { name: 'Crédits de l’imagerie' })`.

- [ ] **Step 2 : Écrire le crédit et l'afficher**

**Créer** `web/src/globe/credits.tsx` :

```tsx
/** Spec §9 : attribution EOX mot pour mot (https://cloudless.eox.at/license-non-commercial, lu le 02/10/2026), lien compris. */
const EOX_CREDIT = {
  before: 'EOxCloudless ',
  url: 'https://cloudless.eox.at',
  after: ' by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)',
} as const;

export const eoxAttribution = (): string => `${EOX_CREDIT.before}${EOX_CREDIT.url}${EOX_CREDIT.after}`;

/** Crédit de l'imagerie, toujours visible dans la vue du globe (la texture de jour est Sentinel-2 partout). */
export function ImageryCredit() {
  return (
    <footer
      role="contentinfo"
      aria-label="Crédits de l’imagerie"
      style={{
        position: 'absolute', right: 8, bottom: 'calc(4px + env(safe-area-inset-bottom, 0px))', maxWidth: 'calc(100% - 16px)',
        font: '10px/1.3 sans-serif', color: 'rgba(255, 255, 255, 0.7)', textAlign: 'right', textShadow: '0 0 2px #000',
      }}
    >
      {EOX_CREDIT.before}
      <a href={EOX_CREDIT.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{EOX_CREDIT.url}</a>
      {EOX_CREDIT.after}
    </footer>
  );
}
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
import { createImageSource, loadImageryIndex } from './imagePatch';
```

par :

```tsx
import { ImageryCredit } from './credits';
import { createImageSource, loadImageryIndex } from './imagePatch';
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
        <style>{'@keyframes countrizz-cut { from { opacity: 1 } to { opacity: 0 } }'}</style>
```

par :

```tsx
        <ImageryCredit />
        <style>{'@keyframes countrizz-cut { from { opacity: 1 } to { opacity: 0 } }'}</style>
```

- [ ] **Step 3 : Relancer**

Run: `npx vitest run --project unit src/globe/credits.test.ts && npm run e2e -- e2e/credit.spec.ts`
Expected: `Tests  1 passed (1)` ; `1 passed` (crédit visible, texte exact, lien `https://cloudless.eox.at`, tient dans 390 px).

Run: `npm run check`
Expected: `Tests  164 passed (164)`.

- [ ] **Step 4 : Commit**

```bash
git add src/globe/credits.tsx src/globe/credits.test.ts src/globe/GlobeView.tsx e2e/credit.spec.ts
git commit -m "globe : crédit EOxCloudless 2025 toujours visible dans la vue du globe (spec §9)"
```

---
### Task 6 : Nuages — dérive, ombre, effacement à l'arrivée

**Files:**
- Create: `web/src/globe/clouds.ts`
- Modify: `web/scripts/textures/config.ts`, `web/scripts/textures/build-textures.ts`, `web/src/globe/textures.ts`, `web/src/globe/earth.ts`, `web/src/globe/globe.ts`, `web/src/globe/controller.ts`, `web/src/globe/GlobeView.tsx`, `web/src/probe/main.ts`
- Test: `web/scripts/textures/__tests__/data/textures.test.ts`, `web/src/globe/clouds.test.ts`, `web/src/globe/globe.test.ts`, `web/e2e/clouds.spec.ts`
- Sorties : `web/public/textures/clouds-4k.ktx2`, `credits.json` (5 couches), verrou et rapport des textures

**Interfaces:**
- Consumes: Task 4 — `createEarthMaterial`, `GlobeController` (constructeur `(baseUrl, reducedMotion)`).
- Produces: `CLOUD_FADE_MS = 800`, `CLOUD_DRIFT_TURNS_PER_S = 1 / 1800` ; `interface CloudFade { from; to; atMs }` ; `cloudOpacity(fade, nowMs): number` ; `createClouds(tex) → { coverageAt(uv): Node<'float'>, set(opacity, driftTurns) }` ; `GlobeTextures.clouds: Texture | null` (facultatif) ; `createEarthMaterial(t, clouds = null)` ; `Globe.setClouds(opacity, driftTurns)` ; `GlobeController(baseUrl, reducedMotion, clock = () => performance.now())`, `readonly reducedMotion`, `cloudOpacityAt(nowMs)` ; `GlobeDebug.cloudOpacity` ; paramètre de sonde `clouds=x` (0 par défaut : les contrôles existants restent sans nuages).

Les nuages sont une couche **du matériau de la Terre**, pas une coque transparente au-dessus du globe : la coque (essayée au prototype) écrasait la cible `emissive` du rendu multiple et le bloom des villes disparaissait (Task 7). À 25 km d'altitude, la parallaxe qu'elle apportait est invisible au cadrage du jeu. Blancs et mats, ils assombrissent le sol à leurs bords (ombre à l'aplomb) et voilent les lumières des villes ; ils dérivent vers l'est (pas en mouvement réduit) et s'effacent en 800 ms à l'arrivée sur un pays (spec §4.2).

- [ ] **Step 1 : Écrire les tests qui échouent (données, unitaires)**

**Modifier** `web/scripts/textures/__tests__/data/textures.test.ts` — remplacer :

```ts
  { name: 'surface-4k.ktx2', width: 4096, supercompression: 2 },
];
```

par :

```ts
  { name: 'surface-4k.ktx2', width: 4096, supercompression: 2 },
  { name: 'clouds-4k.ktx2', width: 4096, supercompression: 1 },
];
```

**Modifier** `web/scripts/textures/__tests__/data/textures.test.ts` — remplacer :

```ts
    expect(size('day-4k.ktx2') + size('night-4k.ktx2') + size('surface-4k.ktx2')).toBeLessThanOrEqual(BUDGET_BYTES.standard);
    expect(size('day-8k.ktx2') + size('night-8k.ktx2') + size('surface-4k.ktx2')).toBeLessThanOrEqual(BUDGET_BYTES.haute);
  });
  it('publie les crédits des quatre couches', () => {
    expect(JSON.parse(readFileSync(path.join(TEX_OUT_DIR, 'credits.json'), 'utf8'))).toHaveLength(4);
  });
```

par :

```ts
    expect(size('day-4k.ktx2') + size('night-4k.ktx2') + size('surface-4k.ktx2') + size('clouds-4k.ktx2')).toBeLessThanOrEqual(BUDGET_BYTES.standard);
    expect(size('day-8k.ktx2') + size('night-8k.ktx2') + size('surface-4k.ktx2') + size('clouds-4k.ktx2')).toBeLessThanOrEqual(BUDGET_BYTES.haute);
  });
  it('publie les crédits des cinq couches', () => {
    expect((JSON.parse(readFileSync(path.join(TEX_OUT_DIR, 'credits.json'), 'utf8')) as { layer: string }[]).map((c) => c.layer)).toEqual(['jour', 'nuit', 'relief', 'océans', 'nuages']);
  });
```

**Créer** `web/src/globe/clouds.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { CLOUD_FADE_MS, cloudOpacity } from './clouds';
import { GlobeController } from './controller';
import type { Globe } from './globe';

describe('opacité des nuages (spec §4.2 : ils s’effacent à l’arrivée sur un pays)', () => {
  it('fondu lissé d’une valeur à l’autre, puis constant', () => {
    const f = { from: 1, to: 0, atMs: 1000 };
    expect(cloudOpacity(f, 1000)).toBe(1);
    expect(cloudOpacity(f, 1000 + CLOUD_FADE_MS / 2)).toBeCloseTo(0.5, 9);
    expect(cloudOpacity(f, 1000 + CLOUD_FADE_MS)).toBe(0);
    expect(cloudOpacity(f, 99_999)).toBe(0);
  });

  it('le contrôleur les efface à l’arrivée et les rend au vol suivant, sans saut', async () => {
    let now = 0;
    const fra = (JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[]).find((c) => c.cca3 === 'FRA')!;
    const c = new GlobeController('/', false, () => now);
    c.attach({ setPatch() {}, setBeacon() {}, setImagePatch() {} } as unknown as Globe);
    expect(c.cloudOpacityAt(now)).toBe(1);
    const flight = c.flyTo(fra);
    c.director.update(0);
    now = 10_000;
    c.director.update(now);
    await flight;
    expect(c.cloudOpacityAt(now)).toBe(1);
    expect(c.cloudOpacityAt(now + CLOUD_FADE_MS)).toBe(0);
    now += 2 * CLOUD_FADE_MS;
    void c.flyTo(fra);
    expect(c.cloudOpacityAt(now)).toBe(0);
    expect(c.cloudOpacityAt(now + CLOUD_FADE_MS)).toBe(1);
  });
});
```

**Modifier** `web/src/globe/globe.test.ts` — remplacer :

```ts
    const textures = { day: new THREE.Texture(), night: new THREE.Texture(), surface: new THREE.Texture() };
```

par :

```ts
    const textures = { day: new THREE.Texture(), night: new THREE.Texture(), surface: new THREE.Texture(), clouds: new THREE.Texture() };
```

Run: `npx vitest run --project data scripts/textures` puis `npx vitest run --project unit src/globe/clouds.test.ts`
Expected: données — `3 failed | 6 passed` (`clouds-4k.ktx2 absent`, budget, crédits) ; unitaires — `./clouds` introuvable.

- [ ] **Step 2 : Les nuages dans le pipeline de textures (réseau : un fichier NASA de 35 Mo, déjà en cache sur le poste)**

**Modifier** `web/scripts/textures/config.ts` — remplacer :

```ts
  elevation: { url: 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/topography/gebco_08_rev_elev_21600x10800.tif', file: 'gebco08-elev-21600.tif', bytes: 233_345_166 },
```

par :

```ts
  elevation: { url: 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/topography/gebco_08_rev_elev_21600x10800.tif', file: 'gebco08-elev-21600.tif', bytes: 233_345_166 },
  /** Nuages de Blue Marble (8192 × 4096, couverture en luminance) ; hôte sans page vivante, HEAD vérifié le 02/10/2026. */
  clouds: { url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_8192.tif', file: 'clouds-8192.tif', bytes: 35_870_468 },
```

**Modifier** `web/scripts/textures/config.ts` — remplacer :

```ts
export const SURFACE_SIZE = 4096;
```

par :

```ts
export const SURFACE_SIZE = 4096;
/** Nuages : 4096 × 2048 suffisent à des formes douces ; ETC1S linéaire (1 283 240 octets au prototype ; UASTC : 7 820 074). */
export const CLOUDS_SIZE = 4096;
```

**Modifier** `web/scripts/textures/config.ts` — remplacer :

```ts
  { layer: 'océans', text: 'Masque terre/mer dérivé de Natural Earth (domaine public).' },
```

par :

```ts
  { layer: 'océans', text: 'Masque terre/mer dérivé de Natural Earth (domaine public).' },
  { layer: 'nuages', text: 'Blue Marble: Clouds, NASA Earth Observatory (Reto Stöckli).' },
```

**Modifier** `web/scripts/textures/build-textures.ts` — remplacer :

```ts
import { BUDGET_BYTES, COLOR_SIZES, CREDITS, DAY_S2, SURFACE_SIZE, TEXTURE_SOURCES } from './config';
```

par :

```ts
import { BUDGET_BYTES, CLOUDS_SIZE, COLOR_SIZES, CREDITS, DAY_S2, SURFACE_SIZE, TEXTURE_SOURCES } from './config';
```

**Modifier** `web/scripts/textures/build-textures.ts` — remplacer :

```ts
async function main(): Promise<void> {
```

par :

```ts
/** Nuages : couverture (luminance du canal R) en un canal, ETC1S linéaire, mipmaps, origine en bas à gauche. */
async function cloudsTexture(size: number): Promise<string> {
  const png = path.join(TMP, `clouds-${size}.png`);
  await sharp(source('clouds'), { limitInputPixels: false }).extractChannel(0).resize(size, size / 2, { kernel: 'lanczos3' }).toColourspace('b-w').png({ compressionLevel: 6 }).toFile(png);
  const name = outName('clouds', size);
  toktx(['--t2', '--encode', 'etc1s', '--clevel', '2', '--qlevel', '128', '--genmipmap', '--assign_oetf', 'linear', '--lower_left_maps_to_s0t0', path.join(TEX_OUT_DIR, name), png]);
  return name;
}

async function main(): Promise<void> {
```

**Modifier** `web/scripts/textures/build-textures.ts` — remplacer :

```ts
  names.push(await surfaceTexture(SURFACE_SIZE));
```

par :

```ts
  names.push(await surfaceTexture(SURFACE_SIZE));
  names.push(await cloudsTexture(CLOUDS_SIZE));
```

**Modifier** `web/scripts/textures/build-textures.ts` — remplacer :

```ts
  const tier = (s: string) => bytes[`day-${s}.ktx2`]! + bytes[`night-${s}.ktx2`]! + bytes['surface-4k.ktx2']!;
```

par :

```ts
  const tier = (s: string) => bytes[`day-${s}.ktx2`]! + bytes[`night-${s}.ktx2`]! + bytes['surface-4k.ktx2']! + bytes['clouds-4k.ktx2']!;
```

**Modifier** `web/scripts/textures/build-textures.ts` — remplacer :

```ts
    `- Niveau « standard » (day-4k + night-4k + surface-4k) : ${tier('4k')} octets (budget ${BUDGET_BYTES.standard})`,
    `- Niveau « haute » (day-8k + night-8k + surface-4k) : ${tier('8k')} octets (budget ${BUDGET_BYTES.haute})`, '',
```

par :

```ts
    `- Niveau « standard » (day-4k + night-4k + surface-4k + clouds-4k) : ${tier('4k')} octets (budget ${BUDGET_BYTES.standard})`,
    `- Niveau « haute » (day-8k + night-8k + surface-4k + clouds-4k) : ${tier('8k')} octets (budget ${BUDGET_BYTES.haute})`, '',
```

Run: `npm run textures:fetch && npm run textures`
Expected: `clouds : 35870468 octets` (empreinte `d137775d8966ab8d443fd5126dc6e7ad72072bc1ed50555c5818d221735daf0f`), `s2day : 2 requêtes, …` ; rapport avec `clouds-4k.ktx2 | 1283240`, « standard » 4746044 octets, « haute » 8321977.

Run: `npx vitest run --project data scripts/textures`
Expected: PASS — `Tests  9 passed (9)`.

- [ ] **Step 3 : La couche de nuages, chargée sans être obligatoire**

**Créer** `web/src/globe/clouds.ts` :

```ts
import type * as THREE from 'three/webgpu';
import { texture, uniform, vec2 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';

/** Effacement des nuages à l'arrivée sur un pays, et retour au vol suivant. */
export const CLOUD_FADE_MS = 800;
/** Dérive vers l'est, en tours par seconde (un tour en 30 min : perceptible au repos, imperceptible pendant une question). */
export const CLOUD_DRIFT_TURNS_PER_S = 1 / 1800;

export interface CloudFade { from: number; to: number; atMs: number }

/** Opacité à l'instant `nowMs` : de `from` à `to` en CLOUD_FADE_MS (courbe lissée), puis constante. */
export function cloudOpacity(f: CloudFade, nowMs: number): number {
  const t = Math.min(1, Math.max(0, (nowMs - f.atMs) / CLOUD_FADE_MS));
  return f.from + (f.to - f.from) * t * t * (3 - 2 * t);
}

/**
 * Nuages (spec §4.2) : couche séparée — leur texture, leur dérive, leur opacité — lue DANS le matériau de la Terre.
 * Une coque transparente au-dessus du globe écrasait la cible « émissif » du rendu multiple et éteignait le bloom des
 * villes (constaté le 03/10) ; à 25 km d'altitude, la parallaxe qu'elle apportait est invisible au cadrage du jeu.
 */
export function createClouds(tex: THREE.Texture) {
  const opacity = uniform(1), drift = uniform(0);
  return {
    /** Couverture (0 → 1) au point de coordonnées sphériques `u` ; la dérive décale la lecture vers l'ouest : le motif avance vers l'est. */
    coverageAt: (u: Node<'vec2'>) => texture(tex, u.sub(vec2(drift, 0))).r.mul(opacity),
    set(o: number, d: number) { opacity.value = o; drift.value = d; },
  };
}
```

**Modifier** `web/src/globe/textures.ts` — remplacer :

```ts
export interface GlobeTextures { day: THREE.Texture; night: THREE.Texture; surface: THREE.Texture }

export function disposeGlobeTextures(t: GlobeTextures): void {
  t.day.dispose();
  t.night.dispose();
  t.surface.dispose();
}

/** Textures globales KTX2 (pipeline scripts/textures) : 8K en « haute », 4K en « standard » ; surface toujours en 4K. */
```

par :

```ts
/** `clouds` est facultatif : sans lui (fichier absent), le globe se dessine sans nuages. */
export interface GlobeTextures { day: THREE.Texture; night: THREE.Texture; surface: THREE.Texture; clouds: THREE.Texture | null }

export function disposeGlobeTextures(t: GlobeTextures): void {
  t.day.dispose();
  t.night.dispose();
  t.surface.dispose();
  t.clouds?.dispose();
}

/** Textures globales KTX2 (pipeline scripts/textures) : 8K en « haute », 4K en « standard » ; surface et nuages toujours en 4K. */
```

**Modifier** `web/src/globe/textures.ts` — remplacer :

```ts
  let loaded: THREE.Texture[];
  try {
    loaded = await Promise.all([
      loader.loadAsync(`${base}textures/day-${size}.ktx2`),
      loader.loadAsync(`${base}textures/night-${size}.ktx2`),
      loader.loadAsync(`${base}textures/surface-4k.ktx2`),
    ]);
  } finally {
    loader.dispose();
  }
  const [day, night, surface] = loaded as [THREE.Texture, THREE.Texture, THREE.Texture];
```

par :

```ts
  let loaded: [THREE.Texture, THREE.Texture, THREE.Texture, THREE.Texture | null];
  try {
    loaded = await Promise.all([
      loader.loadAsync(`${base}textures/day-${size}.ktx2`),
      loader.loadAsync(`${base}textures/night-${size}.ktx2`),
      loader.loadAsync(`${base}textures/surface-4k.ktx2`),
      loader.loadAsync(`${base}textures/clouds-4k.ktx2`).catch(() => null),
    ]);
  } finally {
    loader.dispose();
  }
  const [day, night, surface, clouds] = loaded;
```

**Modifier** `web/src/globe/textures.ts` — remplacer :

```ts
  for (const t of [day, night, surface]) t.anisotropy = 8;
  return { day, night, surface };
```

par :

```ts
  for (const t of [day, night, surface]) t.anisotropy = 8;
  if (clouds) {
    clouds.colorSpace = THREE.NoColorSpace;
    clouds.wrapS = THREE.RepeatWrapping; // la dérive fait sortir la lecture de [0, 1] en longitude
    clouds.anisotropy = 8;
  }
  return { day, night, surface, clouds };
```

**Modifier** `web/src/globe/earth.ts` — remplacer :

```ts
import { abs, bumpMap, cameraPosition, clamp, dot, float, mix, normalize, normalWorld, output, positionWorld, pow, smoothstep, texture, uniform, vec3, vec4 } from 'three/tsl';
```

par :

```ts
import { abs, bumpMap, cameraPosition, clamp, dot, float, mix, normalize, normalWorld, output, positionWorld, pow, smoothstep, texture, uniform, uv, vec3, vec4 } from 'three/tsl';
```

**Modifier** `web/src/globe/earth.ts` — remplacer :

```ts
import { createImageLayer } from './imageLayer';
import type { GlobeTextures } from './textures';
```

par :

```ts
import { createImageLayer } from './imageLayer';
import type { createClouds } from './clouds';
import type { GlobeTextures } from './textures';
```

**Modifier** `web/src/globe/earth.ts` — remplacer :

```ts
export function createEarthMaterial(t: GlobeTextures) {
```

par :

```ts
export function createEarthMaterial(t: GlobeTextures, clouds: ReturnType<typeof createClouds> | null = null) {
```

**Modifier** `web/src/globe/earth.ts` — remplacer :

```ts
  // L'océan profond est très sombre : on le relève très légèrement.
  material.colorNode = mix(texture(t.day).rgb, image.color, image.weight).add(vec3(0.0, 0.012, 0.035).mul(sea));
  material.normalNode = bumpMap(texture(t.surface), float(BUMP_SCALE));
  material.roughnessNode = mix(float(0.92), float(0.55), sea);
```

par :

```ts
  // L'océan profond est très sombre : on le relève très légèrement.
  // Nuages : blancs et mats par-dessus le sol ; leur ombre (à l'aplomb, sans décalage vers le soleil) assombrit les bords
  // effilochés ; ils voilent les lumières des villes.
  const cover = clouds ? clouds.coverageAt(uv()) : float(0);
  const ground = mix(texture(t.day).rgb, image.color, image.weight).add(vec3(0.0, 0.012, 0.035).mul(sea)).mul(cover.mul(0.35).oneMinus());
  material.colorNode = mix(ground, vec3(0.92, 0.92, 0.92), cover);
  material.normalNode = bumpMap(texture(t.surface), float(BUMP_SCALE));
  material.roughnessNode = mix(mix(float(0.92), float(0.55), sea), float(1), cover);
```

**Modifier** `web/src/globe/earth.ts` — remplacer :

```ts
  material.emissiveNode = texture(t.night).rgb.mul(nightSide).mul(1.6);
```

par :

```ts
  material.emissiveNode = texture(t.night).rgb.mul(nightSide).mul(1.6).mul(cover.mul(0.6).oneMinus());
```

**Modifier** `web/src/globe/globe.ts` — remplacer :

```ts
import { createBorders } from './borders';
import { createCountryLayer, STATE } from './countryLayer';
```

par :

```ts
import { createBorders } from './borders';
import { createClouds } from './clouds';
import { createCountryLayer, STATE } from './countryLayer';
```

**Modifier** `web/src/globe/globe.ts` — remplacer :

```ts
  private readonly image: ReturnType<typeof createImageLayer> | null = null;
```

par :

```ts
  private readonly image: ReturnType<typeof createImageLayer> | null = null;
  private readonly clouds: ReturnType<typeof createClouds> | null = null;
```

**Modifier** `web/src/globe/globe.ts` — remplacer :

```ts
      const earth = createEarthMaterial(parts.textures);
```

par :

```ts
      this.clouds = parts.textures.clouds ? createClouds(parts.textures.clouds) : null;
      const earth = createEarthMaterial(parts.textures, this.clouds);
```

**Modifier** `web/src/globe/globe.ts` — remplacer :

```ts
  setLook(look: CountryLook): void {
```

par :

```ts
  /** Nuages : opacité (0 → effacés) et dérive en fraction de tour ; sans texture de nuages, sans effet. */
  setClouds(opacity: number, driftTurns: number): void { this.clouds?.set(opacity, driftTurns % 1); }

  setLook(look: CountryLook): void {
```

- [ ] **Step 4 : L'effacement piloté par le contrôleur, la boucle et la sonde**

**Modifier** `web/src/globe/controller.ts` — remplacer :

```ts
import { disposePatchTexture, loadPatchTexture } from './patchTexture';
import type { RevealTimeline } from './reveal';
```

par :

```ts
import { disposePatchTexture, loadPatchTexture } from './patchTexture';
import { cloudOpacity, type CloudFade } from './clouds';
import type { RevealTimeline } from './reveal';
```

**Modifier** `web/src/globe/controller.ts` — remplacer :

```ts
  constructor(private readonly baseUrl = '/', reducedMotion = false) {
```

par :

```ts
  private cloudFade: CloudFade = { from: 1, to: 1, atMs: 0 };

  constructor(private readonly baseUrl = '/', readonly reducedMotion = false, private readonly clock: () => number = () => performance.now()) {
```

**Modifier** `web/src/globe/controller.ts` — remplacer :

```ts
    this.image = null;
    this.requestImage();
    this.apply();
    return this.director.flyTo(rec).then(() => {
      if (this.target === rec) { this.arrived = true; this.apply(); }
    });
```

par :

```ts
    this.image = null;
    this.requestImage();
    this.fadeClouds(1);
    this.apply();
    return this.director.flyTo(rec).then(() => {
      if (this.target === rec) { this.arrived = true; this.fadeClouds(0); this.apply(); }
    });
```

**Modifier** `web/src/globe/controller.ts` — remplacer :

```ts
  clear(): void {
    this.target = null;
```

par :

```ts
  /** Opacité des nuages pour la frame (horloge de la boucle de rendu). */
  cloudOpacityAt(nowMs: number): number { return cloudOpacity(this.cloudFade, nowMs); }

  private fadeClouds(to: number): void {
    const now = this.clock();
    this.cloudFade = { from: cloudOpacity(this.cloudFade, now), to, atMs: now };
  }

  clear(): void {
    this.fadeClouds(1);
    this.target = null;
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
import { Globe } from './globe';
import { ImageryCredit } from './credits';
```

par :

```tsx
import { Globe } from './globe';
import { CLOUD_DRIFT_TURNS_PER_S } from './clouds';
import { ImageryCredit } from './credits';
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
  frames: number;
  project(p: LngLat): [number, number] | null;
```

par :

```tsx
  frames: number;
  /** Opacité des nuages à la dernière frame. */
  cloudOpacity: number;
  project(p: LngLat): [number, number] | null;
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
      frames: 0,
```

par :

```tsx
      frames: 0,
      cloudOpacity: 1,
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
    globe.applyPose(pose, camera);
    if (pose.cut) onCut();
    if (window.__globe) window.__globe.frames++;
```

par :

```tsx
    globe.applyPose(pose, camera);
    const clouds = controller.cloudOpacityAt(now);
    // Mouvement réduit : les nuages ne dérivent pas.
    globe.setClouds(clouds, controller.reducedMotion ? 0 : (now / 1000) * CLOUD_DRIFT_TURNS_PER_S);
    if (pose.cut) onCut();
    if (window.__globe) { window.__globe.frames++; window.__globe.cloudOpacity = clouds; }
```

**Modifier** `web/src/probe/main.ts` — remplacer :

```ts
 * - `img` (avec `cca3`, mode jeu) : patch image du pays, à la taille du niveau (`img`) ou forcée (`img=1024`).
```

par :

```ts
 * - `img` (avec `cca3`, mode jeu) : patch image du pays, à la taille du niveau (`img`) ou forcée (`img=1024`) ;
 * - `clouds=x` : opacité des nuages (0 par défaut), sans dérive.
```

**Modifier** `web/src/probe/main.ts` — remplacer :

```ts
globe.setBeacon(lngLat(q.get('beacon')));
```

par :

```ts
globe.setBeacon(lngLat(q.get('beacon')));
globe.setClouds(Number(q.get('clouds') ?? 0), 0);
```

Run: `npm run check`
Expected: `tsc` sans erreur ; `Tests  166 passed (166)` (164 + 2).

- [ ] **Step 5 : Contrôles e2e**

**Créer** `web/e2e/clouds.spec.ts` :

```ts
import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

const meanLuma = (s: Awaited<ReturnType<typeof shoot>>) => {
  let sum = 0, n = 0;
  for (let y = 150; y < 450; y += 2) for (let x = 330; x < 630; x += 2) { const p = s.px([x, y]); sum += (p[0] + p[1] + p[2]) / 3; n++; }
  return sum / n;
};

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test(`${backend} nuages : une couche blanche, éclairée, sur la Terre`, async ({ page }) => {
    const clear = meanLuma(await shoot(page, backend, 'mode=game&at=-20,5&alt=1.4'));
    const cloudy = meanLuma(await shoot(page, backend, 'mode=game&at=-20,5&alt=1.4&clouds=1'));
    console.log(backend, 'luminance sans nuages', clear.toFixed(1), 'avec', cloudy.toFixed(1));
    expect(cloudy).toBeGreaterThan(clear + 8);
  });
}

test.describe('en jeu', () => {
  test.use({ viewport: { width: 960, height: 600 } });
  test('les nuages s’effacent à l’arrivée sur le pays (spec §4.2)', async ({ page }) => {
    await page.goto('/?demo=FRA&webgl');
    await page.waitForFunction(() => (window.__globe?.frames ?? 0) > 0);
    expect(await page.evaluate(() => window.__globe!.cloudOpacity)).toBeGreaterThan(0.99); // pendant le vol
    await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true);
    await page.waitForFunction(() => window.__globe!.cloudOpacity === 0);
  });
});
```

Run: `npm run e2e -- e2e/clouds.spec.ts`
Expected: `3 passed` ; journal `luminance sans nuages 66.4 avec 91.7` sur les deux backends.

Preuve que le test en jeu mord : retirer temporairement `this.fadeClouds(0);` de l'arrivée dans `controller.ts` → « les nuages s'effacent à l'arrivée » échoue (délai dépassé) ; restaurer.

Run: `npm run e2e -- e2e/flight.spec.ts e2e/slow-patch.spec.ts e2e/reduced-motion.spec.ts e2e/image-flight.spec.ts e2e/beacon-horizon.spec.ts e2e/load-failure.spec.ts e2e/rerender.spec.ts`
Expected: `14 passed` (aucune régression du jeu ; Fidji toujours vert après la bonne réponse).

- [ ] **Step 6 : Commit**

```bash
git add scripts/textures public/textures src/globe src/probe e2e/clouds.spec.ts
git commit -m "globe : nuages (NASA) dans le matériau de la Terre — dérive vers l'est, ombre, lumières voilées, effacement à l'arrivée"
```

---
### Task 7 : Post-traitement (bloom, TRAA, MSAA) ; bord du pays sûr sous MSAA

**Files:**
- Create: `web/src/globe/postprocessing.ts`
- Modify: `web/src/globe/GlobeView.tsx`, `web/src/probe/main.ts`, `web/src/globe/countryLayer.ts`
- Test: `web/src/globe/postprocessing.test.ts`, `web/e2e/post.spec.ts`, `web/e2e/msaa-edge.spec.ts`

**Interfaces:**
- Consumes: `QualityTier` ; `renderer.userData.tier` (posé par la fabrique `gl` de `GlobeView`).
- Produces: `interface PostOptions { bloom: { strength; radius; threshold }; traa; msaa }` ; `postOptions(tier): PostOptions` (haute : TRAA, sans MSAA ; standard : MSAA 4×, sans TRAA ; bloom 1,2 / 0,4 / 0 aux deux) ; `createPostProcessing(renderer, scene, camera, options) → { render(), dispose() }` ; paramètres de sonde `post` et `frames` (16 par défaut).

`GlobeScene` reprend la main sur le rendu : son `useFrame` passe en **priorité 1** (R3F ne rend plus lui-même) et appelle `post.render()`. Le post-traitement est recréé avec le renderer après une perte du GPU (effet dépendant de `renderer`). La sortie reste neutre (pas de tone mapping filmique : le jaune de l'interface doit rester exact) — c'est l'écart avec le « tone mapping » du spec §4.1, soumis à l'utilisateur (Points à trancher).

**Le défaut corrigé à l'étape 5 existe dans le jeu 1A** (canvas MSAA en WebGL 2) : un trait de la couleur du pays traversait l'Irlande au bord nord du cadre de la France (constaté le 03/10 dans `newcountri`, 75 pixels verts après la bonne réponse) ; la sonde ne le montrait pas (rendu sans MSAA).

- [ ] **Step 1 : Écrire le test unitaire qui échoue**

**Créer** `web/src/globe/postprocessing.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { postOptions } from './postprocessing';

describe('post-traitement par niveau (spec §4.1)', () => {
  it('haute : bloom + TRAA, sans MSAA (TRAA l’exige)', () => {
    const o = postOptions('haute');
    expect([o.traa, o.msaa]).toEqual([true, 0]);
    expect(o.bloom.strength).toBeGreaterThan(0);
  });
  it('standard : effets allégés — bloom, MSAA 4× du pass, pas de TRAA', () => {
    const o = postOptions('standard');
    expect([o.traa, o.msaa]).toEqual([false, 4]);
    expect(o.bloom).toEqual(postOptions('haute').bloom);
  });
});
```

Run: `npx vitest run --project unit src/globe/postprocessing.test.ts`
Expected: FAIL — `./postprocessing` introuvable.

- [ ] **Step 2 : Écrire le post-traitement**

**Créer** `web/src/globe/postprocessing.ts` :

```ts
import * as THREE from 'three/webgpu';
import { emissive, mrt, output, pass, velocity } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import type { QualityTier } from './renderer';

export interface PostOptions { bloom: { strength: number; radius: number; threshold: number }; traa: boolean; msaa: number }

/**
 * Spec §4.1 : « haute » = bloom + TRAA ; « standard » = effets allégés (bloom seul, MSAA 4× du pass). Le bloom ne lit que
 * l'émissif (lumières des villes, soleil) : le jaune du pays et la Terre éclairée restent exacts. Sortie neutre
 * (NoToneMapping, prop `flat` de R3F) : un tone mapping filmique déplacerait le jaune #ffee03 de l'interface.
 */
export function postOptions(tier: QualityTier): PostOptions {
  return { bloom: { strength: 1.2, radius: 0.4, threshold: 0 }, traa: tier === 'haute', msaa: tier === 'haute' ? 0 : 4 };
}

/** RenderPipeline (nom de PostProcessing depuis r183) : scène (MRT sortie + émissif [+ vitesse]) → bloom → [TRAA] → sortie sRGB. */
export function createPostProcessing(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, o: PostOptions) {
  const scenePass = pass(scene, camera, o.msaa ? { samples: o.msaa } : {});
  scenePass.setMRT(o.traa ? mrt({ output, emissive, velocity }) : mrt({ output, emissive }));
  const color = scenePass.getTextureNode('output');
  const glow = bloom(scenePass.getTextureNode('emissive'), o.bloom.strength, o.bloom.radius, o.bloom.threshold);
  const lit = color.add(glow);
  const pipeline = new THREE.RenderPipeline(renderer);
  // TRAA : MSAA coupé (pass sans `samples`), l'historique se réinitialise seul quand la profondeur change trop.
  pipeline.outputNode = o.traa ? traa(lit, scenePass.getTextureNode('depth'), scenePass.getTextureNode('velocity'), camera) : lit;
  return { render: () => pipeline.render(), dispose: () => pipeline.dispose() };
}
```

Run: `npx vitest run --project unit src/globe/postprocessing.test.ts && npx tsc --noEmit`
Expected: `Tests  2 passed (2)` ; aucune erreur de type.

- [ ] **Step 3 : Écrire le contrôle e2e du bloom, qui échoue**

**Créer** `web/e2e/post.spec.ts` :

```ts
import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

// Nuit sur Paris (même pose que earth.spec) : le bloom fait déborder la lumière des villes autour d'elles.
const NIGHT = 'mode=game&at=2.35,48.85&alt=1.4&sun=-177.65,-48.85';

for (const [backend, tier] of [['webgpu', 'haute'], ['webgpu', 'standard'], ['webgl2', 'standard']] as [BackendName, string][]) {
  test(`${backend} ${tier} : le bloom auréole les lumières des villes`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const halo = async (q: string) => {
      const s = await shoot(page, backend, q);
      const [paris] = await page.evaluate(() => window.__probe!.project([[2.35, 48.85]]));
      // couronne de 6 à 14 px autour de Paris : sombre sans bloom
      let sum = 0;
      for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
        const r = Math.hypot(dx, dy);
        if (r >= 6 && r <= 14) { const p = s.px([paris![0] + dx, paris![1] + dy]); sum += p[0] + p[1] + p[2]; }
      }
      return sum;
    };
    const plain = await halo(`${NIGHT}&tier=${tier}`);
    const bloomed = await halo(`${NIGHT}&tier=${tier}&post`);
    console.log(backend, tier, 'couronne sans bloom', plain, 'avec', bloomed);
    expect(errors).toEqual([]);
    expect(bloomed).toBeGreaterThan(plain * 1.15);
  });
}
```

Run: `npm run e2e -- e2e/post.spec.ts`
Expected: FAIL ×3 — couronnes égales avec et sans `post` (la sonde l'ignore encore).

- [ ] **Step 4 : Brancher le post-traitement dans le jeu et dans la sonde**

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
import { createImageSource, loadImageryIndex } from './imagePatch';
```

par :

```tsx
import { createImageSource, loadImageryIndex } from './imagePatch';
import { createPostProcessing, postOptions } from './postprocessing';
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
```

par :

```tsx
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const scene = useThree((s) => s.scene) as unknown as THREE.Scene;
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
  const [globe, setGlobe] = useState<Globe | null>(null);
```

par :

```tsx
  const [globe, setGlobe] = useState<Globe | null>(null);
  const [post, setPost] = useState<ReturnType<typeof createPostProcessing> | null>(null);
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
  // Patchs image (Sentinel-2) : facultatifs — sans index ni fichier, la texture globale suffit.
```

par :

```tsx
  // Post-traitement (spec §4.1) : un par renderer ; recréé avec lui après une perte du GPU.
  useEffect(() => {
    const p = createPostProcessing(renderer, scene, camera, postOptions(renderer.userData.tier));
    setPost(p);
    return () => { setPost(null); p.dispose(); };
  }, [renderer, scene, camera]);

  // Patchs image (Sentinel-2) : facultatifs — sans index ni fichier, la texture globale suffit.
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
    if (pose.cut) onCut();
    if (window.__globe) { window.__globe.frames++; window.__globe.cloudOpacity = clouds; }
  });
```

par :

```tsx
    if (pose.cut) onCut();
    if (post) post.render();
    else renderer.render(scene, camera);
    if (window.__globe) { window.__globe.frames++; window.__globe.cloudOpacity = clouds; }
  }, 1); // priorité 1 : R3F ne rend plus lui-même, la boucle passe par le post-traitement
```

**Modifier** `web/src/probe/main.ts` — remplacer :

```ts
import { createImageSource, loadImageryIndex } from '../globe/imagePatch';
```

par :

```ts
import { createImageSource, loadImageryIndex } from '../globe/imagePatch';
import { createPostProcessing, postOptions } from '../globe/postprocessing';
```

**Modifier** `web/src/probe/main.ts` — remplacer :

```ts
 * - `clouds=x` : opacité des nuages (0 par défaut), sans dérive.
```

par :

```ts
 * - `clouds=x` : opacité des nuages (0 par défaut), sans dérive ;
 * - `post` : post-traitement du niveau (`tier`), rendu sur `frames` images (16 par défaut : TRAA converge).
```

**Modifier** `web/src/probe/main.ts` — remplacer :

```ts
scene.add(globe.root);
renderer.render(scene, camera);
```

par :

```ts
scene.add(globe.root);
if (q.has('post')) {
  const post = createPostProcessing(renderer, scene, camera, postOptions(q.get('tier') === 'haute' ? 'haute' : 'standard'));
  for (let i = 0, n = Number(q.get('frames') ?? 16); i < n; i++) {
    post.render();
    await new Promise((r) => requestAnimationFrame(r));
  }
} else {
  renderer.render(scene, camera);
}
```

Run: `npx tsc --noEmit && npm run e2e -- e2e/post.spec.ts`
Expected: `3 passed` ; journal `webgpu haute couronne sans bloom 83420 avec 184064`, `webgpu standard … 75919 avec 176566`, `webgl2 standard … 75916 avec 176554`.

- [ ] **Step 5 : Écrire le contrôle du bord sous MSAA, le voir échouer, corriger**

**Créer** `web/e2e/msaa-edge.spec.ts` :

```ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { samplePatchPng } from '../scripts/geodata/lib/patch';
import type { CountryRecord, LngLat } from '../src/data/types';
import type { BackendName } from './sdf-check';

const fra = (JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[]).find((c) => c.cca3 === 'FRA')!;
const sdf = PNG.sync.read(readFileSync(`public/data/${fra.patch.sdf}`));

// Sous MSAA (niveau standard : pass à 4 échantillons), fwidth devenait aberrant sur certains anneaux du maillage en WebGL 2 :
// un trait de la couleur du pays traversait l'Irlande, au bord nord du cadre de la France (03/10, jeu 1A compris).
for (const backend of ['webgl2', 'webgpu'] as BackendName[]) {
  test(`${backend} MSAA : aucun pixel de la couleur du pays hors du pays`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto(`/probe.html?mode=game&cca3=FRA&post&tier=standard&w=360&h=640${backend === 'webgl2' ? '&webgl' : ''}`);
    await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 60_000 });
    const shot = PNG.sync.read(await page.screenshot());
    const pixels: [number, number][] = [];
    for (let y = 0; y < 640; y += 1) for (let x = 0; x < 360; x += 2) pixels.push([x, y]);
    const ll = await page.evaluate((p) => window.__probe!.unproject(p.map(([x, y]) => [x + 0.5, y + 0.5] as [number, number])), pixels);
    const leaks: [number, number][] = [];
    pixels.forEach(([x, y], k) => {
      const p = ll[k] as LngLat | null;
      if (!p) return;
      const s = samplePatchPng(sdf, fra.patch, p);
      // à plus de 16 texels du bord (le liseré du pays déborde légitimement d'environ 1,5 pixel, soit quelques texels)
      if (!s || s.r > 128 - 64) return;
      const i = (y * shot.width + x) * 4;
      if (shot.data[i]! > 200 && shot.data[i + 1]! > 190 && shot.data[i + 2]! < 80) leaks.push([x, y]);
    });
    console.log(backend, 'pixels jaunes hors de France', leaks.length, JSON.stringify(leaks.slice(0, 5)));
    expect(leaks).toEqual([]);
  });
}
```

Run: `npm run e2e -- e2e/msaa-edge.spec.ts`
Expected: FAIL en WebGL 2 — `pixels jaunes hors de France 31 [[94,233],[96,233],…]` (le nombre varie d'une passe à l'autre : l'aberration de `fwidth` est intermittente) ; WebGPU passe.

**Modifier** `web/src/globe/countryLayer.ts` — remplacer :

```ts
  const sdPx = sd.div(max(fwidth(sd), 1e-4)); // distance au bord en pixels d'écran
  const gdPx = gd.div(max(fwidth(gd), 1e-4));
```

par :

```ts
  // Distance au bord en pixels d'écran (anticrénelage). Une empreinte de pixel (fwidth) de plus de rangeTexels texels ne
  // dit plus rien (champ saturé) : le bord devient net. Sous MSAA en WebGL 2 (SwiftShader), fwidth devient aberrant sur
  // certains anneaux du maillage, et le bord anticrénelé débordait en un trait de la couleur du pays (03/10, jeu 1A compris).
  const toPx = (v: Node<'float'>) => {
    const fw = fwidth(v);
    return select(fw.greaterThan(u.rangeTexels), v.mul(1e3), v.div(max(fw, 1e-4)));
  };
  const sdPx = toPx(sd);
  const gdPx = toPx(gd);
```

Run: `npm run e2e -- e2e/msaa-edge.spec.ts --repeat-each=3`
Expected: `6 passed` (0 pixel jaune hors de France, trois passes).

Note : borner seulement l'empreinte (`clamp(fwidth, 1e-4, rangeTexels)`) ne suffit pas — le liseré reste à moitié coloré ([137,136,57]) une passe sur deux ; c'est le passage au bord net qui l'efface.

- [ ] **Step 6 : Non-régression du jeu et de la couche pays**

Run: `npm run check`
Expected: `Tests  168 passed (168)` (166 + 2).

Run: `npm run e2e -- e2e/flight.spec.ts e2e/slow-patch.spec.ts e2e/reduced-motion.spec.ts e2e/image-flight.spec.ts e2e/beacon-horizon.spec.ts e2e/load-failure.spec.ts e2e/rerender.spec.ts e2e/credit.spec.ts e2e/calibrate.spec.ts e2e/unsupported.spec.ts e2e/patch.spec.ts e2e/reveal.spec.ts`
Expected: `36 passed` — perte du GPU comprise (le post-traitement est recréé : `après recréation [101,192,148]` en WebGPU), Fidji vert `[98,191,148]`.

- [ ] **Step 7 : Commit**

```bash
git add src/globe src/probe e2e/post.spec.ts e2e/msaa-edge.spec.ts
git commit -m "globe : post-traitement (bloom sur l'émissif, TRAA en haute, MSAA en standard) ; bord du pays net quand fwidth est aberrant (trait sous MSAA, 1A comprise)"
```

---
### Task 8 : Soleil visible et son halo

**Files:**
- Create: `web/src/globe/sunDisc.ts`
- Modify: `web/src/globe/globe.ts`
- Test: `web/e2e/sun.spec.ts`, `web/src/globe/globe.test.ts`

**Interfaces:**
- Consumes: `Globe.setSun(dir)` et ses écouteurs (`sunListeners`) ; Task 7 — paramètre de sonde `post`.
- Produces: `SUN_DISTANCE = 40`, `SUN_HALO_DEG = 8` ; `createSunDisc() → { sprite, setDirection(dir) }` ; `Globe.dispose()` libère chaque ressource **une fois**.

Spec §4.2 : « autour : champ d'étoiles, soleil et halo ». En jeu, le soleil est placé à 55° du point visé, du côté de la caméra : il n'entre pas dans l'image ; il sert l'intro (phase 2 : lever de soleil derrière le limbe) et la vue d'ensemble. Sa lumière passe par `emissiveNode` (lu par tout matériau nœud, sprite compris) : le bloom l'élargit. La Terre le cache (test de profondeur).

- [ ] **Step 1 : Écrire le contrôle e2e qui échoue**

**Créer** `web/e2e/sun.spec.ts` :

```ts
import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

// Caméra en (5, 0, 0), regard vers l'origine, 960 × 600, champ vertical 50° : la Terre couvre asin(1/5) = 11,5° autour du
// centre (limbe haut à y ≈ 169). Soleil à 40 rayons dans la direction (−0,957 ; 0,290 ; 0), soit lng 180°, lat 16,86° :
// vu de la caméra, 15° au-dessus du centre → y = 300 − tan 15° / tan 25° × 300 ≈ 128, juste au-dessus du limbe.
const SUNRISE = 'mode=game&at=0,0&alt=4&sun=180,16.86';
const sum = (p: number[]) => p[0]! + p[1]! + p[2]!;

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test(`${backend} soleil : un disque éclatant au-dessus du limbe, un halo que le bloom élargit`, async ({ page }) => {
    const plain = await shoot(page, backend, SUNRISE);
    const bloomed = await shoot(page, backend, `${SUNRISE}&post`);
    const disc = plain.px([480, 128]), haloPlain = plain.px([480 + 30, 128]), haloBloom = bloomed.px([480 + 30, 128]);
    console.log(backend, 'disque', JSON.stringify(disc), 'halo sans bloom', JSON.stringify(haloPlain), 'avec', JSON.stringify(haloBloom));
    expect(sum(disc)).toBeGreaterThan(700);
    expect(sum(haloBloom)).toBeGreaterThan(sum(haloPlain) + 30);
  });

  test(`${backend} soleil derrière la Terre : caché par elle`, async ({ page }) => {
    const s = await shoot(page, backend, 'mode=game&at=0,0&alt=4&sun=180,0');
    const center = s.px([480, 300]);
    console.log(backend, 'centre (face de nuit)', JSON.stringify(center));
    expect(sum(center)).toBeLessThan(150);
  });
}
```

Run: `npm run e2e -- e2e/sun.spec.ts`
Expected: FAIL ×2 — `disque [0,0,0]` ; « derrière la Terre » passe déjà (il n'y a pas encore de soleil : sa preuve est la mutation de l'étape 5).

- [ ] **Step 2 : Écrire le soleil et le poser dans la scène**

**Créer** `web/src/globe/sunDisc.ts` :

```ts
import * as THREE from 'three/webgpu';
import { clamp, exp, float, smoothstep, uv, vec3 } from 'three/tsl';
import type { Vec3 } from '../geo/vec';

/** Distance du soleil (rayons terrestres) : en deçà des étoiles (50) et du plan lointain de la caméra (altitude + 61). */
export const SUN_DISTANCE = 40;
/** Demi-largeur angulaire du sprite (halo compris) ; le disque en occupe le dixième central. */
export const SUN_HALO_DEG = 8;

/**
 * Soleil et son halo (spec §4.2, « autour : champ d'étoiles, soleil et halo ») : sprite additif à SUN_DISTANCE dans la
 * direction du soleil, caché par la Terre (test de profondeur). Sa lumière passe par l'émissif : le bloom l'élargit.
 */
export function createSunDisc(): { sprite: THREE.Sprite; setDirection(dir: Vec3): void } {
  const m = new THREE.SpriteNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const r = uv().sub(0.5).length().mul(2); // 0 au centre, 1 au bord du sprite
  const disc = smoothstep(float(0.1), float(0.07), r);
  const halo = exp(r.mul(-6)).mul(0.6).mul(smoothstep(float(1), float(0.6), r));
  const intensity = disc.mul(4).add(halo);
  m.colorNode = vec3(0, 0, 0);
  // NodeMaterial.setupLighting lit `emissiveNode` sur tout matériau nœud (@types/three ne le déclare que sur les matériaux éclairés).
  (m as THREE.SpriteNodeMaterial & { emissiveNode: unknown }).emissiveNode = vec3(1.0, 0.95, 0.85).mul(intensity);
  m.opacityNode = clamp(intensity, 0, 1);
  const sprite = new THREE.Sprite(m);
  sprite.scale.setScalar(2 * SUN_DISTANCE * Math.tan((SUN_HALO_DEG * Math.PI) / 180));
  return { sprite, setDirection(d) { sprite.position.set(d[0] * SUN_DISTANCE, d[1] * SUN_DISTANCE, d[2] * SUN_DISTANCE); } };
}
```

**Modifier** `web/src/globe/globe.ts` — remplacer :

```ts
import { createStars } from './stars';
```

par :

```ts
import { createStars } from './stars';
import { createSunDisc } from './sunDisc';
```

**Modifier** `web/src/globe/globe.ts` — remplacer :

```ts
      const atmosphere = createAtmosphere();
      this.sunListeners.push(earth.setSun, atmosphere.setSun);
      this.root.add(atmosphere.mesh, createStars(), this.beacon.sprite);
```

par :

```ts
      const atmosphere = createAtmosphere();
      const sunDisc = createSunDisc();
      this.sunListeners.push(earth.setSun, atmosphere.setSun, sunDisc.setDirection);
      this.root.add(atmosphere.mesh, createStars(), sunDisc.sprite, this.beacon.sprite);
```

Run: `npx tsc --noEmit && npm run e2e -- e2e/sun.spec.ts`
Expected: `4 passed` ; journal `disque [255,255,255] halo sans bloom [5,5,5] avec [134,131,126]`, `centre (face de nuit) [8,9,21]`.

Run: `npm run check`
Expected: FAIL — `Globe.dispose` : `expected 14 to be 12` (la balise et le soleil sont deux `Sprite` : ils partagent la géométrie statique de three, libérée deux fois et comptée deux fois par le test).

- [ ] **Step 3 : Le test compte des ressources distinctes**

**Modifier** `web/src/globe/globe.test.ts` — remplacer :

```ts
    const owned: { dispatchEvent: unknown; addEventListener(type: 'dispose', cb: () => void): void }[] = [];
    globe.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) owned.push(m.geometry);
      for (const mat of [m.material].flat()) if (mat) owned.push(mat as THREE.Material);
    });
    expect(owned.length).toBeGreaterThanOrEqual(8); // Terre, halo, étoiles, frontières, balise : géométrie + matériau
```

par :

```ts
    // Ressources distinctes : les sprites (balise, soleil) partagent la géométrie statique de three.
    const owned = new Set<{ addEventListener(type: 'dispose', cb: () => void): void }>();
    globe.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) owned.add(m.geometry);
      for (const mat of [m.material].flat()) if (mat) owned.add(mat as THREE.Material);
    });
    expect(owned.size).toBeGreaterThanOrEqual(8); // Terre, halo, étoiles, frontières, balise : géométrie + matériau
```

**Modifier** `web/src/globe/globe.test.ts` — remplacer :

```ts
    expect(disposed).toBe(owned.length);
```

par :

```ts
    expect(disposed).toBe(owned.size); // une fois chacune
```

Run: `npx vitest run --project unit src/globe/globe.test.ts`
Expected: FAIL — `expected 12 to be 11` (la géométrie partagée reçoit deux `dispose`).

- [ ] **Step 4 : Libérer chaque ressource une seule fois**

**Modifier** `web/src/globe/globe.ts` — remplacer :

```ts
  /** Libère les géométries et matériaux créés par le globe ; les textures prêtées (GlobeParts, patchs) restent à l'appelant. */
  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      for (const mat of [m.material].flat()) (mat as THREE.Material | undefined)?.dispose();
    });
  }
```

par :

```ts
  /**
   * Libère les géométries et matériaux créés par le globe, une fois chacun (les sprites partagent la géométrie statique de
   * three) ; les textures prêtées (GlobeParts, patchs) restent à l'appelant.
   */
  dispose(): void {
    const done = new Set<{ dispose(): void }>();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      for (const r of [m.geometry, ...[m.material].flat()] as ({ dispose(): void } | undefined)[]) {
        if (r && !done.has(r)) { done.add(r); r.dispose(); }
      }
    });
  }
```

Run: `npm run check`
Expected: `Tests  168 passed (168)`.

- [ ] **Step 5 : Preuve que l'occultation est contrôlée**

Ajouter temporairement `depthTest: false` aux options de `SpriteNodeMaterial` dans `sunDisc.ts` → `npm run e2e -- e2e/sun.spec.ts -g "derrière"` échoue sur les deux backends (`centre (face de nuit) [255,255,255]`) ; restaurer.

- [ ] **Step 6 : Commit**

```bash
git add src/globe/sunDisc.ts src/globe/globe.ts src/globe/globe.test.ts e2e/sun.spec.ts
git commit -m "globe : soleil et halo (sprite additif, émissif pour le bloom, caché par la Terre) ; dispose une fois par ressource"
```

---
### Task 9 : Résolution dynamique (niveau « standard ») et pause quand l'onglet est caché

**Files:**
- Create: `web/src/globe/dynamicResolution.ts`
- Modify: `web/src/globe/GlobeView.tsx`
- Test: `web/src/globe/dynamicResolution.test.ts`, `web/e2e/dynamic-resolution.spec.ts`

**Interfaces:**
- Consumes: `renderer.userData.tier` ; état R3F `setDpr`, `setFrameloop`.
- Produces: `interface DprOptions { min; max; step; slowMs; fastMs; window }` ; `dprOptions(devicePixelRatio)` (0,75 → min(DPR, 2), pas de 0,25, 22 / 14 ms, 30 frames) ; `createDprGovernor(options) → { dpr, update(frameMs): number }` ; `GlobeDebug.dpr()`, `GlobeDebug.frameMsOverride`.

Spec §4.1 et §6.6 : niveau « standard » = densité ≤ 2 et résolution dynamique ; rendu en pause onglet caché. La médiane par fenêtre ignore une frame aberrante (onglet revenu, compilation d'un shader) ; entre les deux seuils, la densité ne bouge pas (pas d'oscillation). En headless, SwiftShader rend le jeu à moins d'une image par seconde (0,3 à 1,0 mesuré, avant comme après le post-traitement) : l'e2e vérifie le branchement en densité 1 (un pas vers 0,75, puis retour), la descente pas à pas est couverte par le test unitaire.

- [ ] **Step 1 : Écrire le test unitaire qui échoue**

**Créer** `web/src/globe/dynamicResolution.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createDprGovernor } from './dynamicResolution';

const o = { min: 0.75, max: 2, step: 0.25, slowMs: 22, fastMs: 14, window: 30 };
const run = (g: ReturnType<typeof createDprGovernor>, frameMs: number, frames: number) => {
  let dpr = g.dpr;
  for (let i = 0; i < frames; i++) dpr = g.update(frameMs);
  return dpr;
};

describe('résolution dynamique (spec §4.1, niveau standard)', () => {
  it('commence au maximum et ne bouge pas avant une fenêtre complète', () => {
    const g = createDprGovernor(o);
    expect(g.dpr).toBe(2);
    expect(run(g, 40, 29)).toBe(2);
  });
  it('frames lentes : un pas par fenêtre, jusqu’au minimum', () => {
    const g = createDprGovernor(o);
    expect(run(g, 40, 30)).toBe(1.75);
    expect(run(g, 40, 30 * 10)).toBe(0.75);
  });
  it('frames rapides : remonte jusqu’au maximum', () => {
    const g = createDprGovernor(o);
    run(g, 40, 30 * 10);
    expect(run(g, 8, 30 * 10)).toBe(2);
  });
  it('entre les deux seuils : ne bouge pas (pas d’oscillation)', () => {
    const g = createDprGovernor(o);
    run(g, 40, 60);
    expect(run(g, 18, 30 * 10)).toBe(1.5);
  });
  it('une frame aberrante (onglet revenu, compilation) ne fait pas tout chuter', () => {
    const g = createDprGovernor(o);
    g.update(2000);
    expect(run(g, 10, 29)).toBe(2);
  });
});
```

Run: `npx vitest run --project unit src/globe/dynamicResolution.test.ts`
Expected: FAIL — `./dynamicResolution` introuvable.

- [ ] **Step 2 : Écrire le régulateur**

**Créer** `web/src/globe/dynamicResolution.ts` :

```ts
export interface DprOptions { min: number; max: number; step: number; slowMs: number; fastMs: number; window: number }

/** Niveau « standard » : densité de 0,75 à min(devicePixelRatio, 2), par pas de 0,25 ; vise 45 à 70 images/s. */
export const dprOptions = (devicePixelRatio: number): DprOptions =>
  ({ min: 0.75, max: Math.min(2, Math.max(1, devicePixelRatio)), step: 0.25, slowMs: 22, fastMs: 14, window: 30 });

/**
 * Résolution dynamique (spec §4.1 et §6.6) : par fenêtres de `window` frames, la MÉDIANE du temps de frame (une frame
 * aberrante — onglet revenu, compilation d'un shader — ne compte pas) fait baisser la densité d'un pas au-dessus de
 * `slowMs`, la fait remonter sous `fastMs`, et la laisse entre les deux (pas d'oscillation).
 */
export function createDprGovernor(o: DprOptions) {
  let dpr = o.max;
  const times: number[] = [];
  return {
    get dpr() { return dpr; },
    update(frameMs: number): number {
      times.push(frameMs);
      if (times.length < o.window) return dpr;
      const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]!;
      times.length = 0;
      if (median > o.slowMs) dpr = Math.max(o.min, dpr - o.step);
      else if (median < o.fastMs) dpr = Math.min(o.max, dpr + o.step);
      return dpr;
    },
  };
}
```

Run: `npx vitest run --project unit src/globe/dynamicResolution.test.ts`
Expected: `Tests  5 passed (5)`.

- [ ] **Step 3 : Écrire le contrôle e2e qui échoue**

**Créer** `web/e2e/dynamic-resolution.spec.ts` :

```ts
import { expect, test } from '@playwright/test';

// Petit viewport, densité 1 : en headless, SwiftShader rend le jeu post-traité à ≈ 1 image/s en densité 2 (03/10) ;
// la descente pas à pas est couverte par dynamicResolution.test.ts, ici on vérifie le branchement.
test.use({ viewport: { width: 480, height: 300 }, deviceScaleFactor: 1 });
test.slow(() => !!process.env.CI, 'SwiftShader : ≈ 1 image/s, il faut plusieurs fenêtres de 30 frames');

const ready = async (page: import('@playwright/test').Page, query: string) => {
  await page.goto(`/${query}`);
  await expect(page.getByRole('button', { name: 'Pays suivant' })).toBeEnabled({ timeout: 120_000 });
};

test('standard (WebGL 2) : la densité baisse quand les frames ralentissent, puis remonte', async ({ page }) => {
  await ready(page, '?webgl');
  expect(await page.evaluate(() => window.__globe!.dpr())).toBe(1);
  await page.evaluate(() => { window.__globe!.frameMsOverride = 40; });
  await page.waitForFunction(() => window.__globe!.dpr() === 0.75);
  expect(await page.evaluate(() => document.querySelector('canvas')!.width)).toBe(360);
  await page.evaluate(() => { window.__globe!.frameMsOverride = 8; });
  await page.waitForFunction(() => window.__globe!.dpr() === 1);
});

test('haute (WebGPU) : pas de résolution dynamique', async ({ page }) => {
  await ready(page, '');
  await page.evaluate(() => { window.__globe!.frameMsOverride = 40; });
  const before = await page.evaluate(() => window.__globe!.frames);
  await page.waitForFunction((n) => window.__globe!.frames > n + 35, before); // plus d'une fenêtre de 30 frames
  expect(await page.evaluate(() => window.__globe!.dpr())).toBe(1);
});

test('onglet caché : plus aucune frame ; elles reprennent au retour (spec §6.6)', async ({ page }) => {
  await ready(page, '?webgl');
  const setHidden = (hidden: boolean) => page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
  await setHidden(true);
  const frozen = await page.evaluate(() => window.__globe!.frames);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__globe!.frames)).toBe(frozen);
  await setHidden(false);
  await page.waitForFunction((n) => window.__globe!.frames > n, frozen);
});
```

Run: `npm run e2e -- e2e/dynamic-resolution.spec.ts`
Expected: FAIL ×3 — `window.__globe.dpr is not a function` (deux premiers), frames qui continuent onglet caché (troisième).

- [ ] **Step 4 : Brancher le régulateur et la pause dans la scène**

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
import { Component, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
```

par :

```tsx
import { Component, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react';
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
import { ImageryCredit } from './credits';
```

par :

```tsx
import { ImageryCredit } from './credits';
import { createDprGovernor, dprOptions } from './dynamicResolution';
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
  cloudOpacity: number;
  project(p: LngLat): [number, number] | null;
```

par :

```tsx
  cloudOpacity: number;
  /** Densité de pixels du renderer. */
  dpr(): number;
  /** Remplace le temps de frame vu par la résolution dynamique (contrôles headless). */
  frameMsOverride?: number;
  project(p: LngLat): [number, number] | null;
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
  const [post, setPost] = useState<ReturnType<typeof createPostProcessing> | null>(null);
```

par :

```tsx
  const [post, setPost] = useState<ReturnType<typeof createPostProcessing> | null>(null);
  const setDpr = useThree((s) => s.setDpr);
  const setFrameloop = useThree((s) => s.setFrameloop);
  // Résolution dynamique : niveau « standard » seulement (spec §4.1).
  const governor = useMemo(() => (renderer.userData.tier === 'standard' ? createDprGovernor(dprOptions(window.devicePixelRatio)) : null), [renderer]);

  // Onglet caché : plus aucune frame (spec §6.6) ; la boucle reprend au retour.
  useEffect(() => {
    const onVisibility = () => setFrameloop(document.visibilityState === 'hidden' ? 'never' : 'always');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [setFrameloop]);
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
      cloudOpacity: 1,
```

par :

```tsx
      cloudOpacity: 1,
      dpr: () => renderer.getPixelRatio(),
```

**Modifier** `web/src/globe/GlobeView.tsx` — remplacer :

```tsx
  useFrame(() => {
    if (!globe) return;
```

par :

```tsx
  useFrame((_, delta) => {
    if (governor) {
      const before = governor.dpr;
      const dpr = governor.update(window.__globe?.frameMsOverride ?? delta * 1000);
      if (dpr !== before) setDpr(dpr);
    }
    if (!globe) return;
```

Run: `npx tsc --noEmit && npm run e2e -- e2e/dynamic-resolution.spec.ts`
Expected: `3 passed` (≈ 50 s, 40 s et 6 s en local : quelques dizaines de frames à ≈ 1 image/s).

Run: `npm run check`
Expected: `Tests  173 passed (173)` (168 + 5).

- [ ] **Step 5 : Commit**

```bash
git add src/globe/dynamicResolution.ts src/globe/dynamicResolution.test.ts src/globe/GlobeView.tsx e2e/dynamic-resolution.spec.ts
git commit -m "globe : résolution dynamique en standard (médiane par fenêtre de 30 frames), plus aucune frame onglet caché"
```

---
### Task 10 : Régression visuelle (six plans de référence) et budget du premier chargement

**Files:**
- Create: `web/e2e/visual.spec.ts`, `web/e2e-budget/first-load.spec.ts`, `web/playwright.budget.config.ts`, `.github/workflows/visual-baselines.yml`
- Modify: `web/package.json`, `web/tsconfig.json`, `.github/workflows/web-ci.yml`
- Sorties versionnées : `web/e2e/visual.spec.ts-snapshots/*-darwin.png` (24, ≈ 5,5 Mo), puis `*-linux.png` (24, générées par la CI)

**Interfaces:**
- Consumes: paramètres de sonde des Tasks 4 à 8 (`clouds`, `post`, `tier`, `sun`, `beacon`, `state`, `t`) ; `CHROME_ARGS` (`playwright.config.ts`).
- Produces: `FIRST_LOAD_BUDGET = { standard: 8_000_000 }` ; `npm run budget` (build de production + `vite preview` sur le port 5175) ; workflow manuel `visual-baselines` (artefact `visual-linux`).

Spec §8 : « non-régression visuelle : six plans de référence, WebGPU et `forceWebGL`, téléphone et bureau » ; §6.6 et §10.5 : budget du premier chargement fixé et mesuré. Les plans passent par la sonde (déterministe : pas d'horloge, nuages sans dérive, TRAA convergé sur 16 images) avec le niveau de qualité réel de chaque combinaison. Tolérance de 20 pixels : le rendu est déterministe sur une plateforme (72/72 sur trois passes au prototype, et sous Linux arm64 dans l'image Playwright : 24/24 sur deux passes), et le trait de la Task 7 (52 à 82 pixels) doit se voir — une tolérance de 0,2 % l'avait laissé passer. Les références Linux se génèrent **sur le runner x86_64 de la CI** : le poste est arm64.

Le budget compte les octets **réellement transférés** jusqu'à l'arrivée sur le premier pays, au niveau « standard » (téléphone, WebGL 2) : texte compté gzip (comme le servira nginx), workers `blob:` exclus, réponses du cache du navigateur à 0 ; le patch image hors dépôt (absent en CI, 404) est compté à la taille que donne l'index.

- [ ] **Step 1 : Écrire la régression visuelle**

**Créer** `web/e2e/visual.spec.ts` :

```ts
import { expect, test } from '@playwright/test';
import type { BackendName } from './sdf-check';

/**
 * Non-régression visuelle (spec §8) : six plans de référence rendus par la sonde (déterministes : pas d'horloge, nuages
 * sans dérive, TRAA convergé sur 16 images), WebGPU et WebGL 2, téléphone et bureau. Références par plateforme
 * (`-darwin`, `-linux`) : celles de Linux se génèrent sur le runner de la CI (.github/workflows/visual-baselines.yml).
 * Tolérance de 20 pixels : le rendu est déterministe sur une plateforme, et un trait d'un pixel sur 100 (défaut MSAA du
 * 03/10) doit se voir.
 */
const PLANS = {
  accueil: 'mode=game&at=10,20&alt=1.4&clouds=1',
  nuit: 'mode=game&at=10,45&alt=1.4&sun=-170,-45',
  question: 'mode=game&cca3=FRA',
  'bonne-reponse': 'mode=game&cca3=JPN&state=correct&t=1',
  'micro-etat': 'mode=game&cca3=VAT&beacon=12.4533,41.9029',
  'lever-de-soleil': 'mode=game&at=0,0&alt=4&sun=180,16.86',
} as const;
const SCREENS = { bureau: { width: 800, height: 450 }, telephone: { width: 360, height: 640 } } as const;

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  for (const [screen, size] of Object.entries(SCREENS)) {
    // Niveau de qualité réel : « haute » seulement pour WebGPU sur bureau (spec §4.1).
    const tier = backend === 'webgpu' && screen === 'bureau' ? 'haute' : 'standard';
    test.describe(`${backend} ${screen}`, () => {
      test.use({ viewport: size });
      for (const [plan, query] of Object.entries(PLANS)) {
        test(plan, async ({ page }) => {
          await page.goto(`/probe.html?${query}&post&tier=${tier}&w=${size.width}&h=${size.height}${backend === 'webgl2' ? '&webgl' : ''}`);
          await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 60_000 });
          expect(await page.evaluate(() => window.__probe!.backend)).toBe(backend);
          await expect(page).toHaveScreenshot(`${plan}-${backend}-${screen}.png`, { maxDiffPixels: 20, threshold: 0.1 });
        });
      }
    });
  }
}
```

Run: `npm run e2e -- e2e/visual.spec.ts`
Expected: FAIL ×24 — `A snapshot doesn't exist at …/accueil-webgpu-bureau-darwin.png, writing actual.`

- [ ] **Step 2 : Générer les références macOS et vérifier leur stabilité**

Run: `npm run e2e -- e2e/visual.spec.ts --update-snapshots`
Expected: `24 passed` ; 24 fichiers `*-darwin.png` (≈ 5,5 Mo).

Run: `npm run e2e -- e2e/visual.spec.ts --repeat-each=3`
Expected: `72 passed`.

Preuve que la tolérance mord : restaurer temporairement dans `countryLayer.ts` les deux lignes `sdPx`/`gdPx` d'avant la Task 7 → `webgl2 telephone › question` et `› bonne-reponse` échouent (≈ 50 et 80 pixels différents) ; restaurer.

- [ ] **Step 3 : Montrer les six plans à l'utilisateur**

Assembler les six plans `*-webgpu-bureau-darwin.png` (et les six `*-webgl2-telephone-darwin.png`) en une planche et la lui envoyer : c'est l'apparence que la CI va figer (bloom de nuit, saturation du Sahara — Points à trancher). Ne pas attendre sa réponse pour continuer ; un réglage demandé ensuite se fait avec `--update-snapshots` et une nouvelle planche.

- [ ] **Step 4 : Mesurer le premier chargement**

**Créer** `web/playwright.budget.config.ts` :

```ts
import { defineConfig } from '@playwright/test';
import { CHROME_ARGS } from './playwright.config';

/** Budget du premier chargement (spec §6.6, §10.5) : build de production servi par `vite preview`. */
export default defineConfig({
  testDir: 'e2e-budget',
  timeout: process.env.CI ? 360_000 : 120_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5175', launchOptions: { args: CHROME_ARGS } },
  webServer: { command: 'npm run build && npx vite preview --port 5175 --strictPort', url: 'http://localhost:5175/', reuseExistingServer: false, timeout: 300_000 },
});
```

**Créer** `web/e2e-budget/first-load.spec.ts` :

```ts
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import type { ImageryIndex } from '../src/data/imagery';

/** Octets transférés jusqu'à l'arrivée sur le premier pays (texte compté gzip, comme le servira nginx). */
export const FIRST_LOAD_BUDGET = { standard: 8_000_000 } as const;
const imagery = JSON.parse(readFileSync('public/data/imagery.json', 'utf8')) as ImageryIndex;

test('premier chargement au niveau « standard » (WebGL 2) : globe, données, premier pays', async ({ page }) => {
  const rows: { url: string; bytes: number }[] = [];
  page.on('response', async (r) => {
    if (r.url().startsWith('blob:') || r.url().startsWith('data:')) return; // workers du transcodeur : pas du réseau
    const url = new URL(r.url()).pathname;
    if (r.status() === 404 && /\/patches\/img\/(\w+)-(\d+)\.ktx2$/.test(url)) {
      // patchs image hors dépôt (absents en CI) : on compte la taille que donne l'index
      const [, id, size] = url.match(/\/patches\/img\/(\w+)-(\d+)\.ktx2$/)!;
      rows.push({ url: `${url} (index)`, bytes: imagery.countries[id!.toUpperCase()]!.files[size!]!.bytes });
      return;
    }
    if (r.status() >= 300) return;
    const type = r.headers()['content-type'] ?? '';
    const sent = (await r.request().sizes()).responseBodySize; // 0 si servi par le cache du navigateur
    if (sent === 0) return;
    const body = /javascript|json|html|css|wasm/.test(type) ? await r.body().catch(() => null) : null;
    rows.push({ url, bytes: body ? gzipSync(body, { level: 9 }).length : sent });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?demo=FRA&webgl');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 0 });
  await page.waitForLoadState('networkidle');
  rows.sort((a, b) => b.bytes - a.bytes);
  const total = rows.reduce((s, r) => s + r.bytes, 0);
  console.log(rows.map((r) => `${String(r.bytes).padStart(9)}  ${r.url}`).join('\n'));
  console.log(`total ${total} octets (budget ${FIRST_LOAD_BUDGET.standard})`);
  expect(total).toBeLessThanOrEqual(FIRST_LOAD_BUDGET.standard);
});
```

**Modifier** `web/package.json` — remplacer :

```json
    "imagery": "tsx scripts/imagery/build-patches.ts"
```

par :

```json
    "imagery": "tsx scripts/imagery/build-patches.ts",
    "budget": "playwright test -c playwright.budget.config.ts"
```

**Modifier** `web/tsconfig.json` — remplacer :

```json
  "include": ["src", "scripts", "types", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
```

par :

```json
  "include": ["src", "scripts", "types", "e2e", "e2e-budget", "vite.config.ts", "vitest.config.ts", "playwright.config.ts", "playwright.budget.config.ts"]
```

Run: `npx tsc --noEmit && npm run budget`
Expected: `1 passed` ; tableau des requêtes (en tête : `2042258 /textures/surface-4k.ktx2`, `1283240 /textures/clouds-4k.ktx2`, `1096801 /textures/day-4k.ktx2`, `540654 /assets/index-….js`, `416263 /data/patches/sdf/fra.png`, `371627 /data/borders.json`, `323745 /textures/night-4k.ktx2`, `244553 /basis/basis_transcoder.wasm`, `124709 /data/patches/img/fra-1024.ktx2`…) et `total 6512996 octets (budget 8000000)` au prototype.

Preuve qu'il mord : `FIRST_LOAD_BUDGET.standard` à `6_000_000` → FAIL ; restaurer.

- [ ] **Step 5 : La CI — budget à chaque passage, références Linux à la demande**

**Modifier** `.github/workflows/web-ci.yml` — remplacer :

```yaml
      - run: npm run e2e
```

par :

```yaml
      - run: npm run e2e
      - run: npm run budget
```

**Créer** `.github/workflows/visual-baselines.yml` :

```yaml
name: visual-baselines
# Références visuelles Linux de web/e2e/visual.spec.ts, rendues sur le runner de la CI (x86_64 ; le poste est arm64).
# Déclenchement : gh workflow run visual-baselines.yml --ref <branche> ; puis
# gh run download <id> -n visual-linux -D web/e2e/visual.spec.ts-snapshots, relire, commiter.
on:
  workflow_dispatch:
jobs:
  baselines:
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
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test e2e/visual.spec.ts --update-snapshots
      - uses: actions/upload-artifact@v4
        with:
          name: visual-linux
          path: web/e2e/visual.spec.ts-snapshots/*-linux.png
```

- [ ] **Step 6 : Vérification complète, commit**

Run: `npm run check && npm run test:data && npm run e2e`
Expected: `Tests  173 passed (173)` ; données vertes (dont `imagery.test.ts` 4/4 et `textures.test.ts` 9/9) ; e2e : `483 passed` (11,6 min en local au prototype).

```bash
git add package.json tsconfig.json playwright.budget.config.ts e2e-budget e2e/visual.spec.ts e2e/visual.spec.ts-snapshots ../.github/workflows
git commit -m "e2e : six plans de référence (deux backends, téléphone et bureau) ; budget du premier chargement en CI ; workflow des références Linux"
```

- [ ] **Step 7 : Références Linux (actions externes : demander l'accord de l'utilisateur pour pousser)**

```bash
git push countriz phase1b-rendu
gh workflow run visual-baselines.yml --repo Pablohassan/Countrizz --ref phase1b-rendu
gh run list --repo Pablohassan/Countrizz --workflow visual-baselines.yml --limit 1     # attendre « completed success »
gh run download <id> --repo Pablohassan/Countrizz -n visual-linux -D e2e/visual.spec.ts-snapshots
git add e2e/visual.spec.ts-snapshots && git commit -m "e2e : références visuelles Linux (runner de la CI)" && git push countriz phase1b-rendu
```

Expected: 24 fichiers `*-linux.png` ; la CI suivante (`web`) est verte, budget compris. Tant que ces références manquent, le job `e2e` échoue sur `visual.spec.ts` (« snapshot doesn't exist ») : c'est attendu entre les deux poussées.

---

## Après ce plan

- **Phase 2 (jeu)** : intro (le soleil et son halo servent le lever de soleil derrière le limbe), « léger rapprochement pendant la révélation » (spec §5), page « Crédits » (NASA, Natural Earth, mledoze, geoBoundaries), mineurs M1 à M9 de la revue de la 1A.
- **Phase 3 (déploiement)** : dépôt des patchs image sur Garage et récupération au build de l'image (lire `garage-s3.md` en entier avant) ; nginx en gzip pour le texte (le budget le suppose).
- Le transcodeur basis est demandé par deux chargeurs KTX2 (textures globales, patchs image) ; le second sert le cache du navigateur (mesuré : 0 octet transféré). Un chargeur partagé par renderer l'éviterait sans rien changer au budget.
