# Countrizz — Phase 1A : globe jouable (rendu et caméra) · plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un globe three.js photoréaliste (WebGPU, repli WebGL 2) qui vole vers n'importe lequel des 197 pays et l'allume exactement là où il est, contrôlé en headless sur les deux backends.

**Architecture:** `geo/` et `camera/` sont du TypeScript pur (vecteurs, cadrage, vol de van Wijk, directeur, soleil), testés sous Vitest. `globe/` assemble la scène en `three/webgpu` + TSL **sans React** (classe `Globe`), puis R3F l'habille (`GlobeView`). Une page de sonde (`probe.html`) rend la même scène, en mode masque ou en mode jeu, pour les contrôles Playwright, qui comparent l'image au patch PNG lu côté CPU. Un pipeline Node produit les textures globales (NASA → KTX2).

**Tech Stack:** three 0.186.1 (`three/webgpu`, `three/tsl`), @react-three/fiber 9.8.1, React 19.3.0, TypeScript 5.9.3, Vite 8.3.2, Vitest 5.0.3, @playwright/test 1.63.0, d3-interpolate 3.0.1, sharp 0.35.5, toktx 4.4.2 (KTX-Software, installé sur le poste, pas en CI).

**Spec:** `docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md` (§4 rendu, §5 caméra, §8 tests, §10 points à valider). Contrat des patchs : `web/src/data/types.ts` (`PatchMeta`).

## Global Constraints

- Versions **exactes** (`npm install -E`) : three 0.186.1, @types/three 0.186.0, @react-three/fiber 9.8.1, d3-interpolate 3.0.1, @types/d3-interpolate 3.0.4, @playwright/test 1.63.0, sharp 0.35.5.
- Repère du globe : Terre = sphère unité centrée ; lng 0 → +X, lng +90 → −Z, pôle Nord → +Y (convention de `SphereGeometry` habillée d'une texture équirectangulaire, vérifiée au prototype).
- `geo/` et `camera/` n'importent **ni React ni three** (spec §2).
- Patch SDF : contrat de `PatchMeta` — forme close, `flipY = false`, `NoColorSpace`, chargement par `createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })`, hors cadre = hors du pays (jamais de clamp-to-edge).
- Textures KTX2 encodées avec `--lower_left_maps_to_s0t0` (en-tête `KTXorientation = ru`) ; couleur en ETC1S sRGB, relief/océan en UASTC linéaire ; transcodeurs basis servis depuis `/basis/`.
- R3F : prop `flat` (pas de tone mapping) ; **jamais `linear`** (la sortie doit rester sRGB : `#ffee03` sort à [255,238,3]).
- Caméra : champ vertical **50°** (celui de l'ancien globe.gl, `new PerspectiveCamera()`), vue d'ensemble **1,4** en paysage et **2,2** en portrait, vol de **1500 à 3500 ms**, ρ = √2.
- Le build et le jeu n'appellent **aucune API** ; seuls `npm run textures:fetch` (et ceux de la phase 0) touchent le réseau.
- Headless : Chromium de Playwright avec `--enable-unsafe-webgpu --enable-features=Vulkan --use-angle=swiftshader --use-webgpu-adapter=swiftshader` ; mesurer **sur la capture d'écran**, jamais en relisant le canvas (un readback de canvas WebGPU rend du noir).
- Crédits obligatoires (page Crédits en phase 2) : « NASA Earth Observatory » (Blue Marble NG), Black Marble 2016 (Joshua Stevens, Miguel Román, NASA GSFC), GEBCO (Jesse Allen, NASA Earth Observatory, BODC) ; aucun logo NASA.
- Règles du poste (hooks) : `grep`, `rg`, et `awk`/`sed` filtrant par motif sont **bloqués** — lire les fichiers en entier ou par plages ; toute API tierce exige la lecture de sa documentation dans la même session ; recopier les nombres exacts des sorties.

## Review Focus

1. **Redimensionnement ou rotation de l'écran pendant un vol** — le vol en cours continue sans saut ; le vol suivant cadre avec le nouveau viewport. Test : Task 3 (`director.test.ts`, « un changement de viewport pendant un vol ne fait pas sauter la caméra »).
2. **Patch absent (404) ou lent** — la manche n'est jamais bloquée : `flyTo` se résout à l'arrivée, le pays s'affiche avec sa balise faute de remplissage. Test : Task 11 (`flight.spec.ts`, patch intercepté en 404).
3. **Navigateur sans WebGPU ni WebGL 2, ou perte du GPU** — message « navigateur non compatible » dans le premier cas ; dans le second, le renderer est recréé et la partie continue. Tests : Task 11 (`flight.spec.ts`, Chromium lancé avec `--disable-webgl` ; perte simulée par `onDeviceLost`).
4. **Antiméridien et micro-États au plancher** (Fidji, Kiribati, Russie, Vatican) — remplissage continu de part et d'autre de 180°, Vatican lisible. Tests : Task 5 (`patch.spec.ts`) et Task 12 (`countries.spec.ts`).
5. **Vol qui passe par un pôle** (Canada → Russie) — l'image ne se retourne pas d'un coup. Test : Task 2 (`flight.test.ts`, « ne se retourne pas d'un coup en passant au-dessus du pôle »).

---

## Prototype du 02/10/2026 : ce qui est déjà prouvé

Prototype jetable (scratchpad de la session du 02/10), three 0.186.1, Chromium 153 (Playwright 1.63) headless, chaque mesure faite sur les **deux** backends avec des résultats identiques au pixel près :

| Point du spec | Résultat |
|---|---|
| §10.1 CI headless | Sans option, Chromium headless n'expose pas WebGPU et `WebGPURenderer` se replie seul sur WebGL 2. Avec `--enable-unsafe-webgpu` seul, le backend WebGPU est obtenu mais la capture est **noire** ; avec les 4 options des contraintes globales, WebGPU passe par SwiftShader et rend juste. ≈ 0,5 s par pays et par backend. **Linux (CI) reste à vérifier** (Task 12). |
| Patch SDF dans le shader | France, USA, Fidji (antiméridien) et Vatican (demi-cadre 3,5·10⁻⁴ rad) s'allument là où on l'attend, sur des points asymétriques (Dunkerque, Brest, Strasbourg… dedans ; Londres, Barcelone, Genève… dehors). La forme close via le repère tangent (c = atan2(\|P×C\|, P·C)) reste précise au Vatican. |
| §10.2 lignes épaisses | `LineSegments2` + `Line2NodeMaterial` (addons `lines/webgpu`) : 61 348 segments de `borders.json`, trait de 2 px pour `linewidth` 2. `transparent = true` + `opacity` 0,4 mélange bien (pixel [19,34,60] au lieu de [0,0,0]) : l'estompage avec l'altitude est possible. **Pas de rubans au build.** |
| §10.3 KTX2 | `KTX2Loader.detectSupport(renderer)` après `await renderer.init()` : UASTC (→ ASTC 4×4) et ETC1S (→ ETC2) sur les deux backends. Les textures compressées ignorent `flipY` : encodées sans option, elles sortent **retournées nord-sud** ; avec `toktx --lower_left_maps_to_s0t0`, les quatre quadrants sont à leur place. Black Marble 4096 px : ETC1S 323 745 octets, UASTC 2 570 788 ; 8192 px : ETC1S 1 123 251, UASTC 9 468 650. |
| R3F 9.8.1 | Fabrique `gl` asynchrone (`new WebGPURenderer` + `await init()`) : rendu juste sur les deux backends, aucune erreur de console ; `tsc` strict passe. La prop `linear` assombrit tout ([1,8,90] au lieu de [16,48,160]). |
| Terre (TSL) | `MeshStandardNodeMaterial` : jour, rugosité de l'océan, lumières de nuit en émissif côté nuit (terre de nuit [1,5,1], ville [255,246,149]), halo de limbe bleu côté jour [119,164,206] et orangé faible côté nuit [62,41,21], étoiles en points de 1 px. |
| Couche pays | Superposition par `outputNode` (nœud `output`) : jaune exact, vague de révélation, états bonne/mauvaise réponse, lignes voisines (canal G), mode masque exact ([255,255,255] / [0,0,0]). Patch chargé par `ImageBitmap` sans conversion. |
| Balise | `Sprite` + `PointsNodeMaterial` (`sizeAttenuation: false`) : taille en pixels CSS. |

**Pièges trouvés au prototype (à ne pas refaire) :**
- Sur une face arrière (`BackSide`), `normalWorld` est **retourné vers l'intérieur** : le halo calculé avec lui inverse jour et nuit. Utiliser `normalize(positionWorld)` (sphère centrée).
- `PointsNodeMaterial` sur un `Sprite` unique **exige `positionNode = vec3(0, 0, 0)`** ; sans lui, les sommets du quad (±0,5 en unités du monde) sont projetés puis décalés une seconde fois et rien n'apparaît.
- `@types/three` 0.186 type TSL strictement : un `uniform` construit sur une valeur `any` (JSON) ne se compose plus (`UniformNode<any>`), un `Fn` à paramètres déstructurés ne se type pas ; écrire les nœuds en fonctions TypeScript ordinaires sur des valeurs typées.
- `@types/d3-interpolate` 3.0.4 place `rho` sur l'interpolateur rendu ; à l'exécution, `rho` est porté par la fabrique (`zoom.js:65`). Cast documenté dans `flight.ts`.
- `atan2` n'existe pas en TSL r186 : `atan(y, x)`.
- `renderer.backend.isWebGPUBackend` n'est pas typé : passer par un cast `{ isWebGPUBackend?: boolean }`.
- La limite de taille de texture ne s'obtient que par le backend (`device.limits.maxTextureDimension2D` ou `MAX_TEXTURE_SIZE`).

## Point à trancher avec l'utilisateur au cours de ce plan

**La formule de cadrage du spec et son facteur `k`** (Task 13). `altitude = k · (cos θ + sin θ / tan(α/m)) − 1` : `k` multiplie la **distance au centre de la Terre**, donc pour un micro-État (θ → 0) l'altitude tend vers `k − 1` quel que soit le pays. Mesuré le 02/10 : l'ancienne table d'altitudes correspond à un `k` de 0,776 à 1,804 selon le pays (médiane 1,604 sur 197) ; avec le `k` médian des pays de référence (1,338, hors Vatican et Kiribati), aucun petit pays ne descendrait sous 0,338 rayon, ce qui contredit le spec lui-même (« seul le Vatican atteint le plancher »). Le code implémente la formule telle quelle ; la page de calibration (Task 13) montre l'effet de `k` et de `m` pour que l'utilisateur choisisse (garder `k ≈ 1` et régler le contexte par `m`, ou autre forme).

## Arborescence produite par ce plan

```
web/
├─ probe.html · calibrate.html                 pages de test et de calibration (servies en dev, hors build)
├─ playwright.config.ts
├─ e2e/                                         contrôles Playwright (deux backends)
│  ├─ sdf-check.ts                              comparaison image ↔ patch PNG lu côté CPU
│  └─ patch · earth · reveal · borders · beacon · flight · countries .spec.ts
├─ scripts/
│  ├─ copy-basis.mjs                            transcodeurs basis → public/basis (non versionné)
│  └─ textures/                                 pipeline NASA → KTX2
│     ├─ config.ts · paths.ts · fetch-textures.ts · build-textures.ts · textures.lock.json · rapport-textures.md
│     ├─ lib/  landMask · ktx2
│     └─ __tests__/ unit/ (landMask, ktx2) · data/ (textures)
├─ public/textures/                             SORTIES versionnées : day-8k · day-4k · night-8k · night-4k · surface-4k (.ktx2), credits.json
└─ src/
   ├─ geo/vec.ts                                vecteurs et repère du globe
   ├─ camera/  framing · flight · director · sun · config
   ├─ data/countries.ts                         chargement et contrôle de countries.json
   ├─ globe/   patchFrame · patchTexture · countryLayer · renderer · globe · textures · earth · atmosphere · stars
   │           reveal · borders · beacon · patchCache · GlobeView.tsx · three-elements.d.ts
   ├─ probe/main.ts · calibrate/main.tsx
   └─ main.tsx                                  démonstration (vols, révélations) en attendant la phase 2
```

Exécution : sur une branche `phase1a-globe` créée depuis `newcountri` (superpowers:using-git-worktrees si l'exécutant le souhaite). Toutes les commandes se lancent depuis `web/` sauf mention contraire.

**Prérequis :** le contrat des patchs (mineur n°5 de la revue de la phase 0 : forme close dans `web/src/data/types.ts` et 6 tests dans `web/scripts/geodata/__tests__/unit/patch.test.ts`) est commité sur `newcountri` ; `npm run check` y passe avec 68 tests unitaires. Le cache `web/scripts/geodata/.cache/` (`npm run geodata:fetch`) est présent : la Task 6 y lit Natural Earth.

**Vérification du plan lui-même (02/10) :** tout le code de ce plan a tourné dans un bac à sable qui reproduit `web/` ; les suites de modifications des Tasks 7 à 10 redonnent, appliquées dans l'ordre, les fichiers finaux au caractère près ; à chaque tâche, `tsc` et les tests unitaires passent ; à la fin, 67 tests unitaires et **428 tests Playwright** passent (0 échec), dont les 197 pays sur les deux backends.

---
### Task 1 : Géométrie sphérique et cadrage

**Files:**
- Create: `web/src/geo/vec.ts`, `web/src/camera/framing.ts`
- Test: `web/src/geo/vec.test.ts`, `web/src/camera/framing.test.ts`

**Interfaces:**
- Consumes: `LngLat` (`web/src/data/types.ts`).
- Produces: `type Vec3 = readonly [number, number, number]` ; `toVec(p: LngLat): Vec3` ; `toLngLat(v: Vec3): LngLat` ; `dot`, `cross`, `scale`, `add`, `length`, `normalize` ; `angleBetween(a, b): number` ; `rotate(v, axis, angle): Vec3` ; `slerp(a, b, t): Vec3` ; `northUp(dir): Vec3`. `interface Viewport { width; height; fovYDeg }` ; `interface FramingParams { k; margin; floor; overview: { landscape; portrait } }` ; `limitingHalfAngle(v): number` (rad) ; `overviewAltitude(v, p): number` ; `frameAltitude(capRadiusDeg, v, p): number` (rayons terrestres).

Les valeurs attendues des tests sont calculées à la main : France, θ = 4,866456°, α = 25°, m = 1,2 → cos θ + sin θ / tan(20,8333°) − 1 = 0,21933 ; portrait 390×844 → α = atan(tan 25° × 390/844) = 12,1598°.

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
// web/src/geo/vec.test.ts
import { describe, expect, it } from 'vitest';
import { angleBetween, northUp, slerp, toLngLat, toVec } from './vec';

const close = (a: readonly number[], b: readonly number[], digits = 9) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

describe('repère du globe (même convention que SphereGeometry + texture équirectangulaire)', () => {
  it('place les points cardinaux', () => {
    close(toVec([0, 0]), [1, 0, 0]);
    close(toVec([90, 0]), [0, 0, -1]);
    close(toVec([-90, 0]), [0, 0, 1]);
    close(toVec([180, 0]), [-1, 0, 0]);
    close(toVec([0, 90]), [0, 1, 0]);
  });
  it('aller-retour lng/lat, antiméridien compris', () => {
    for (const p of [[2.35, 48.85], [-179.5, -16], [179.5, 65], [0, -89]] as [number, number][]) close(toLngLat(toVec(p)), p);
  });
});

describe('angles et interpolation sphérique', () => {
  it('angle droit et très petit angle', () => {
    expect(angleBetween(toVec([0, 0]), toVec([90, 0]))).toBeCloseTo(Math.PI / 2, 12);
    // 1e-6° : acos perdrait tout, atan2(|a×b|, a·b) garde la précision
    expect(angleBetween(toVec([12.45, 41.9]), toVec([12.45 + 1e-6, 41.9])) / ((1e-6 * Math.PI) / 180)).toBeCloseTo(Math.cos((41.9 * Math.PI) / 180), 4);
  });
  it('slerp suit le grand cercle et franchit l’antiméridien par le court chemin', () => {
    close(toLngLat(slerp(toVec([0, 0]), toVec([90, 0]), 0.5)), [45, 0]);
    expect(Math.abs(toLngLat(slerp(toVec([179, 0]), toVec([-179, 0]), 0.5))[0])).toBeCloseTo(180, 9);
    close(slerp(toVec([10, 20]), toVec([30, 40]), 0), toVec([10, 20]));
    close(slerp(toVec([10, 20]), toVec([30, 40]), 1), toVec([30, 40]));
    close(slerp(toVec([10, 20]), toVec([10, 20]), 0.3), toVec([10, 20]));
  });
  it('le nord en haut est tangent et pointe vers le pôle', () => {
    const d = toVec([2.35, 48.85]);
    const u = northUp(d);
    expect(u[0] * d[0] + u[1] * d[1] + u[2] * d[2]).toBeCloseTo(0, 12);
    expect(u[1]).toBeGreaterThan(0);
    close(northUp(toVec([0, 0])), [0, 1, 0]);
  });
});
```

```ts
// web/src/camera/framing.test.ts
import { describe, expect, it } from 'vitest';
import { frameAltitude, limitingHalfAngle, overviewAltitude } from './framing';

const deg = Math.PI / 180;
const desktop = { width: 1300, height: 750, fovYDeg: 50 };
const phone = { width: 390, height: 844, fovYDeg: 50 };
const params = { k: 1, margin: 1.2, floor: 0.0005, overview: { landscape: 1.4, portrait: 2.2 } };

describe('demi-champ limitant', () => {
  it('vertical en paysage', () => {
    expect(limitingHalfAngle(desktop)).toBeCloseTo(25 * deg, 12);
  });
  it('horizontal en portrait : atan(tan 25° × 390/844) = 12,1598°', () => {
    expect(limitingHalfAngle(phone) / deg).toBeCloseTo(12.1598, 4);
  });
});

describe('altitude de cadrage : k·(cos θ + sin θ / tan(α/m)) − 1, bornée', () => {
  it('France (θ = 4,8665°) au bureau : 0,21933', () => {
    expect(frameAltitude(4.866456269099665, desktop, params)).toBeCloseTo(0.21933, 5);
  });
  it('la même France recule en portrait : 0,47106', () => {
    expect(frameAltitude(4.866456269099665, phone, params)).toBeCloseTo(0.47106, 5);
  });
  it('k multiplie la distance au centre de la Terre', () => {
    expect(frameAltitude(4.866456269099665, desktop, { ...params, k: 1.2 })).toBeCloseTo(1.2 * 1.21933 - 1, 5);
  });
  it('plancher pour un point, plafond à la vue d’ensemble', () => {
    expect(frameAltitude(0, desktop, params)).toBe(params.floor);
    expect(frameAltitude(80, desktop, params)).toBe(1.4);
    expect(frameAltitude(80, phone, params)).toBe(2.2);
  });
  it('vue d’ensemble : 1,4 en paysage, 2,2 en portrait (valeurs de l’ancien jeu)', () => {
    expect(overviewAltitude(desktop, params)).toBe(1.4);
    expect(overviewAltitude(phone, params)).toBe(2.2);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run --project unit src/geo src/camera`
Expected : FAIL — modules `./vec` et `./framing` introuvables.

- [ ] **Step 3 : Implémenter**

```ts
// web/src/geo/vec.ts
import type { LngLat } from '../data/types';

/** Vecteur 3D immuable ; la Terre est la sphère unité centrée à l'origine. */
export type Vec3 = readonly [number, number, number];
export type { LngLat };

const RAD = Math.PI / 180;

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const length = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a));

/**
 * lng/lat (degrés) → vecteur unitaire. Même repère que `SphereGeometry` de three habillée d'une texture
 * équirectangulaire : lng 0 → +X, lng +90 → −Z, pôle Nord → +Y.
 */
export function toVec([lng, lat]: LngLat): Vec3 {
  const l = lng * RAD, p = lat * RAD;
  return [Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)];
}

export function toLngLat(v: Vec3): LngLat {
  const n = normalize(v);
  return [Math.atan2(-n[2], n[0]) / RAD, Math.asin(Math.max(-1, Math.min(1, n[1]))) / RAD];
}

/** Angle entre deux directions, précis aussi pour les très petits angles (atan2 plutôt qu'acos). */
export const angleBetween = (a: Vec3, b: Vec3): number => Math.atan2(length(cross(a, b)), dot(a, b));

/** Rotation de `v` d'un angle `angle` autour de l'axe unitaire `axis` (Rodrigues). */
export function rotate(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
}

/** Interpolation sphérique le long du grand cercle (le plus court chemin, antiméridien compris). */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const omega = angleBetween(a, b);
  if (omega < 1e-12) return a;
  const s = Math.sin(omega);
  return add(scale(a, Math.sin((1 - t) * omega) / s), scale(b, Math.sin(t * omega) / s));
}

/** « Nord en haut » : l'axe des pôles projeté sur le plan tangent en `dir` (indéfini exactement au pôle). */
export function northUp(dir: Vec3): Vec3 {
  const u = add([0, 1, 0], scale(dir, -dir[1]));
  const n = length(u);
  return n < 1e-12 ? [0, 0, -1] : scale(u, 1 / n);
}
```

```ts
// web/src/camera/framing.ts
export interface Viewport { width: number; height: number; fovYDeg: number }

/** k : facteur de contexte (multiplie la distance au centre) ; margin : m ; altitudes en rayons terrestres. */
export interface FramingParams { k: number; margin: number; floor: number; overview: { landscape: number; portrait: number } }

const RAD = Math.PI / 180;

/** Demi-champ limitant α : vertical en paysage, horizontal en portrait. */
export function limitingHalfAngle(v: Viewport): number {
  const halfV = (v.fovYDeg * RAD) / 2;
  const halfH = Math.atan(Math.tan(halfV) * (v.width / v.height));
  return Math.min(halfV, halfH);
}

/** Vue d'ensemble : altitude de l'ancien jeu, 1,4 (bureau, paysage) / 2,2 (mobile, portrait). */
export const overviewAltitude = (v: Viewport, p: FramingParams): number =>
  v.width >= v.height ? p.overview.landscape : p.overview.portrait;

/** Spec §5 : altitude = k · (cos θ + sin θ / tan(α / m)) − 1, bornée à [floor ; overview]. */
export function frameAltitude(capRadiusDeg: number, v: Viewport, p: FramingParams): number {
  const theta = capRadiusDeg * RAD;
  const alpha = limitingHalfAngle(v);
  const altitude = p.k * (Math.cos(theta) + Math.sin(theta) / Math.tan(alpha / p.margin)) - 1;
  return Math.min(overviewAltitude(v, p), Math.max(p.floor, altitude));
}
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npx vitest run --project unit src/geo src/camera && npx tsc --noEmit`
Expected : PASS (vec : 5 tests, framing : 7 tests), `tsc` sans erreur.

- [ ] **Step 5 : Commit**

```bash
git add web/src/geo web/src/camera/framing.ts web/src/camera/framing.test.ts
git commit -m "camera : repère du globe, vecteurs et formule de cadrage"
```

---

### Task 2 : Vol de van Wijk sur la sphère

**Files:**
- Create: `web/src/camera/flight.ts`
- Test: `web/src/camera/flight.test.ts`
- Modify: `web/package.json` (dépendances)

**Interfaces:**
- Consumes: `geo/vec` (Task 1).
- Produces: `interface Pose { dir: Vec3; altitude: number; up: Vec3 }` ; `interface FlightParams { alphaRad; rho; timeScale; minMs; maxMs; reducedMotion? }` ; `interface Flight { durationMs: number; at(t: number): Pose }` ; `planFlight(from: Pose, to: Pose, p: FlightParams): Flight`.

La trajectoire : direction sur le grand cercle, altitude par le profil de van Wijk & Nuij (`d3.interpolateZoom`, la largeur vue étant w = 2·h·tan α), temps en cubique (« dézoom → vol → arrivée, courbe cubique », spec §5). Le **haut de l'image** est transporté parallèlement le long du grand cercle, puis tourné progressivement pour arriver « nord en haut » : sans cela, un vol qui passe au-dessus d'un pôle retourne l'image d'un coup (Review Focus n°5 ; une mutation qui remplace ce transport par `northUp(dir)` fait échouer le test du pôle). Mesures du 02/10 avec ρ = √2 : France → Italie culmine à 0,29 rayon, France → Japon à 1,65, Chili → Mongolie (166,5°) à 3,18 ; durées naturelles de 919 à 3 836 ms, d'où le bornage.

- [ ] **Step 1 : Installer les dépendances**

```bash
npm install -E d3-interpolate@3.0.1
npm install -E -D @types/d3-interpolate@3.0.4
```

- [ ] **Step 2 : Écrire le test qui échoue**

```ts
// web/src/camera/flight.test.ts
import { describe, expect, it } from 'vitest';
import { planFlight, type Pose } from './flight';
import { angleBetween, northUp, toVec, type Vec3 } from '../geo/vec';

const deg = Math.PI / 180;
const params = { alphaRad: 25 * deg, rho: Math.SQRT2, timeScale: 1, minMs: 1500, maxMs: 3500 };
const pose = (lngLat: [number, number], altitude: number): Pose => {
  const dir = toVec(lngLat);
  return { dir, altitude, up: northUp(dir) };
};
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sample = (f: ReturnType<typeof planFlight>, n = 2000) => Array.from({ length: n + 1 }, (_, i) => f.at(i / n));

describe('vol de van Wijk sur la sphère', () => {
  const paris = pose([2.35, 48.85], 0.22), tokyo = pose([139.7, 35.7], 0.39);
  const f = planFlight(paris, tokyo, params);

  it('part de la pose de départ et arrive exactement sur la cible', () => {
    const [a, b] = [f.at(0), f.at(1)];
    expect(angleBetween(a.dir, paris.dir)).toBeLessThan(1e-9);
    expect(a.altitude).toBeCloseTo(0.22, 9);
    expect(angleBetween(b.dir, tokyo.dir)).toBeLessThan(1e-9);
    expect(b.altitude).toBeCloseTo(0.39, 9);
    expect(angleBetween(b.up, tokyo.up)).toBeLessThan(1e-9);
  });

  it('monte puis redescend quand la distance est grande', () => {
    const top = Math.max(...sample(f).map((p) => p.altitude));
    expect(top).toBeGreaterThan(1);
  });

  it('reste continu : ni saut de direction ni saut d’altitude', () => {
    const s = sample(f);
    for (let i = 1; i < s.length; i++) {
      expect(angleBetween(s[i - 1]!.dir, s[i]!.dir)).toBeLessThan(0.5 * deg);
      expect(Math.abs(s[i]!.altitude - s[i - 1]!.altitude)).toBeLessThan(0.01);
    }
  });

  it('durée bornée à [1500 ; 3500] ms', () => {
    expect(f.durationMs).toBeGreaterThanOrEqual(1500);
    expect(f.durationMs).toBeLessThanOrEqual(3500);
    expect(planFlight(pose([6.1, 49.6], 0.02), pose([4.5, 50.6], 0.06), params).durationMs).toBeGreaterThanOrEqual(1500);
  });
});

describe('le haut de la caméra', () => {
  it('ne se retourne pas d’un coup en passant au-dessus du pôle', () => {
    // (−100°, 70°) → (80°, 70°) : le grand cercle passe par le pôle Nord
    const f = planFlight(pose([-100, 70], 0.9), pose([80, 70], 1.3), params);
    const s = sample(f);
    let worst = 0;
    for (let i = 1; i < s.length; i++) worst = Math.max(worst, angleBetween(s[i - 1]!.up, s[i]!.up));
    expect(worst).toBeLessThan(1 * deg);
    for (const p of s) expect(Math.abs(dot(p.up, p.dir))).toBeLessThan(1e-9);
    expect(angleBetween(f.at(1).up, northUp(toVec([80, 70])))).toBeLessThan(1e-9);
  });

  it('un vol sur place garde le nord en haut', () => {
    const a = pose([2.35, 48.85], 0.22);
    const f = planFlight(a, { ...a, altitude: 0.5 }, params);
    expect(angleBetween(f.at(0.5).up, a.up)).toBeLessThan(1e-9);
    expect(f.at(1).altitude).toBeCloseTo(0.5, 9);
  });
});

describe('mouvement réduit', () => {
  it('coupe : durée nulle, arrivée immédiate', () => {
    const f = planFlight(pose([0, 0], 0.5), pose([90, 0], 0.3), { ...params, reducedMotion: true });
    expect(f.durationMs).toBe(0);
    expect(angleBetween(f.at(0).dir, toVec([90, 0]))).toBeLessThan(1e-9);
  });
});
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

Run: `npx vitest run --project unit src/camera/flight.test.ts`
Expected : FAIL — module `./flight` introuvable.

- [ ] **Step 4 : Implémenter**

```ts
// web/src/camera/flight.ts
import { interpolateZoom } from 'd3-interpolate';
import { angleBetween, cross, dot, length, normalize, rotate, scale, add, type Vec3 } from '../geo/vec';

/** Pose de caméra : direction du point visé, altitude (rayons terrestres), haut de l'image (tangent en `dir`). */
export interface Pose { dir: Vec3; altitude: number; up: Vec3 }

export interface FlightParams {
  /** Demi-champ limitant (rad) : convertit l'altitude en largeur vue, w = 2 · h · tan α. */
  alphaRad: number;
  /** Compromis zoom / translation de van Wijk & Nuij (d3 : √2). */
  rho: number;
  /** Facteur appliqué à la durée naturelle de d3 avant bornage. */
  timeScale: number;
  minMs: number;
  maxMs: number;
  reducedMotion?: boolean;
}

export interface Flight { durationMs: number; at(t: number): Pose }

// @types/d3-interpolate 3.0.4 place `rho` sur l'interpolateur rendu ; à l'exécution, c'est la fabrique qui le porte
// (d3-interpolate 3.0.1, src/zoom.js : `zoom.rho = function(_) { … return zoomRho(…) }`).
const zoomWithRho = (rho: number) => (interpolateZoom as unknown as { rho(r: number): typeof interpolateZoom }).rho(rho);

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Angle signé de `a` vers `b` autour de l'axe unitaire `axis` (a, b ⟂ axis). */
const signedAngle = (a: Vec3, b: Vec3, axis: Vec3) => Math.atan2(dot(axis, cross(a, b)), dot(a, b));

/**
 * Vol en grand cercle avec le profil d'altitude de van Wijk & Nuij (d3.interpolateZoom), temps en cubique.
 * Le haut de l'image est transporté parallèlement le long du grand cercle (aucun retournement au passage
 * d'un pôle), puis tourné progressivement pour arriver « nord en haut » sur la cible.
 */
export function planFlight(from: Pose, to: Pose, p: FlightParams): Flight {
  if (p.reducedMotion) return { durationMs: 0, at: () => to };

  const d = angleBetween(from.dir, to.dir);
  const tanA = Math.tan(p.alphaRad);
  const zoom = zoomWithRho(p.rho)([0, 0, 2 * from.altitude * tanA], [d, 0, 2 * to.altitude * tanA]);
  const durationMs = Math.min(p.maxMs, Math.max(p.minMs, zoom.duration * p.timeScale));

  // Axe du grand cercle ; sur place (d ≈ 0), un axe quelconque ⟂ dir convient : la direction ne bouge pas.
  const rawAxis = cross(from.dir, to.dir);
  const axis = length(rawAxis) > 1e-12 ? normalize(rawAxis) : normalize(cross(from.dir, from.up));
  const t0 = cross(axis, from.dir); // tangente au départ, sens du mouvement
  const a = dot(from.up, t0), b = dot(from.up, axis);
  const dirAt = (u: number): Vec3 => add(scale(from.dir, Math.cos(u)), scale(t0, Math.sin(u)));
  const transportedUp = (u: number): Vec3 => {
    const tangent = add(scale(t0, Math.cos(u)), scale(from.dir, -Math.sin(u)));
    return add(scale(tangent, a), scale(axis, b));
  };
  const roll = signedAngle(transportedUp(d), to.up, to.dir);

  return {
    durationMs,
    at(t: number): Pose {
      if (t >= 1) return to;
      const s = easeInOutCubic(Math.max(0, t));
      const [u, , w] = zoom(s) as [number, number, number];
      const dir = dirAt(u);
      return { dir, altitude: w / (2 * tanA), up: rotate(transportedUp(u), dir, roll * s) };
    },
  };
}
```

- [ ] **Step 5 : Lancer, vérifier le succès**

Run: `npx vitest run --project unit src/camera && npx tsc --noEmit`
Expected : PASS (flight : 7 tests), `tsc` sans erreur.

- [ ] **Step 6 : Commit**

```bash
git add web/package.json web/package-lock.json web/src/camera/flight.ts web/src/camera/flight.test.ts
git commit -m "camera : vol de van Wijk sur le grand cercle, haut de l'image transporté"
```

---

### Task 3 : CameraDirector, soleil et réglages

**Files:**
- Create: `web/src/camera/director.ts`, `web/src/camera/sun.ts`, `web/src/camera/config.ts`
- Test: `web/src/camera/director.test.ts`, `web/src/camera/sun.test.ts`

**Interfaces:**
- Consumes: `geo/vec`, `camera/framing` (Task 1), `camera/flight` (Task 2).
- Produces: `class CameraDirector` — `constructor(opts: DirectorOptions)`, `setViewport(v)`, `setFraming(p)`, `setIdleSpin(degPerSec)`, `flyTo(target: FrameTarget): Promise<void>`, `flyToOverview(): Promise<void>`, `update(nowMs): FramePose` ; `interface FrameTarget { cap: { center: LngLat; radiusDeg: number } }` (un `CountryRecord` convient) ; `interface FramePose extends Pose { cut: boolean }` ; `sunDirection(pose: Pose, angleDeg = 55): Vec3` ; constantes `FOV_Y_DEG`, `FRAMING`, `FLIGHT`.

Le directeur ne connaît pas l'horloge : la boucle de rendu lui passe `now` à chaque frame, ce qui rend les tests déterministes. Un `flyTo` lancé pendant un vol repart de la pose courante et **résout** la promesse précédente (le jeu ne reste jamais suspendu). En mouvement réduit, le vol dure 0 ms et la frame d'arrivée porte `cut = true` pour que la couche de rendu fonde l'image. Le soleil est placé à 55° du point visé, venant du haut à gauche de l'image : le pays est toujours de jour et, en vue d'ensemble, le terminateur passe dans la partie visible du globe (spec §5).

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
// web/src/camera/director.test.ts
import { describe, expect, it } from 'vitest';
import { CameraDirector } from './director';
import { angleBetween, toLngLat, toVec } from '../geo/vec';

const opts = {
  viewport: { width: 1300, height: 750, fovYDeg: 50 },
  framing: { k: 1, margin: 1.2, floor: 0.0005, overview: { landscape: 1.4, portrait: 2.2 } },
  flight: { rho: Math.SQRT2, timeScale: 1, minMs: 1500, maxMs: 3500 },
  reducedMotion: false,
  start: [2.35, 48.85] as [number, number],
};
const japan = { cap: { center: [137.5, 36.2] as [number, number], radiusDeg: 8.84 } };
const france = { cap: { center: [1.86, 46.6] as [number, number], radiusDeg: 4.87 } };

describe('CameraDirector', () => {
  it('démarre en vue d’ensemble au-dessus du point de départ', () => {
    const d = new CameraDirector(opts);
    const p = d.update(0);
    expect(p.altitude).toBe(1.4);
    expect(angleBetween(p.dir, toVec([2.35, 48.85]))).toBeLessThan(1e-9);
  });

  it('flyTo se résout à l’arrivée, pas avant', async () => {
    const d = new CameraDirector(opts);
    d.update(0);
    let done = false;
    const flight = d.flyTo(japan).then(() => { done = true; });
    d.update(100);
    await Promise.resolve();
    expect(done).toBe(false);
    d.update(100 + 3500);
    await flight;
    expect(done).toBe(true);
    expect(angleBetween(d.update(5000).dir, toVec(japan.cap.center))).toBeLessThan(1e-9);
  });

  it('un second flyTo repart de la pose courante, sans saut, et libère le premier', async () => {
    const d = new CameraDirector(opts);
    d.update(0);
    const first = d.flyTo(japan);
    d.update(800);
    const before = d.update(800);
    const second = d.flyTo(france);
    const after = d.update(800);
    expect(angleBetween(before.dir, after.dir)).toBeLessThan(1e-9);
    await first;
    d.update(10_000);
    await second;
  });

  it('le cadrage suit le viewport courant', () => {
    const d = new CameraDirector(opts);
    d.update(0);
    void d.flyTo(france);
    d.update(10_000);
    const desktopAlt = d.update(10_000).altitude;
    d.setViewport({ width: 390, height: 844, fovYDeg: 50 });
    void d.flyTo(france);
    d.update(30_000);
    expect(d.update(30_000).altitude).toBeGreaterThan(desktopAlt);
  });

  it('un changement de viewport pendant un vol ne fait pas sauter la caméra', () => {
    const d = new CameraDirector(opts);
    d.update(0);
    void d.flyTo(japan);
    const a = d.update(1000);
    d.setViewport({ width: 390, height: 844, fovYDeg: 50 });
    const b = d.update(1000);
    expect(angleBetween(a.dir, b.dir)).toBeLessThan(1e-12);
    expect(b.altitude).toBe(a.altitude);
  });

  it('setFraming change le cadrage des vols suivants', () => {
    const d = new CameraDirector(opts);
    d.update(0);
    void d.flyTo(france);
    d.update(10_000);
    const before = d.update(10_000).altitude;
    d.setFraming({ ...opts.framing, margin: 2.4 });
    void d.flyTo(france);
    d.update(30_000);
    expect(d.update(30_000).altitude).toBeGreaterThan(before);
  });

  it('mouvement réduit : coupe à la frame suivante, signalée', async () => {
    const d = new CameraDirector({ ...opts, reducedMotion: true });
    d.update(0);
    const flight = d.flyTo(japan);
    const p = d.update(16);
    await flight;
    expect(p.cut).toBe(true);
    expect(angleBetween(p.dir, toVec(japan.cap.center))).toBeLessThan(1e-9);
  });

  it('rotation lente au repos : la caméra glisse vers l’ouest, la Terre semble tourner vers l’est', () => {
    const d = new CameraDirector(opts);
    d.update(0);
    d.setIdleSpin(6);
    const a = toLngLat(d.update(0).dir), b = toLngLat(d.update(1000).dir);
    expect(b[0] - a[0]).toBeCloseTo(-6, 9);
    expect(b[1]).toBeCloseTo(a[1], 9);
  });
});
```

```ts
// web/src/camera/sun.test.ts
import { describe, expect, it } from 'vitest';
import { sunDirection } from './sun';
import { dot, northUp, toVec, angleBetween, type Vec3 } from '../geo/vec';

const pose = (lngLat: [number, number], altitude: number) => {
  const dir = toVec(lngLat);
  return { dir, altitude, up: northUp(dir) };
};

describe('soleil placé par rapport à la caméra', () => {
  it('le point visé est toujours de jour, à 55° du soleil', () => {
    for (const p of [pose([2.35, 48.85], 0.22), pose([-70, -35], 1.4), pose([178, -17], 0.08)]) {
      expect(angleBetween(sunDirection(p), p.dir)).toBeCloseTo((55 * Math.PI) / 180, 9);
    }
  });

  it('en vue d’ensemble, le terminateur passe dans la partie visible du globe', () => {
    const p = pose([10, 20], 1.4);
    const sun = sunDirection(p);
    const camera: Vec3 = [p.dir[0] * 2.4, p.dir[1] * 2.4, p.dir[2] * 2.4];
    let day = 0, night = 0;
    for (let i = 0; i < 4000; i++) {
      const z = (i / 4000) * 2 - 1, a = i * 2.399963;
      const q: Vec3 = [Math.sqrt(1 - z * z) * Math.cos(a), z, Math.sqrt(1 - z * z) * Math.sin(a)];
      const visible = dot(q, camera) > 1; // en avant de l'horizon
      if (!visible) continue;
      if (dot(q, sun) > 0) day++; else night++;
    }
    expect(day).toBeGreaterThan(0);
    expect(night).toBeGreaterThan(0);
  });

  it('le soleil vient du haut à gauche de l’image', () => {
    const p = pose([2.35, 48.85], 0.22);
    const sun = sunDirection(p);
    const right: Vec3 = [p.up[1] * p.dir[2] - p.up[2] * p.dir[1], p.up[2] * p.dir[0] - p.up[0] * p.dir[2], p.up[0] * p.dir[1] - p.up[1] * p.dir[0]];
    expect(dot(sun, p.up)).toBeGreaterThan(0);
    expect(dot(sun, right)).toBeLessThan(0);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run --project unit src/camera`
Expected : FAIL — modules `./director` et `./sun` introuvables.

- [ ] **Step 3 : Implémenter**

```ts
// web/src/camera/director.ts
import { frameAltitude, limitingHalfAngle, overviewAltitude, type FramingParams, type Viewport } from './framing';
import { planFlight, type Flight, type FlightParams, type Pose } from './flight';
import { northUp, rotate, toVec, type LngLat } from '../geo/vec';

export interface FrameTarget { cap: { center: LngLat; radiusDeg: number } }

export interface DirectorOptions {
  viewport: Viewport;
  framing: FramingParams;
  flight: Omit<FlightParams, 'alphaRad' | 'reducedMotion'>;
  reducedMotion: boolean;
  /** Point survolé au démarrage, en vue d'ensemble. */
  start: LngLat;
}

/** Pose de la frame courante ; `cut` signale une coupe (mouvement réduit) que la couche de rendu peut fondre. */
export interface FramePose extends Pose { cut: boolean }

const AXIS_Y = [0, 1, 0] as const;

/**
 * Pilote de caméra, sans three ni React : la boucle de rendu appelle `update(now)` à chaque frame et place la
 * caméra en `dir · (1 + altitude)`, regard vers l'origine, `up` en haut. Le jeu attend `flyTo`.
 */
export class CameraDirector {
  private pose: Pose;
  private viewport: Viewport;
  private framing: FramingParams;
  private readonly opts: DirectorOptions;
  private flight: { plan: Flight; startMs: number; resolve: () => void } | null = null;
  private now = 0;
  private spinDegPerSec = 0;

  constructor(opts: DirectorOptions) {
    this.opts = opts;
    this.viewport = opts.viewport;
    this.framing = opts.framing;
    const dir = toVec(opts.start);
    this.pose = { dir, altitude: overviewAltitude(opts.viewport, opts.framing), up: northUp(dir) };
  }

  setViewport(v: Viewport): void { this.viewport = v; }

  /** Change le cadrage des vols suivants (page de calibration). */
  setFraming(p: FramingParams): void { this.framing = p; }

  /** Rotation lente au repos (degrés de longitude par seconde, vers l'ouest) ; 0 l'arrête. */
  setIdleSpin(degPerSec: number): void { this.spinDegPerSec = degPerSec; }

  /** Vole vers la calotte du pays ; la promesse se résout à l'arrivée (ou quand un autre vol la remplace). */
  flyTo(target: FrameTarget): Promise<void> {
    const dir = toVec(target.cap.center);
    return this.flyToPose({ dir, altitude: frameAltitude(target.cap.radiusDeg, this.viewport, this.framing), up: northUp(dir) });
  }

  /** Remonte à la vue d'ensemble au-dessus du point courant. */
  flyToOverview(): Promise<void> {
    return this.flyToPose({ ...this.pose, altitude: overviewAltitude(this.viewport, this.framing), up: northUp(this.pose.dir) });
  }

  private flyToPose(to: Pose): Promise<void> {
    this.flight?.resolve();
    this.spinDegPerSec = 0;
    const plan = planFlight(this.pose, to, {
      ...this.opts.flight,
      alphaRad: limitingHalfAngle(this.viewport),
      reducedMotion: this.opts.reducedMotion,
    });
    return new Promise((resolve) => {
      this.flight = { plan, startMs: this.now, resolve };
    });
  }

  update(nowMs: number): FramePose {
    const dt = Math.max(0, nowMs - this.now);
    this.now = nowMs;
    let cut = false;
    if (this.flight) {
      const { plan, startMs, resolve } = this.flight;
      const t = plan.durationMs === 0 ? 1 : (nowMs - startMs) / plan.durationMs;
      this.pose = plan.at(t);
      if (t >= 1) {
        cut = plan.durationMs === 0;
        this.flight = null;
        resolve();
      }
    } else if (this.spinDegPerSec !== 0) {
      const dir = rotate(this.pose.dir, AXIS_Y, (-this.spinDegPerSec * Math.PI / 180) * (dt / 1000));
      this.pose = { ...this.pose, dir, up: northUp(dir) };
    }
    return { ...this.pose, cut };
  }
}
```

```ts
// web/src/camera/sun.ts
import type { Pose } from './flight';
import { add, cross, normalize, scale, type Vec3 } from '../geo/vec';

/**
 * Soleil placé par rapport à la caméra (spec §5) : à `angleDeg` du point visé, venant du haut à gauche de
 * l'image. Le pays visé est toujours de jour ; en vue d'ensemble, le terminateur reste visible au limbe.
 */
export function sunDirection(pose: Pose, angleDeg = 55): Vec3 {
  const right = cross(pose.up, pose.dir); // droite de l'image pour une caméra en dir·(1+h) regardant l'origine
  const towardUpLeft = normalize(add(pose.up, scale(right, -1)));
  const a = (angleDeg * Math.PI) / 180;
  return normalize(add(scale(pose.dir, Math.cos(a)), scale(towardUpLeft, Math.sin(a))));
}
```

```ts
// web/src/camera/config.ts
import type { FlightParams } from './flight';
import type { FramingParams } from './framing';

/** Champ vertical de la caméra : celui de l'ancien globe.gl (`new PerspectiveCamera()`, 50°). */
export const FOV_Y_DEG = 50;

/** Cadrage par défaut ; `k` et `margin` sont calibrés avec l'utilisateur (Task 13 du plan de la phase 1A). */
export const FRAMING: FramingParams = { k: 1, margin: 1.6, floor: 0.0003, overview: { landscape: 1.4, portrait: 2.2 } };

/** Vol : ρ de d3, durée naturelle de van Wijk bornée à [1500 ; 3500] ms (spec §5). */
export const FLIGHT: Omit<FlightParams, 'alphaRad' | 'reducedMotion'> = { rho: Math.SQRT2, timeScale: 1, minMs: 1500, maxMs: 3500 };
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npm run check`
Expected : PASS — `tsc` sans erreur ; director : 8 tests, sun : 3 tests ; le reste de la suite (62 tests de la phase 0 + 6 du contrat des patchs) toujours vert.

- [ ] **Step 5 : Commit**

```bash
git add web/src/camera
git commit -m "camera : CameraDirector (flyTo, vue d'ensemble, rotation au repos, coupe), soleil, réglages"
```

---
### Task 4 : Projection du patch côté CPU et chargement des pays

**Files:**
- Create: `web/src/globe/patchFrame.ts`, `web/src/data/countries.ts`
- Test: `web/src/globe/patchFrame.test.ts`, `web/src/data/countries.test.ts`

**Interfaces:**
- Consumes: `geo/vec` (Task 1) ; `makeProjector` (`web/scripts/geodata/lib/patch.ts`, phase 0) comme référence ; `CountryRecord`, `PatchMeta` (`types.ts`).
- Produces: `interface TangentFrame { center; east; north }` ; `tangentFrame(center: LngLat): TangentFrame` ; `patchUV(meta: Pick<PatchMeta, 'extentRad'>, f: TangentFrame, p: Vec3): [number, number]` ; `inFrame(uv): boolean` ; `PLAYABLE_COUNT = 197` ; `parseCountries(json: unknown): CountryRecord[]` ; `loadCountries(baseUrl = '/'): Promise<CountryRecord[]>`.

`patchUV` est le miroir CPU **exact** du calcul du shader (Task 5) : même repère tangent, même formule. Le test le compare à `makeProjector`, qui a produit les patchs : si les deux divergent, le shader lirait le patch au mauvais endroit.

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
// web/src/globe/patchFrame.test.ts
import { describe, expect, it } from 'vitest';
import { makeProjector } from '../../scripts/geodata/lib/patch';
import { inFrame, patchUV, tangentFrame } from './patchFrame';
import { toVec } from '../geo/vec';

// Le miroir CPU du shader doit donner exactement le (u, v) du contrat, c'est-à-dire px/size et py/size de makeProjector.
const frames = [
  { name: 'France', center: [1.864664845934693, 46.59912566826888] as [number, number], extentRad: 0.1274035272001625 },
  { name: 'Fidji (antiméridien)', center: [178.99365421768584, -17.648547737653985] as [number, number], extentRad: 0.04686673105884556 },
  { name: 'Vatican', center: [12.452131618080582, 41.90320239981395] as [number, number], extentRad: 0.00034906585039886593 },
  { name: 'USA', center: [-96.1114029478092, 42.02130917542055] as [number, number], extentRad: 0.556378183096189 },
];

describe('projection du patch, miroir CPU du shader', () => {
  for (const fr of frames) {
    it(`patchUV = makeProjector / size — ${fr.name}`, () => {
      const size = 1024;
      const proj = makeProjector({ center: fr.center, extentRad: fr.extentRad, size });
      const f = tangentFrame(fr.center);
      const span = (fr.extentRad * 180) / Math.PI;
      for (let i = -4; i <= 4; i++) {
        for (let j = -4; j <= 4; j++) {
          const p: [number, number] = [fr.center[0] + (i / 4) * span, Math.max(-89, Math.min(89, fr.center[1] + (j / 4) * span))];
          const [px, py] = proj.toPixel(p);
          const [u, v] = patchUV(fr, f, toVec(p));
          expect(Math.abs(u - px / size), `u en ${p}`).toBeLessThan(1e-9);
          expect(Math.abs(v - py / size), `v en ${p}`).toBeLessThan(1e-9);
        }
      }
    });
  }

  it('le repère tangent est orthonormé, est vers les longitudes croissantes, nord vers le pôle', () => {
    const f = tangentFrame([30, 50]);
    const d = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    expect(d(f.center, f.east)).toBeCloseTo(0, 12);
    expect(d(f.center, f.north)).toBeCloseTo(0, 12);
    expect(d(f.east, f.north)).toBeCloseTo(0, 12);
    expect(d(f.east, toVec([31, 50]))).toBeGreaterThan(0);
    expect(f.north[1]).toBeGreaterThan(0);
  });

  it('hors cadre dès que u ou v sort de [0, 1]', () => {
    expect(inFrame([0, 1])).toBe(true);
    expect(inFrame([0.5, 1.0001])).toBe(false);
    expect(inFrame([-0.0001, 0.5])).toBe(false);
  });
});
```

```ts
// web/src/data/countries.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCountries } from './countries';

const real = JSON.parse(readFileSync(new URL('../../public/data/countries.json', import.meta.url), 'utf8')) as unknown[];

describe('countries.json côté jeu', () => {
  it('accepte les 197 pays générés', () => {
    const all = parseCountries(real);
    expect(all).toHaveLength(197);
    expect(all.find((c) => c.cca3 === 'FRA')?.patch.sdf).toBe('patches/sdf/fra.png');
  });
  it('refuse une liste incomplète', () => {
    expect(() => parseCountries(real.slice(1))).toThrow(/197/);
  });
  it('refuse un code en double', () => {
    expect(() => parseCountries([...real.slice(1), real[1]])).toThrow(/double/);
  });
  it('refuse un pays sans patch', () => {
    const broken = real.map((c, i) => (i === 3 ? { ...(c as object), patch: undefined } : c));
    expect(() => parseCountries(broken)).toThrow(/patch/);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run --project unit src/globe src/data/countries.test.ts`
Expected : FAIL — modules `./patchFrame` et `./countries` introuvables.

- [ ] **Step 3 : Implémenter**

```ts
// web/src/globe/patchFrame.ts
import type { LngLat, PatchMeta } from '../data/types';
import { cross, dot, length, toVec, type Vec3 } from '../geo/vec';

/** Repère tangent au centre du patch : C (centre), E (est), N (nord), orthonormé. */
export interface TangentFrame { center: Vec3; east: Vec3; north: Vec3 }

export function tangentFrame([lng, lat]: LngLat): TangentFrame {
  const l = (lng * Math.PI) / 180, p = (lat * Math.PI) / 180;
  return {
    center: toVec([lng, lat]),
    east: [-Math.sin(l), 0, -Math.cos(l)],
    north: [-Math.sin(p) * Math.cos(l), Math.cos(p), Math.sin(p) * Math.sin(l)],
  };
}

/**
 * Miroir CPU exact du shader (contrat de PatchMeta) : (u, v) d'une direction unitaire `p`.
 * x = k·(P·E), y = −k·(P·N), k = c / sin c, c = atan2(|P×C|, P·C) — précis aussi pour les très petits cadres.
 */
export function patchUV(meta: Pick<PatchMeta, 'extentRad'>, f: TangentFrame, p: Vec3): [number, number] {
  const cosC = dot(p, f.center), sinC = length(cross(p, f.center));
  const k = sinC > 1e-7 ? Math.atan2(sinC, cosC) / sinC : 1;
  return [((k * dot(p, f.east)) / meta.extentRad + 1) / 2, ((-k * dot(p, f.north)) / meta.extentRad + 1) / 2];
}

/** Hors cadre, le patch ne dit rien : le point compte comme hors du pays. */
export const inFrame = ([u, v]: [number, number]): boolean => u >= 0 && u <= 1 && v >= 0 && v <= 1;
```

```ts
// web/src/data/countries.ts
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
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npm run check`
Expected : PASS — patchFrame : 6 tests, countries : 4 tests ; `tsc` sans erreur.

- [ ] **Step 5 : Commit**

```bash
git add web/src/globe/patchFrame.ts web/src/globe/patchFrame.test.ts web/src/data/countries.ts web/src/data/countries.test.ts
git commit -m "globe : miroir CPU de la projection des patchs, chargement contrôlé de countries.json"
```

---

### Task 5 : Socle 3D, couche pays et banc headless

**Files:**
- Create: `web/src/globe/renderer.ts`, `web/src/globe/patchTexture.ts`, `web/src/globe/countryLayer.ts`, `web/src/globe/globe.ts`, `web/probe.html`, `web/src/probe/main.ts`, `web/playwright.config.ts`, `web/e2e/sdf-check.ts`
- Test: `web/src/globe/renderer.test.ts`, `web/e2e/patch.spec.ts`
- Modify: `web/package.json` (dépendances, script `e2e`), `web/tsconfig.json` (`include`), `.gitignore`

**Interfaces:**
- Consumes: `CameraDirector`, `FRAMING`, `FLIGHT`, `FOV_Y_DEG`, `sunDirection` (Task 3) ; `tangentFrame`, `loadCountries` (Task 4) ; `samplePatchPng` (phase 0) dans le banc.
- Produces:
  - `renderer.ts` : `type Backend = 'webgpu' | 'webgl2'` ; `type QualityTier = 'haute' | 'standard'` ; `qualityTier({ backend, coarsePointer, maxTexture2D })` ; `createRenderer(canvas, { forceWebGL?, antialias? }): Promise<{ renderer: THREE.WebGPURenderer; backend; maxTexture2D }>`.
  - `patchTexture.ts` : `loadPatchTexture(url, signal?): Promise<THREE.Texture>` ; `disposePatchTexture(t)`.
  - `countryLayer.ts` : `STATE = { question: 0, correct: 1, wrong: 2 }` ; `createCountryLayer(placeholder): { uniforms, outputNode, setTexture(t) }` — uniforms `center, east, north, extentRad, rangeTexels, visible, reveal, state, stateTime, maskMode`.
  - `globe.ts` : `type GlobeMode = 'mask' | 'game'` ; `type CountryState = 'question' | 'correct' | 'wrong'` ; `interface CountryLook { visible; reveal; state; stateTime }` ; `class Globe` — `root: THREE.Group`, `earthMaterial`, `country`, `setPatch(meta | null, sdf | null)`, `setLook(look)`, `applyPose(pose, camera)`.
  - Page `probe.html` (paramètres `cca3`, `w`, `h`, `webgl`, `mode`) exposant `window.__probe: ProbeApi` (`backend`, `cca3`, `project(points)`, `unproject(pixels)`).
  - `e2e/sdf-check.ts` : `type BackendName` ; `checkCountry(page, rec, { backend, width, height, grid? }): Promise<SdfCheck>` (`tested`, `inside`, `mismatches`).

**Le principe du banc.** La page de sonde rend le pays en **mode masque** (blanc dedans, noir ailleurs) avec le vrai `Globe` et le vrai `CameraDirector` (cadrage du jeu, coupe immédiate). Le test prend une capture, projette une grille de 32×32 pixels (plus la balise) sur la sphère (`unproject`), lit **le même patch PNG côté CPU** (`samplePatchPng`, la projection du pipeline) et exige qu'un pixel soit allumé si et seulement si R > 128, en ignorant une bande de 3 texels autour du bord. Rien n'est recalculé par le code testé.

**Deux décisions du prototype, à garder telles quelles :**
- Le shader prend le **point exact de la sphère** sous le pixel (intersection du rayon de vue avec la sphère unité), pas `normalize(positionLocal)` : avec la seconde forme, au cadrage du Vatican, la facette du maillage 512×256 décale la lecture d'une vingtaine de texels (6 désaccords sur 1 010 points, 15 % de pixels allumés en moins) ; avec la première, 0 désaccord et 55 195 pixels allumés pour ≈ 54 768 attendus.
- Le remplissage est posé **après l'éclairage** (`outputNode` à partir du nœud `output`) : le jaune `#ffee03a1` de l'ancien jeu reste exact quelle que soit la lumière.

- [ ] **Step 1 : Installer les dépendances et le navigateur headless**

```bash
npm install -E three@0.186.1
npm install -E -D @types/three@0.186.0 @playwright/test@1.63.0
npx playwright install chromium
```

Ajouter à `web/package.json` le script `"e2e": "playwright test"` ; dans `web/tsconfig.json`, `include` devient `["src", "scripts", "types", "e2e", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]` ; ajouter à `.gitignore` (racine) :

```
web/test-results/
web/playwright-report/
```

- [ ] **Step 2 : Écrire les tests qui échouent**

```ts
// web/src/globe/renderer.test.ts
import { describe, expect, it } from 'vitest';
import { qualityTier } from './renderer';

describe('niveau de qualité (spec §4.1)', () => {
  it('haute : WebGPU sur bureau, textures 8K possibles', () => {
    expect(qualityTier({ backend: 'webgpu', coarsePointer: false, maxTexture2D: 8192 })).toBe('haute');
  });
  it('standard : mobile, WebGL 2, ou limite de texture sous 8192', () => {
    expect(qualityTier({ backend: 'webgpu', coarsePointer: true, maxTexture2D: 8192 })).toBe('standard');
    expect(qualityTier({ backend: 'webgl2', coarsePointer: false, maxTexture2D: 16384 })).toBe('standard');
    expect(qualityTier({ backend: 'webgpu', coarsePointer: false, maxTexture2D: 4096 })).toBe('standard');
  });
});
```

```ts
// web/playwright.config.ts
import { defineConfig } from '@playwright/test';

/** WebGPU passe par SwiftShader en headless ; sans ces options, la capture d'un canvas WebGPU sort noire. */
export const CHROME_ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader'];

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: process.env.CI ? 2 : 1,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5174', launchOptions: { args: CHROME_ARGS } },
  webServer: {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174/probe.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

```ts
// web/e2e/sdf-check.ts
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { samplePatchPng } from '../scripts/geodata/lib/patch';
import type { CountryRecord, LngLat } from '../src/data/types';

export type BackendName = 'webgpu' | 'webgl2';
export interface SdfCheck {
  /** Points comparés (hors bande d'incertitude autour du bord). */
  tested: number;
  /** Dont points attendus dans le pays. */
  inside: number;
  mismatches: { px: [number, number]; lngLat: LngLat; expected: boolean; red: number }[];
}

/** Bande ignorée autour du bord : 12 niveaux sur 127 ≈ 3 texels pour rangeTexels = 32 (anticrénelage + interpolation). */
const MARGIN_LEVELS = 12;

/**
 * Rend le pays en mode masque sur la page de sonde, puis compare chaque point d'une grille de l'écran (plus la balise)
 * au patch PNG lu côté CPU (samplePatchPng, même projection que le pipeline) : allumé ⇔ R > 128.
 */
export async function checkCountry(page: Page, rec: CountryRecord, o: { backend: BackendName; width: number; height: number; grid?: number }): Promise<SdfCheck> {
  await page.setViewportSize({ width: o.width, height: o.height });
  await page.goto(`/probe.html?cca3=${rec.cca3}&w=${o.width}&h=${o.height}${o.backend === 'webgl2' ? '&webgl' : ''}`);
  await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 30_000 });
  const backend = await page.evaluate(() => window.__probe!.backend);
  if (backend !== o.backend) throw new Error(`${rec.cca3} : backend ${backend} obtenu au lieu de ${o.backend}`);

  const shot = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: o.width, height: o.height } }));
  const png = PNG.sync.read(readFileSync(`public/data/${rec.patch.sdf}`));
  const n = o.grid ?? 32;
  const pixels: [number, number][] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pixels.push([Math.floor(((i + 0.5) / n) * o.width), Math.floor(((j + 0.5) / n) * o.height)]);
  const [beacon] = await page.evaluate((p) => window.__probe!.project(p), [rec.beacon]);
  if (beacon) pixels.push([Math.floor(beacon[0]), Math.floor(beacon[1])]);
  const lngLats = await page.evaluate((p) => window.__probe!.unproject(p), pixels.map(([x, y]) => [x + 0.5, y + 0.5] as [number, number]));

  const result: SdfCheck = { tested: 0, inside: 0, mismatches: [] };
  pixels.forEach((px, k) => {
    const ll = lngLats[k];
    if (!ll) return; // hors du globe
    const s = samplePatchPng(png, rec.patch, ll);
    if (s && Math.abs(s.r - 128) < MARGIN_LEVELS) return;
    const expected = s !== null && s.r > 128;
    const red = shot.data[(px[1] * shot.width + px[0]) * 4]!;
    result.tested++;
    if (expected) result.inside++;
    if ((red > 127) !== expected) result.mismatches.push({ px, lngLat: ll, expected, red });
  });
  return result;
}
```

```ts
// web/e2e/patch.spec.ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { CountryRecord } from '../src/data/types';
import { checkCountry, type BackendName } from './sdf-check';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const by = (cca3: string) => countries.find((c) => c.cca3 === cca3)!;

const CASES: { cca3: string; width: number; height: number }[] = [
  { cca3: 'FRA', width: 960, height: 600 },
  { cca3: 'USA', width: 960, height: 600 },
  { cca3: 'RUS', width: 960, height: 600 }, // antiméridien, très grand
  { cca3: 'FJI', width: 960, height: 600 }, // antiméridien
  { cca3: 'KIR', width: 960, height: 600 }, // archipel à cheval sur 180°
  { cca3: 'VAT', width: 960, height: 600 }, // plus petit pays, cadre de 0,02°
  { cca3: 'FRA', width: 390, height: 844 }, // portrait
  { cca3: 'CHL', width: 390, height: 844 }, // pays en longueur, portrait
];

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  for (const c of CASES) {
    test(`${backend} ${c.cca3} ${c.width}×${c.height} s'allume là où on l'attend`, async ({ page }) => {
      const r = await checkCountry(page, by(c.cca3), { backend, width: c.width, height: c.height });
      expect(r.mismatches).toEqual([]);
      expect(r.inside).toBeGreaterThan(0);
      expect(r.tested).toBeGreaterThan(50);
    });
  }
}
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

Run: `npx vitest run --project unit src/globe/renderer.test.ts` puis `npm run e2e -- e2e/patch.spec.ts`
Expected : FAIL — module `./renderer` introuvable ; côté Playwright, `probe.html` absent (`window.__probe` jamais défini, délai dépassé).

- [ ] **Step 4 : Implémenter**

```ts
// web/src/globe/renderer.ts
import * as THREE from 'three/webgpu';

export type Backend = 'webgpu' | 'webgl2';
export type QualityTier = 'haute' | 'standard';

export interface RendererInfo { renderer: THREE.WebGPURenderer; backend: Backend; maxTexture2D: number }

/** Spec §4.1 : « haute » = WebGPU sur bureau (textures 8K) ; « standard » = mobile ou WebGL 2 (textures 4K). */
export function qualityTier(i: { backend: Backend; coarsePointer: boolean; maxTexture2D: number }): QualityTier {
  return i.backend === 'webgpu' && !i.coarsePointer && i.maxTexture2D >= 8192 ? 'haute' : 'standard';
}

/**
 * Crée le renderer : WebGPU, repli WebGL 2 automatique (three le fait dans `init()`). Rejette si aucun des deux
 * n'est disponible — l'appelant affiche alors « navigateur non compatible ».
 */
export async function createRenderer(canvas: HTMLCanvasElement, opts: { forceWebGL?: boolean; antialias?: boolean } = {}): Promise<RendererInfo> {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: opts.antialias ?? true, forceWebGL: opts.forceWebGL ?? false });
  await renderer.init();
  // Le type public de Backend n'expose ni le drapeau ni le device : on lit ce que three pose (WebGPUBackend.js / WebGLBackend.js).
  const raw = renderer.backend as unknown as {
    isWebGPUBackend?: boolean;
    device?: { limits: { maxTextureDimension2D: number } };
    gl?: WebGL2RenderingContext;
  };
  const backend: Backend = raw.isWebGPUBackend ? 'webgpu' : 'webgl2';
  const maxTexture2D = backend === 'webgpu' ? raw.device!.limits.maxTextureDimension2D : (raw.gl!.getParameter(raw.gl!.MAX_TEXTURE_SIZE) as number);
  return { renderer, backend, maxTexture2D };
}
```

```ts
// web/src/globe/patchTexture.ts
import * as THREE from 'three/webgpu';

/**
 * Charge un patch SDF comme DONNÉE (contrat de PatchMeta) : ImageBitmap sans conversion de couleur ni prémultiplication,
 * ligne 0 lue en v = 0 (flipY = false), filtrage linéaire, pas de mipmaps. Identique sur WebGPU et WebGL 2.
 */
export async function loadPatchTexture(url: string, signal?: AbortSignal): Promise<THREE.Texture> {
  const res = await fetch(url, signal ? { signal } : {});
  if (!res.ok) throw new Error(`patch ${url} : HTTP ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const t = new THREE.Texture(bitmap);
  t.flipY = false;
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export function disposePatchTexture(t: THREE.Texture): void {
  t.dispose();
  (t.image as ImageBitmap | undefined)?.close?.();
}
```

```ts
// web/src/globe/countryLayer.ts
import * as THREE from 'three/webgpu';
import {
  abs, atan, cameraPosition, clamp, cross, dot, exp, float, fwidth, length, max, mix, normalize, positionWorld, select, sin,
  smoothstep, sqrt, texture, uniform, vec2, vec3, vec4, output,
} from 'three/tsl';

/** Repère tangent du centre du patch : C (centre), E (est), N (nord) — voir le contrat de PatchMeta. */
export interface TangentFrame { center: THREE.Vector3; east: THREE.Vector3; north: THREE.Vector3 }

export const STATE = { question: 0, correct: 1, wrong: 2 } as const;

function makeUniforms() {
  return {
    center: uniform(new THREE.Vector3(1, 0, 0)),
    east: uniform(new THREE.Vector3(0, 0, -1)),
    north: uniform(new THREE.Vector3(0, 1, 0)),
    extentRad: uniform(0.1),
    rangeTexels: uniform(32),
    /** 0 = aucun pays affiché. */
    visible: uniform(0),
    /** Progression de la vague de révélation, 0 → 1. */
    reveal: uniform(0),
    state: uniform(0),
    /** Secondes depuis le dernier changement d'état. */
    stateTime: uniform(0),
    /** 1 = masque noir et blanc pour les contrôles headless. */
    maskMode: uniform(0),
  };
}
export type CountryUniforms = ReturnType<typeof makeUniforms>;

/**
 * Couche pays lue dans le patch SDF (contrat de PatchMeta, src/data/types.ts). Renvoie le nœud de sortie à
 * poser sur `material.outputNode` : la couleur éclairée de la Terre, recouverte du pays.
 */
export function createCountryLayer(placeholder: THREE.Texture) {
  const u = makeUniforms();
  const sdfNode = texture(placeholder);

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
  const inFrame = uv.x.greaterThanEqual(0).and(uv.x.lessThanEqual(1)).and(uv.y.greaterThanEqual(0)).and(uv.y.lessThanEqual(1));
  const shown = inFrame.and(u.visible.greaterThan(0.5));

  const sample = sdfNode.sample(uv);
  const sd = sample.r.mul(255).sub(128).div(127).mul(u.rangeTexels); // texels, > 0 dedans
  const gd = sample.g.mul(u.rangeTexels); // texels jusqu'à la ligne voisine la plus proche
  const sdPx = sd.div(max(fwidth(sd), 1e-4)); // distance au bord en pixels d'écran
  const gdPx = gd.div(max(fwidth(gd), 1e-4));

  // vague depuis le centre du patch : rayon en unités de demi-cadre, 0 → √2
  const radial = length(uv.sub(0.5)).mul(2);
  const wave = smoothstep(u.reveal.mul(1.5).sub(0.08), u.reveal.mul(1.5), radial).oneMinus();

  const inside = clamp(sdPx.add(0.5), 0, 1);
  const edge = smoothstep(float(1.5), float(0), abs(sdPx)); // liseré d'environ 1,5 px
  const glow = exp(max(sd, 0).negate().div(6)).mul(0.35); // lueur intérieure près du bord
  const neighbor = smoothstep(float(2), float(0.5), gdPx); // lignes des autres frontières, ~1,5 px

  const t = u.stateTime;
  const isCorrect = u.state.equal(STATE.correct), isWrong = u.state.equal(STATE.wrong);
  const yellow = vec3(1.0, 0.933, 0.012), green = vec3(0.18, 0.8, 0.44), red = vec3(0.91, 0.3, 0.24);
  const color = select(isCorrect, green, select(isWrong, red, yellow));
  const pulse = select(isWrong, sin(t.mul(Math.PI * 4)).mul(0.25).add(0.75), float(1));
  const flash = select(isCorrect, exp(t.mul(-3)), float(0));

  const fillA = inside.mul(wave).mul(float(0.63).add(glow)).mul(pulse);
  const edgeA = edge.mul(wave).mul(float(0.85).add(flash.mul(0.15)));
  const lineA = neighbor.mul(wave).mul(0.8);

  const lit = output.rgb;
  const withLines = mix(lit, vec3(0.03, 0.03, 0.05), select(shown, lineA, float(0)));
  const withFill = mix(withLines, color, select(shown, fillA, float(0)));
  const withEdge = mix(withFill, mix(color, vec3(1, 1, 1), flash), select(shown, edgeA, float(0)));

  const mask = select(shown, inside, float(0));
  const outputNode = select(u.maskMode.greaterThan(0.5), vec4(mask, mask, mask, 1), vec4(withEdge, output.a));

  return {
    uniforms: u,
    outputNode,
    setTexture(t: THREE.Texture) { sdfNode.value = t; },
  };
}
```

```ts
// web/src/globe/globe.ts
import * as THREE from 'three/webgpu';
import { color } from 'three/tsl';
import type { FramePose } from '../camera/director';
import { sunDirection } from '../camera/sun';
import type { PatchMeta } from '../data/types';
import { createCountryLayer, STATE } from './countryLayer';
import { tangentFrame } from './patchFrame';

export type GlobeMode = 'mask' | 'game';
export type CountryState = keyof typeof STATE;

/** Apparence du pays visé à un instant donné (voir reveal.ts). */
export interface CountryLook { visible: boolean; reveal: number; state: CountryState; stateTime: number }

/**
 * Scène du globe sans React : la Terre (sphère unité), la couche pays, le soleil. `root` s'ajoute à une scène three
 * (page de sonde) ou à la scène de R3F (GlobeView).
 */
export class Globe {
  readonly root = new THREE.Group();
  readonly country = createCountryLayer(new THREE.Texture());
  readonly earthMaterial = new THREE.MeshStandardNodeMaterial();
  private readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  private hasPatch = false;

  constructor(readonly mode: GlobeMode) {
    this.earthMaterial.colorNode = color(0x0b1d3a);
    this.earthMaterial.outputNode = this.country.outputNode;
    this.country.uniforms.maskMode.value = mode === 'mask' ? 1 : 0;
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 512, 256), this.earthMaterial);
    this.root.add(earth, this.sun, new THREE.AmbientLight(0xffffff, 0.04));
  }

  /** Patch du pays visé ; `null` efface le remplissage (patch absent ou en échec). */
  setPatch(meta: PatchMeta | null, sdf: THREE.Texture | null): void {
    this.hasPatch = meta !== null && sdf !== null;
    if (!meta || !sdf) { this.country.uniforms.visible.value = 0; return; }
    const u = this.country.uniforms, f = tangentFrame(meta.center);
    u.center.value.set(...f.center);
    u.east.value.set(...f.east);
    u.north.value.set(...f.north);
    u.extentRad.value = meta.extentRad;
    u.rangeTexels.value = meta.rangeTexels;
    this.country.setTexture(sdf);
  }

  setLook(look: CountryLook): void {
    const u = this.country.uniforms;
    u.visible.value = look.visible && this.hasPatch ? 1 : 0;
    u.reveal.value = look.reveal;
    u.state.value = STATE[look.state];
    u.stateTime.value = look.stateTime;
  }

  /** Place la caméra (regard vers le centre, `up` en haut) et le soleil pour la pose de la frame. */
  applyPose(pose: FramePose, camera: THREE.PerspectiveCamera): void {
    const d = 1 + pose.altitude;
    camera.position.set(pose.dir[0] * d, pose.dir[1] * d, pose.dir[2] * d);
    camera.up.set(...pose.up);
    camera.lookAt(0, 0, 0);
    camera.near = Math.max(pose.altitude * 0.2, 1e-5);
    camera.far = d + 60;
    camera.updateProjectionMatrix();
    const s = sunDirection(pose);
    this.sun.position.set(s[0] * 10, s[1] * 10, s[2] * 10);
  }
}
```

```html
<!-- web/probe.html -->
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>Countrizz — sonde</title>
    <style>html, body { margin: 0; background: #000; overflow: hidden; } canvas { display: block; }</style>
  </head>
  <body>
    <script type="module" src="/src/probe/main.ts"></script>
  </body>
</html>
```

```ts
// web/src/probe/main.ts
import * as THREE from 'three/webgpu';
import { CameraDirector } from '../camera/director';
import { FLIGHT, FOV_Y_DEG, FRAMING } from '../camera/config';
import { loadCountries } from '../data/countries';
import type { LngLat } from '../data/types';
import { toLngLat, toVec } from '../geo/vec';
import { Globe } from '../globe/globe';
import { loadPatchTexture } from '../globe/patchTexture';
import { createRenderer } from '../globe/renderer';

/** API exposée aux contrôles Playwright (e2e/). */
export interface ProbeApi {
  backend: string;
  cca3: string;
  /** Pixel écran (coin haut gauche = 0,0) d'un point du globe, `null` derrière l'horizon. */
  project(points: LngLat[]): ([number, number] | null)[];
  /** Point du globe sous un pixel écran (coordonnées continues), `null` hors du globe. */
  unproject(pixels: [number, number][]): (LngLat | null)[];
}
declare global { interface Window { __probe?: ProbeApi } }

const q = new URLSearchParams(location.search);
const width = Number(q.get('w') ?? 960), height = Number(q.get('h') ?? 600);
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const { renderer, backend } = await createRenderer(canvas, { forceWebGL: q.has('webgl'), antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(width, height);

const countries = await loadCountries('/');
const rec = countries.find((c) => c.cca3 === q.get('cca3'));
if (!rec) throw new Error(`pays inconnu : ${q.get('cca3')}`);

const globe = new Globe(q.get('mode') === 'game' ? 'game' : 'mask');
globe.setPatch(rec.patch, await loadPatchTexture(`/data/${rec.patch.sdf}`));
globe.setLook({ visible: true, reveal: 1, state: 'question', stateTime: 0 });

const director = new CameraDirector({
  viewport: { width, height, fovYDeg: FOV_Y_DEG }, framing: FRAMING, flight: FLIGHT, reducedMotion: true, start: rec.cap.center,
});
const camera = new THREE.PerspectiveCamera(FOV_Y_DEG, width / height, 0.001, 100);
void director.flyTo(rec);
globe.applyPose(director.update(0), camera);
const scene = new THREE.Scene();
scene.add(globe.root);
renderer.render(scene, camera);

const ray = new THREE.Raycaster();
const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
const hit = new THREE.Vector3();
window.__probe = {
  backend,
  cca3: rec.cca3,
  project: (points) => points.map((p) => {
    const v = new THREE.Vector3(...toVec(p));
    if (v.dot(camera.position) <= 1) return null; // derrière l'horizon (sphère unité)
    v.project(camera);
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
  }),
  unproject: (pixels) => pixels.map(([x, y]) => {
    ray.setFromCamera(new THREE.Vector2((x / width) * 2 - 1, 1 - (y / height) * 2), camera);
    return ray.ray.intersectSphere(sphere, hit) ? toLngLat([hit.x, hit.y, hit.z]) : null;
  }),
};
```

- [ ] **Step 5 : Lancer, vérifier le succès**

Run: `npm run check && npm run e2e -- e2e/patch.spec.ts`
Expected : `check` PASS (renderer : 2 tests) ; Playwright : **16 passed** (8 cas × 2 backends). Mesuré au prototype : ≈ 0,5 à 0,7 s par cas.

- [ ] **Step 6 : Commit**

```bash
git add .gitignore web/package.json web/package-lock.json web/tsconfig.json web/playwright.config.ts web/probe.html web/e2e web/src/globe web/src/probe
git commit -m "globe : renderer WebGPU/WebGL 2, couche pays SDF, page de sonde et contrôle headless des patchs"
```

---
### Task 6 : Pipeline des textures globales (NASA → KTX2)

**Files:**
- Create: `web/scripts/textures/config.ts`, `web/scripts/textures/paths.ts`, `web/scripts/textures/fetch-textures.ts`, `web/scripts/textures/build-textures.ts`, `web/scripts/textures/lib/landMask.ts`, `web/scripts/textures/lib/ktx2.ts`
- Test: `web/scripts/textures/__tests__/unit/landMask.test.ts`, `web/scripts/textures/__tests__/unit/ktx2.test.ts`, `web/scripts/textures/__tests__/data/textures.test.ts`
- Modify: `web/package.json` (sharp, scripts), `web/vitest.config.ts`, `.gitignore`
- Produit (versionné) : `web/public/textures/{day-8k,day-4k,night-8k,night-4k,surface-4k}.ktx2`, `web/public/textures/credits.json`, `web/scripts/textures/textures.lock.json`, `web/scripts/textures/rapport-textures.md`

**Interfaces:**
- Consumes: `fetchBytes`, `sha256` (`scripts/geodata/lib/http.ts`), `readJson`, `writeJson`, `writeBytes` (`lib/io.ts`), `polygonsOf` (`lib/geometry.ts`) ; Natural Earth 10m dans `scripts/geodata/.cache/` (`npm run geodata:fetch`, phase 0).
- Produces: `rasterizeLandMask(polygons, width, height): Uint8Array` ; `readKtx2Header(bytes): Ktx2Header` (`width`, `height`, `levels`, `supercompression`, `kv`) ; les fichiers KTX2 que `loadGlobeTextures` (Task 7) charge : couleur en ETC1S sRGB, `surface-4k` en UASTC linéaire avec **R = altitude** (GEBCO_08, 0 en mer) et **G = mer** (255) / terre (0).

**Sources** (lues et vérifiées par HEAD le 02/10/2026 ; voir `config.ts`) : Blue Marble NG juillet 2004 en PNG sans perte (123 901 191 octets), Black Marble 2016 3 km (8 106 233), topographie GEBCO_08 de Blue Marble (233 345 166 ; 8 bits, la mer **et** les terres basses valent 0). **Masque terre/mer** : aucun masque officiel Blue Marble ; celui qu'on tirerait de la bathymétrie déplace la côte en mer peu profonde (la mer du Nord y vaut 255 comme la terre) — on le rastérise donc depuis Natural Earth, ce qui aligne la côte sur nos frontières. Mesures du prototype : téléchargement 1 min 57 s, construction 50 s ; `day-8k` 2 527 997 octets, `night-8k` 1 123 251, `day-4k` 692 732, `night-4k` 323 745, `surface-4k` 2 042 258 ; niveau « standard » 3 058 735 octets, « haute » 5 693 506 (budgets 15 et 25 Mo).

Prérequis poste : `toktx --version` doit afficher `v4.` (KTX-Software 4.4, déjà installé dans `/usr/local/bin` sur le poste de l'utilisateur). Le pipeline ne tourne pas en CI : ses sorties sont versionnées (spec §3.1).

- [ ] **Step 1 : Dépendance, scripts, configuration**

```bash
npm install -E -D sharp@0.35.5
```

Dans `web/package.json`, ajouter `"textures:fetch": "tsx scripts/textures/fetch-textures.ts"` et `"textures": "tsx scripts/textures/build-textures.ts"`. Dans `web/vitest.config.ts`, le projet `unit` inclut aussi `'scripts/textures/__tests__/unit/**/*.test.ts'` et le projet `data` `'scripts/textures/__tests__/data/**/*.test.ts'`. Ajouter à `.gitignore` : `web/scripts/textures/.cache/`.

- [ ] **Step 2 : Écrire les tests qui échouent**

```ts
// web/scripts/textures/__tests__/unit/landMask.test.ts
import { describe, expect, it } from 'vitest';
import { rasterizeLandMask } from '../../lib/landMask';

const W = 360, H = 180; // 1 pixel = 1° ; le pixel (x, y) a pour centre (x − 179,5° ; 89,5° − y)
const at = (mask: Uint8Array, lng: number, lat: number) => mask[Math.floor(89.999 - lat) * W + Math.floor(lng + 180)];
const square = (x0: number, y0: number, x1: number, y1: number) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

describe('masque terre/mer équirectangulaire', () => {
  it('remplit un polygone, pas la mer autour', () => {
    const m = rasterizeLandMask([[square(0, 0, 10, 10)]], W, H);
    expect(at(m, 5.5, 5.5)).toBe(1);
    expect(at(m, 15.5, 5.5)).toBe(0);
    expect(at(m, 5.5, -5.5)).toBe(0);
  });
  it('respecte un trou (lac, enclave) en pair-impair', () => {
    const m = rasterizeLandMask([[square(0, 0, 10, 10), square(3, 3, 7, 7)]], W, H);
    expect(at(m, 5.5, 5.5)).toBe(0);
    expect(at(m, 1.5, 1.5)).toBe(1);
  });
  it('deux polygones qui se recouvrent restent de la terre (OU, pas pair-impair entre polygones)', () => {
    const m = rasterizeLandMask([[square(0, 0, 10, 10)], [square(5, 5, 15, 15)]], W, H);
    expect(at(m, 7.5, 7.5)).toBe(1);
  });
  it('va jusqu’aux bords ±180° (polygones coupés à l’antiméridien)', () => {
    const m = rasterizeLandMask([[square(170, -20, 180, -10)], [square(-180, -20, -170, -10)]], W, H);
    expect(at(m, 179.5, -15.5)).toBe(1);
    expect(at(m, -179.5, -15.5)).toBe(1);
  });
});
```

```ts
// web/scripts/textures/__tests__/unit/ktx2.test.ts
import { describe, expect, it } from 'vitest';
import { readKtx2Header } from '../../lib/ktx2';

/** KTX2 minimal : identifiant, en-tête, index, puis une table clé/valeur (format KTX 2.0, §3 et §3.11). */
function fakeKtx2(kv: Record<string, string>, o: { width: number; height: number; levels: number; supercompression: number }): Uint8Array {
  const entries = Object.entries(kv).map(([k, v]) => {
    const body = new TextEncoder().encode(`${k}\0${v}\0`);
    const padded = new Uint8Array(4 + body.length + ((4 - ((4 + body.length) % 4)) % 4));
    new DataView(padded.buffer).setUint32(0, body.length, true);
    padded.set(body, 4);
    return padded;
  });
  const kvdLength = entries.reduce((s, e) => s + e.length, 0);
  const kvdOffset = 80;
  const buf = new Uint8Array(kvdOffset + kvdLength);
  buf.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  const dv = new DataView(buf.buffer);
  dv.setUint32(20, o.width, true);
  dv.setUint32(24, o.height, true);
  dv.setUint32(40, o.levels, true);
  dv.setUint32(44, o.supercompression, true);
  dv.setUint32(56, kvdOffset, true);
  dv.setUint32(60, kvdLength, true);
  let p = kvdOffset;
  for (const e of entries) { buf.set(e, p); p += e.length; }
  return buf;
}

describe('en-tête KTX2', () => {
  it('lit dimensions, niveaux, supercompression et orientation', () => {
    const h = readKtx2Header(fakeKtx2({ KTXorientation: 'ru', KTXwriter: 'toktx v4.4.2' }, { width: 4096, height: 2048, levels: 13, supercompression: 1 }));
    expect(h).toEqual({ width: 4096, height: 2048, levels: 13, supercompression: 1, kv: { KTXorientation: 'ru', KTXwriter: 'toktx v4.4.2' } });
  });
  it('refuse un fichier qui n’est pas un KTX2', () => {
    expect(() => readKtx2Header(new Uint8Array(80))).toThrow(/KTX2/);
  });
});
```

```ts
// web/scripts/textures/__tests__/data/textures.test.ts
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BUDGET_BYTES } from '../../config';
import { readKtx2Header } from '../../lib/ktx2';
import { TEX_OUT_DIR } from '../../paths';

const FILES = [
  { name: 'day-8k.ktx2', width: 8192, supercompression: 1 },
  { name: 'day-4k.ktx2', width: 4096, supercompression: 1 },
  { name: 'night-8k.ktx2', width: 8192, supercompression: 1 },
  { name: 'night-4k.ktx2', width: 4096, supercompression: 1 },
  { name: 'surface-4k.ktx2', width: 4096, supercompression: 2 },
];
const size = (n: string) => statSync(path.join(TEX_OUT_DIR, n)).size;

describe('textures globales générées', () => {
  for (const f of FILES) {
    it(`${f.name} : dimensions, mipmaps complets, origine en bas à gauche`, () => {
      const p = path.join(TEX_OUT_DIR, f.name);
      if (!existsSync(p)) throw new Error(`${f.name} absent : lancer \`npm run textures:fetch && npm run textures\``);
      const h = readKtx2Header(readFileSync(p));
      expect([h.width, h.height]).toEqual([f.width, f.width / 2]);
      expect(h.levels).toBe(Math.log2(f.width) + 1);
      expect(h.supercompression).toBe(f.supercompression);
      expect(h.kv.KTXorientation).toBe('ru');
    });
  }
  it('tient dans le budget de chaque niveau de qualité', () => {
    expect(size('day-4k.ktx2') + size('night-4k.ktx2') + size('surface-4k.ktx2')).toBeLessThanOrEqual(BUDGET_BYTES.standard);
    expect(size('day-8k.ktx2') + size('night-8k.ktx2') + size('surface-4k.ktx2')).toBeLessThanOrEqual(BUDGET_BYTES.haute);
  });
  it('publie les crédits des quatre couches', () => {
    expect(JSON.parse(readFileSync(path.join(TEX_OUT_DIR, 'credits.json'), 'utf8'))).toHaveLength(4);
  });
});
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

Run: `npx vitest run --project unit scripts/textures` puis `npx vitest run --project data scripts/textures`
Expected : FAIL — modules `lib/landMask` et `lib/ktx2` introuvables ; puis `day-8k.ktx2 absent`.

- [ ] **Step 4 : Implémenter les fonctions pures**

```ts
// web/scripts/textures/lib/landMask.ts
/**
 * Masque terre (1) / mer (0) équirectangulaire `width × height`, ligne 0 au nord, colonne 0 à −180°.
 * Chaque polygone (anneaux en [lng, lat], trous compris) est rempli en pair-impair aux centres de pixels ;
 * les polygones se combinent par OU (deux pays qui se recouvrent restent de la terre).
 */
export function rasterizeLandMask(polygons: number[][][][], width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const xs: number[] = [];
  for (const poly of polygons) {
    let minLat = 90, maxLat = -90;
    for (const ring of poly) for (const p of ring) { minLat = Math.min(minLat, p[1]!); maxLat = Math.max(maxLat, p[1]!); }
    const rowFrom = Math.max(0, Math.floor(((90 - maxLat) / 180) * height));
    const rowTo = Math.min(height - 1, Math.ceil(((90 - minLat) / 180) * height));
    for (let y = rowFrom; y <= rowTo; y++) {
      const lat = 90 - ((y + 0.5) / height) * 180;
      xs.length = 0;
      for (const ring of poly) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [lngA, latA] = ring[i]!, [lngB, latB] = ring[j]!;
          if (latA! > lat !== latB! > lat) xs.push(lngA! + ((lat - latA!) * (lngB! - lngA!)) / (latB! - latA!));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const from = Math.max(0, Math.ceil(((xs[k]! + 180) / 360) * width - 0.5));
        const to = Math.min(width - 1, Math.floor(((xs[k + 1]! + 180) / 360) * width - 0.5));
        for (let x = from; x <= to; x++) mask[y * width + x] = 1;
      }
    }
  }
  return mask;
}
```

```ts
// web/scripts/textures/lib/ktx2.ts
export interface Ktx2Header {
  width: number;
  height: number;
  levels: number;
  /** 0 aucune, 1 BasisLZ (ETC1S), 2 Zstandard (UASTC + --zcmp). */
  supercompression: number;
  kv: Record<string, string>;
}

const IDENTIFIER = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

/** Lit l'en-tête et la table clé/valeur d'un fichier KTX 2.0 (dont `KTXorientation`, posé par toktx). */
export function readKtx2Header(bytes: Uint8Array): Ktx2Header {
  if (bytes.length < 80 || !IDENTIFIER.every((v, i) => bytes[i] === v)) throw new Error('pas un fichier KTX2');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (o: number) => dv.getUint32(o, true);
  const kv: Record<string, string> = {};
  const kvdOffset = u32(56), kvdLength = u32(60);
  for (let o = kvdOffset; o < kvdOffset + kvdLength;) {
    const len = u32(o);
    const entry = bytes.subarray(o + 4, o + 4 + len);
    const zero = entry.indexOf(0);
    kv[new TextDecoder().decode(entry.subarray(0, zero))] = new TextDecoder().decode(entry.subarray(zero + 1)).replace(/\0+$/, '');
    o += 4 + len;
    o += (4 - (o % 4)) % 4;
  }
  return { width: u32(20), height: u32(24), levels: u32(40), supercompression: u32(44), kv };
}
```

Run: `npx vitest run --project unit scripts/textures` — Expected : PASS (landMask : 4 tests, ktx2 : 2 tests).

- [ ] **Step 5 : Écrire le pipeline**

```ts
// web/scripts/textures/config.ts
/** Sources NASA (lues et vérifiées par HEAD le 02/10/2026 ; tailles = Content-Length relevé ce jour-là). */
export const TEXTURE_SOURCES = {
  /** Blue Marble Next Generation, juillet 2004, sans ombrage, PNG sans perte (l'original documenté). */
  day: { url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/74000/74092/world.200407.3x21600x10800.png', file: 'bmng-200407-21600.png', bytes: 123_901_191 },
  /** Black Marble 2016 couleur, 3 km, 13500×6750 (la plus grande image d'un seul tenant). */
  night: { url: 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg', file: 'blackmarble-2016-3km.jpg', bytes: 8_106_233 },
  /** Topographie GEBCO_08 de Blue Marble : 8 bits, 0 → 6400 m, la mer et les terres basses valent 0. */
  elevation: { url: 'https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/topography/gebco_08_rev_elev_21600x10800.tif', file: 'gebco08-elev-21600.tif', bytes: 233_345_166 },
} as const;

export const COLOR_SIZES = [8192, 4096] as const;
export const SURFACE_SIZE = 4096;
/** Budget des textures globales par niveau de qualité (spec §10.5) ; un dépassement se soumet à l'utilisateur. */
export const BUDGET_BYTES = { standard: 15_000_000, haute: 25_000_000 } as const;

export const CREDITS = [
  { layer: 'jour', text: 'Blue Marble: Next Generation (juillet 2004), NASA Earth Observatory (Reto Stöckli).' },
  { layer: 'nuit', text: 'Black Marble 2016, NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from Miguel Román, NASA GSFC.' },
  { layer: 'relief', text: "Imagery by Jesse Allen, NASA's Earth Observatory, using data from the General Bathymetric Chart of the Oceans (GEBCO) produced by the British Oceanographic Data Centre." },
  { layer: 'océans', text: 'Masque terre/mer dérivé de Natural Earth (domaine public).' },
] as const;
```

```ts
// web/scripts/textures/paths.ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const TEX_CACHE_DIR = path.join(here, '.cache');
export const TEX_OUT_DIR = path.resolve(here, '../../public/textures');
export const TEX_LOCK_PATH = path.join(here, 'textures.lock.json');
export const TEX_REPORT_PATH = path.join(here, 'rapport-textures.md');
/** Natural Earth 10m, téléchargé par `npm run geodata:fetch` (phase 0). */
export const NE_COUNTRIES = path.resolve(here, '../geodata/.cache/ne_10m_admin_0_countries.geojson');
```

```ts
// web/scripts/textures/fetch-textures.ts
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fetchBytes, sha256 } from '../geodata/lib/http';
import { readJson, writeBytes, writeJson } from '../geodata/lib/io';
import { TEXTURE_SOURCES } from './config';
import { TEX_CACHE_DIR, TEX_LOCK_PATH } from './paths';

interface LockEntry { url: string; sha256: string; bytes: number }

async function main(): Promise<void> {
  const lock: Record<string, LockEntry> = existsSync(TEX_LOCK_PATH) ? readJson(TEX_LOCK_PATH) : {};
  for (const [key, src] of Object.entries(TEXTURE_SOURCES)) {
    const dest = path.join(TEX_CACHE_DIR, src.file);
    const previous = lock[key];
    if (previous && existsSync(dest) && sha256(readFileSync(dest)) === previous.sha256) {
      console.log(`${key} : déjà en cache (${previous.bytes} octets)`);
      continue;
    }
    const url = previous?.url ?? src.url;
    const bytes = await fetchBytes(url);
    if (bytes.length !== src.bytes) throw new Error(`${key} : ${bytes.length} octets au lieu de ${src.bytes} — ${url}`);
    const hash = sha256(bytes);
    if (previous && previous.sha256 !== hash) throw new Error(`${key} : empreinte différente du verrou (${previous.sha256} attendu, ${hash} reçu)`);
    writeBytes(dest, bytes);
    lock[key] = { url, sha256: hash, bytes: bytes.length };
    console.log(`${key} : ${bytes.length} octets`);
  }
  writeJson(TEX_LOCK_PATH, lock);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

```ts
// web/scripts/textures/build-textures.ts
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import sharp from 'sharp';
import { polygonsOf } from '../geodata/lib/geometry';
import { readJson, writeJson } from '../geodata/lib/io';
import { BUDGET_BYTES, COLOR_SIZES, CREDITS, SURFACE_SIZE, TEXTURE_SOURCES } from './config';
import { rasterizeLandMask } from './lib/landMask';
import { NE_COUNTRIES, TEX_CACHE_DIR, TEX_OUT_DIR, TEX_REPORT_PATH } from './paths';

sharp.cache(false);
const TMP = path.join(TEX_CACHE_DIR, 'tmp');
const source = (k: keyof typeof TEXTURE_SOURCES) => path.join(TEX_CACHE_DIR, TEXTURE_SOURCES[k].file);
const outName = (name: string, size: number) => `${name}-${size / 1024}k.ktx2`;

function toktx(args: string[]): void {
  const r = spawnSync('toktx', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`toktx ${args.join(' ')} : code ${r.status}`);
}

function checkToktx(): void {
  const r = spawnSync('toktx', ['--version'], { encoding: 'utf8' });
  if (r.status !== 0 || !`${r.stdout}${r.stderr}`.includes('v4.')) {
    throw new Error('toktx 4.x introuvable : installer KTX-Software 4.4 (https://github.com/KhronosGroup/KTX-Software/releases)');
  }
}

/** Couleur (jour, nuit) : ETC1S sRGB, mipmaps, origine en bas à gauche (sinon le globe sort retourné nord-sud). */
async function colorTexture(key: 'day' | 'night', size: number, qlevel: number): Promise<string> {
  const png = path.join(TMP, `${key}-${size}.png`);
  await sharp(source(key), { limitInputPixels: false }).resize(size, size / 2, { kernel: 'lanczos3' }).removeAlpha().png({ compressionLevel: 6 }).toFile(png);
  const name = outName(key, size);
  toktx(['--t2', '--encode', 'etc1s', '--clevel', '2', '--qlevel', String(qlevel), '--genmipmap', '--assign_oetf', 'srgb', '--lower_left_maps_to_s0t0', path.join(TEX_OUT_DIR, name), png]);
  return name;
}

/** Surface : R = altitude (GEBCO_08, 0 en mer), G = mer (255) / terre (0) d'après Natural Earth ; UASTC linéaire. */
async function surfaceTexture(size: number): Promise<string> {
  const w = size, h = size / 2;
  const { data: elevation } = await sharp(source('elevation'), { limitInputPixels: false })
    .resize(w, h, { kernel: 'lanczos3' }).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  const ne = readJson<FeatureCollection<Polygon | MultiPolygon>>(NE_COUNTRIES);
  const land = rasterizeLandMask(ne.features.flatMap((f) => polygonsOf(f.geometry)) as number[][][][], w, h);
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = land[i] ? elevation[i]! : 0;
    rgb[i * 3 + 1] = land[i] ? 0 : 255;
  }
  const png = path.join(TMP, `surface-${size}.png`);
  await sharp(rgb, { raw: { width: w, height: h, channels: 3 } }).png({ compressionLevel: 6 }).toFile(png);
  const name = outName('surface', size);
  toktx(['--t2', '--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18', '--genmipmap', '--assign_oetf', 'linear', '--lower_left_maps_to_s0t0', path.join(TEX_OUT_DIR, name), png]);
  return name;
}

async function main(): Promise<void> {
  checkToktx();
  mkdirSync(TMP, { recursive: true });
  mkdirSync(TEX_OUT_DIR, { recursive: true });
  const names: string[] = [];
  for (const size of COLOR_SIZES) {
    names.push(await colorTexture('day', size, 192));
    names.push(await colorTexture('night', size, 128));
  }
  names.push(await surfaceTexture(SURFACE_SIZE));
  writeJson(path.join(TEX_OUT_DIR, 'credits.json'), CREDITS);

  const bytes = Object.fromEntries(names.map((n) => [n, statSync(path.join(TEX_OUT_DIR, n)).size]));
  const tier = (s: string) => bytes[`day-${s}.ktx2`]! + bytes[`night-${s}.ktx2`]! + bytes['surface-4k.ktx2']!;
  const lines = [
    '# Textures globales — rapport de génération', '',
    '| Fichier | Octets |', '|---|---:|',
    ...names.map((n) => `| ${n} | ${bytes[n]} |`), '',
    `- Niveau « standard » (day-4k + night-4k + surface-4k) : ${tier('4k')} octets (budget ${BUDGET_BYTES.standard})`,
    `- Niveau « haute » (day-8k + night-8k + surface-4k) : ${tier('8k')} octets (budget ${BUDGET_BYTES.haute})`, '',
  ];
  writeFileSync(TEX_REPORT_PATH, lines.join('\n'));
  rmSync(TMP, { recursive: true, force: true });
  console.log(lines.join('\n'));
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6 : Télécharger et construire**

Run: `npm run textures:fetch && npm run textures && npm run test:data`
Expected : trois sources téléchargées aux tailles attendues (≈ 2 min, 365 Mo), cinq KTX2 écrits (≈ 1 min), rapport affiché ; `test:data` PASS (textures : 7 tests, plus les 43 contrôles de la phase 0). Si un budget est dépassé, **s'arrêter** et soumettre `rapport-textures.md` à l'utilisateur.

- [ ] **Step 7 : Commit**

```bash
git add .gitignore web/package.json web/package-lock.json web/vitest.config.ts web/scripts/textures web/public/textures
git commit -m "textures : pipeline NASA → KTX2 (jour, nuit, relief, océans), verrou et budget"
```

---

### Task 7 : Terre photoréaliste (matériau, atmosphère, étoiles)

**Files:**
- Create: `web/scripts/copy-basis.mjs`, `web/src/globe/textures.ts`, `web/src/globe/earth.ts`, `web/src/globe/atmosphere.ts`, `web/src/globe/stars.ts`, `web/e2e/probe-page.ts`
- Modify: `web/src/globe/countryLayer.ts`, `web/src/globe/globe.ts`, `web/src/probe/main.ts` (réécrit), `web/package.json` (`predev`, `prebuild`), `.gitignore`
- Test: `web/e2e/earth.spec.ts`

**Interfaces:**
- Consumes: textures KTX2 (Task 6) ; `Globe`, `createCountryLayer` (Task 5) ; `sunDirection` (Task 3).
- Produces: `interface GlobeTextures { day; night; surface }` ; `loadGlobeTextures(renderer, tier, base = '/')` ; `createEarthMaterial(t): { material; base; setSun(dir) }` ; `createAtmosphere(): { mesh; setSun(dir) }` ; `createStars(count = 4000, radius = 50): THREE.Points` ; `createCountryLayer(placeholder, base = output)` ; `interface GlobeParts { textures? }` ; `new Globe(mode, parts = {})` ; `Globe.setSun(dir: Vec3)` ; page de sonde : paramètres `at`, `alt`, `mode=game`, `tier`, `sun` ; `e2e/probe-page.ts` : `shoot(page, backend, query, size?)` → `{ png, px([x, y]), at(points) }`.

**Réglages trouvés au prototype (images regardées, pas seulement mesurées) :** Blue Marble peint l'océan profond d'un bleu uniforme presque noir ; sans diffusion atmosphérique, la Terre vue de l'espace perd son bleu. On ajoute un **voile atmosphérique côté jour** (plus épais vers le limbe), posé **avant** la couche pays pour que le jaune du pays reste exact, et on relève très légèrement l'océan profond par le masque G. Le reflet du soleil est étalé (rugosité 0,55 en mer). Le **halo** se calcule par la distance du rayon de vue au centre de la Terre : avec une intensité tirée de la normale de la coquille, l'anneau se détachait du limbe avec une bande sombre ; avec un voile 3 fois plus fort, l'image était délavée. Ces valeurs sont un point de départ ; les nuages et le bloom viennent en phase 1B.

- [ ] **Step 1 : Transcodeurs basis**

```js
// web/scripts/copy-basis.mjs
// Copie les transcodeurs basis de three (KTX2Loader) dans public/basis — non versionné, refait à chaque dev/build.
import { copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(web, 'node_modules/three/examples/jsm/libs/basis');
const to = path.join(web, 'public/basis');
mkdirSync(to, { recursive: true });
for (const f of ['basis_transcoder.js', 'basis_transcoder.wasm']) copyFileSync(path.join(from, f), path.join(to, f));
```

Dans `web/package.json` : `"predev": "node scripts/copy-basis.mjs"` et `"prebuild": "node scripts/copy-basis.mjs"` ; ajouter `web/public/basis/` à `.gitignore`. Lancer `node scripts/copy-basis.mjs` une fois.

- [ ] **Step 2 : Écrire le test qui échoue**

```ts
// web/e2e/probe-page.ts
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import type { LngLat } from '../src/data/types';
import type { BackendName } from './sdf-check';

export type Rgb = [number, number, number];

/** Ouvre la sonde, attend le rendu, renvoie la capture et l'échantillonneur de pixels par coordonnées géographiques. */
export async function shoot(page: Page, backend: BackendName, query: string, size = { width: 960, height: 600 }) {
  await page.setViewportSize(size);
  await page.goto(`/probe.html?${query}&w=${size.width}&h=${size.height}${backend === 'webgl2' ? '&webgl' : ''}`);
  await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 30_000 });
  const got = await page.evaluate(() => window.__probe!.backend);
  if (got !== backend) throw new Error(`backend ${got} obtenu au lieu de ${backend}`);
  const png = PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, ...size } }));
  const px = ([x, y]: [number, number]): Rgb => {
    const i = (Math.floor(y) * png.width + Math.floor(x)) * 4;
    return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
  };
  const at = async (points: LngLat[]): Promise<Rgb[]> => {
    const screen = await page.evaluate((p) => window.__probe!.project(p), points);
    return screen.map((s, k) => { if (!s) throw new Error(`${points[k]} derrière l'horizon`); return px(s); });
  };
  return { png, px, at };
}
```

```ts
// web/e2e/earth.spec.ts
import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

const sum = (c: number[]) => c[0]! + c[1]! + c[2]!;

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  // Soleil du jeu (à 55° du point visé) : un soleil forcé derrière la caméra ferait tomber son reflet sur la mer visée.
  test(`${backend} jour : Sahara sableux, Pacifique bleu`, async ({ page }) => {
    const sahara = await shoot(page, backend, 'mode=game&at=10,23&alt=1.4');
    const [sand] = await sahara.at([[10, 23]]);
    const pacific = await shoot(page, backend, 'mode=game&at=-150,-10&alt=1.4');
    const [sea] = await pacific.at([[-150, -10]]);
    console.log(backend, 'sahara', JSON.stringify(sand), 'pacifique', JSON.stringify(sea));
    expect(sand![0]).toBeGreaterThan(120);
    expect(sand![0]).toBeGreaterThan(sand![2]! + 30);
    expect(sea![2]).toBeGreaterThan(sea![0]! + 20);
  });

  test(`${backend} nuit : les villes s'allument, la mer reste noire`, async ({ page }) => {
    const s = await shoot(page, backend, 'mode=game&at=2.35,48.85&alt=1.4&sun=-177.65,-48.85');
    const [paris, atlantic] = await s.at([[2.35, 48.85], [-30, 45]]);
    console.log(backend, 'paris', JSON.stringify(paris), 'atlantique', JSON.stringify(atlantic));
    expect(sum(paris!)).toBeGreaterThan(150);
    expect(sum(atlantic!)).toBeLessThan(40);
  });

  test(`${backend} halo bleu côté jour, faible côté nuit ; étoiles`, async ({ page }) => {
    const s = await shoot(page, backend, 'mode=game&at=0,0&alt=2&sun=-60,0');
    // disque terrestre : rayon écran = 300 · tan(asin(1/3)) / tan(25°) px autour de (480, 300)
    const r = Math.round((300 * Math.tan(Math.asin(1 / 3))) / Math.tan((25 * Math.PI) / 180));
    const day = s.px([480 - r - 4, 300]), night = s.px([480 + r + 4, 300]);
    let stars = 0;
    for (let y = 0; y < 120; y++) for (let x = 0; x < 160; x++) if (sum(s.px([x, y])) > 60) stars++;
    console.log(backend, 'halo jour', JSON.stringify(day), 'halo nuit', JSON.stringify(night), 'étoiles', stars);
    expect(day[2]).toBeGreaterThan(80);
    expect(sum(night)).toBeLessThan(sum(day) / 3);
    expect(stars).toBeGreaterThan(0);
  });
}
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

Run: `npm run e2e -- e2e/earth.spec.ts`
Expected : FAIL — en mode masque, pas de couleurs (Sahara noir) ni de halo.

- [ ] **Step 4 : Implémenter les couches**

```ts
// web/src/globe/textures.ts
import * as THREE from 'three/webgpu';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { QualityTier } from './renderer';

export interface GlobeTextures { day: THREE.Texture; night: THREE.Texture; surface: THREE.Texture }

/** Textures globales KTX2 (pipeline scripts/textures) : 8K en « haute », 4K en « standard » ; surface toujours en 4K. */
export async function loadGlobeTextures(renderer: THREE.WebGPURenderer, tier: QualityTier, base = '/'): Promise<GlobeTextures> {
  // detectSupport exige un renderer initialisé (await renderer.init(), fait par createRenderer).
  const loader = new KTX2Loader().setTranscoderPath(`${base}basis/`).detectSupport(renderer);
  const size = tier === 'haute' ? '8k' : '4k';
  const [day, night, surface] = await Promise.all([
    loader.loadAsync(`${base}textures/day-${size}.ktx2`),
    loader.loadAsync(`${base}textures/night-${size}.ktx2`),
    loader.loadAsync(`${base}textures/surface-4k.ktx2`),
  ]);
  loader.dispose();
  day.colorSpace = THREE.SRGBColorSpace;
  night.colorSpace = THREE.SRGBColorSpace;
  surface.colorSpace = THREE.NoColorSpace;
  // L'anisotropie se pose avant le premier rendu : l'échantillonneur est construit à ce moment-là.
  for (const t of [day, night, surface]) t.anisotropy = 8;
  return { day, night, surface };
}
```

```ts
// web/src/globe/earth.ts
import * as THREE from 'three/webgpu';
import { abs, bumpMap, cameraPosition, clamp, dot, float, mix, normalize, normalWorld, output, positionWorld, pow, smoothstep, texture, uniform, vec3, vec4 } from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
import type { Vec3 } from '../geo/vec';
import type { GlobeTextures } from './textures';

/** Relief : la texture de surface porte l'altitude GEBCO_08 en R (0 → 6400 m). */
const BUMP_SCALE = 0.02;

/** Terre en couches (spec §4.2) : jour, relief, océan (rugosité, reflet du soleil), lumières de la face nocturne. */
export function createEarthMaterial(t: GlobeTextures): { material: THREE.MeshStandardNodeMaterial; base: Node<'vec4'>; setSun(dir: Vec3): void } {
  const sun = uniform(new THREE.Vector3(1, 0, 0));
  const material = new THREE.MeshStandardNodeMaterial();
  // L'océan profond de Blue Marble est un bleu uniforme presque noir : on le relève très légèrement (masque G).
  material.colorNode = texture(t.day).rgb.add(vec3(0.0, 0.012, 0.035).mul(texture(t.surface).g));
  material.normalNode = bumpMap(texture(t.surface), float(BUMP_SCALE));
  material.roughnessNode = mix(float(0.92), float(0.55), texture(t.surface).g);
  material.metalnessNode = float(0);
  const nightSide = smoothstep(float(0.05), float(-0.15), dot(normalWorld, sun));
  material.emissiveNode = texture(t.night).rgb.mul(nightSide).mul(1.6);
  // Voile atmosphérique côté jour (diffusion de Rayleigh approchée) : bleuit l'océan profond, presque noir dans
  // Blue Marble, et épaissit vers le limbe. Posé avant la couche pays : le jaune du pays reste exact.
  const day = clamp(dot(normalWorld, sun).mul(1.5).add(0.25), 0, 1);
  const grazing = pow(float(1).sub(abs(dot(normalWorld, normalize(cameraPosition.sub(positionWorld))))), float(3));
  const veil = day.mul(grazing.mul(0.35).add(0.03));
  const base = vec4(mix(output.rgb, vec3(0.32, 0.55, 1.0).mul(day.mul(0.9).add(0.1)), veil), output.a);
  return { material, base, setSun(dir) { sun.value.set(...dir); } };
}
```

```ts
// web/src/globe/atmosphere.ts
import * as THREE from 'three/webgpu';
import { cameraPosition, clamp, cross, dot, float, length, mix, normalize, positionWorld, pow, smoothstep, uniform, vec3 } from 'three/tsl';
import type { Vec3 } from '../geo/vec';

/** Rayon extérieur de la coquille d'atmosphère (rayons terrestres). */
const SHELL = 1.06;

/**
 * Halo de limbe (spec §4.2) : bleu côté jour, orangé au crépuscule. Sphère arrière additive ; l'intensité dépend de la
 * distance h du rayon de vue au centre de la Terre (maximale au ras du limbe, h = 1, nulle au bord de la coquille).
 * Avec une intensité tirée de la normale de la coquille, l'anneau se détache du limbe (bande sombre, constaté).
 */
export function createAtmosphere(): { mesh: THREE.Mesh; setSun(dir: Vec3): void } {
  const sun = uniform(new THREE.Vector3(1, 0, 0));
  const material = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const ray = normalize(positionWorld.sub(cameraPosition));
  const h = length(cross(cameraPosition, ray));
  const glow = pow(clamp(float(SHELL).sub(h).div(SHELL - 1), 0, 1), float(2.2));
  // point du rayon le plus proche du centre : c'est lui qui décide jour ou nuit
  const closest = normalize(cameraPosition.sub(ray.mul(dot(cameraPosition, ray))));
  const lit = smoothstep(float(-0.25), float(0.35), dot(closest, sun));
  material.colorNode = mix(vec3(1.0, 0.45, 0.15), vec3(0.3, 0.6, 1.0), lit).mul(glow).mul(lit.mul(0.9).add(0.1));
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SHELL, 128, 64), material);
  return { mesh, setSun(dir) { sun.value.set(...dir); } };
}
```

```ts
// web/src/globe/stars.ts
import * as THREE from 'three/webgpu';
import { attribute, vec3 } from 'three/tsl';

/** Champ d'étoiles : points de 1 px (seule taille de point que WebGPU accepte), éclat par étoile, graine fixe. */
export function createStars(count = 4000, radius = 50): THREE.Points {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const positions = new Float32Array(count * 3), brightness = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    positions.set([r * Math.cos(a) * radius, z * radius, r * Math.sin(a) * radius], i * 3);
    brightness[i] = 0.35 + 0.65 * rnd() ** 3;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('brightness', new THREE.BufferAttribute(brightness, 1));
  const material = new THREE.PointsNodeMaterial({ sizeAttenuation: false });
  material.colorNode = vec3(1, 1, 1).mul(attribute('brightness', 'float'));
  return new THREE.Points(geometry, material);
}
```

- [ ] **Step 5 : La couche pays prend sa couleur de base en paramètre**

1. Dans `web/src/globe/countryLayer.ts`, remplacer :

```ts
} from 'three/tsl';
```

par :

```ts
} from 'three/tsl';
import type Node from 'three/src/nodes/core/Node.js';
```

2. Dans `web/src/globe/countryLayer.ts`, remplacer :

```ts
export function createCountryLayer(placeholder: THREE.Texture) {
```

par :

```ts
export function createCountryLayer(placeholder: THREE.Texture, base: Node<'vec4'> = output) {
```

3. Dans `web/src/globe/countryLayer.ts`, remplacer :

```ts
  const lit = output.rgb;
```

par :

```ts
  const lit = base.rgb;
```

4. Dans `web/src/globe/countryLayer.ts`, remplacer :

```ts
vec4(withEdge, output.a));
```

par :

```ts
vec4(withEdge, base.a));
```

- [ ] **Step 6 : Le globe en mode jeu**

1. Dans `web/src/globe/globe.ts`, remplacer :

```ts
import type { PatchMeta } from '../data/types';
import { createCountryLayer, STATE } from './countryLayer';
import { tangentFrame } from './patchFrame';
```

par :

```ts
import type { PatchMeta } from '../data/types';
import type { Vec3 } from '../geo/vec';
import { createAtmosphere } from './atmosphere';
import { createCountryLayer, STATE } from './countryLayer';
import { createEarthMaterial } from './earth';
import { tangentFrame } from './patchFrame';
import { createStars } from './stars';
import type { GlobeTextures } from './textures';
```

2. Dans `web/src/globe/globe.ts`, remplacer :

```ts
/** Apparence du pays visé à un instant donné (voir reveal.ts). */
```

par :

```ts
/** Habillage du mode jeu ; absent en mode masque. */
export interface GlobeParts { textures?: GlobeTextures }

/** Apparence du pays visé à un instant donné (voir reveal.ts). */
```

3. Dans `web/src/globe/globe.ts`, remplacer :

```ts
  readonly country = createCountryLayer(new THREE.Texture());
  readonly earthMaterial = new THREE.MeshStandardNodeMaterial();
  private readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  private hasPatch = false;

  constructor(readonly mode: GlobeMode) {
    this.earthMaterial.colorNode = color(0x0b1d3a);
    this.earthMaterial.outputNode = this.country.outputNode;
```

par :

```ts
  readonly country: ReturnType<typeof createCountryLayer>;
  readonly earthMaterial: THREE.MeshStandardNodeMaterial;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  private readonly sunListeners: ((dir: Vec3) => void)[] = [];
  private hasPatch = false;

  constructor(readonly mode: GlobeMode, parts: GlobeParts = {}) {
    if (mode === 'game' && parts.textures) {
      const earth = createEarthMaterial(parts.textures);
      this.earthMaterial = earth.material;
      this.country = createCountryLayer(new THREE.Texture(), earth.base);
      const atmosphere = createAtmosphere();
      this.sunListeners.push(earth.setSun, atmosphere.setSun);
      this.root.add(atmosphere.mesh, createStars());
    } else {
      this.earthMaterial = new THREE.MeshStandardNodeMaterial();
      this.earthMaterial.colorNode = color(0x0b1d3a);
      this.country = createCountryLayer(new THREE.Texture());
    }
    this.earthMaterial.outputNode = this.country.outputNode;
```

4. Dans `web/src/globe/globe.ts`, remplacer :

```ts
    const s = sunDirection(pose);
    this.sun.position.set(s[0] * 10, s[1] * 10, s[2] * 10);
  }
```

par :

```ts
    this.setSun(sunDirection(pose));
  }

  /** Direction du soleil (unitaire) ; applyPose la place par rapport à la caméra, la sonde peut la forcer. */
  setSun(dir: Vec3): void {
    this.sun.position.set(dir[0] * 10, dir[1] * 10, dir[2] * 10);
    for (const f of this.sunListeners) f(dir);
  }
```

- [ ] **Step 7 : La page de sonde pilote la pose et le soleil**

Remplacer `web/src/probe/main.ts` par :

```ts
// web/src/probe/main.ts
import * as THREE from 'three/webgpu';
import { CameraDirector, type FramePose } from '../camera/director';
import { FLIGHT, FOV_Y_DEG, FRAMING } from '../camera/config';
import { loadCountries } from '../data/countries';
import type { LngLat } from '../data/types';
import { northUp, toLngLat, toVec } from '../geo/vec';
import { Globe } from '../globe/globe';
import { loadPatchTexture } from '../globe/patchTexture';
import { createRenderer } from '../globe/renderer';
import { loadGlobeTextures } from '../globe/textures';

/** API exposée aux contrôles Playwright (e2e/). */
export interface ProbeApi {
  backend: string;
  cca3: string | null;
  /** Pixel écran (coin haut gauche = 0,0) d'un point du globe, `null` derrière l'horizon. */
  project(points: LngLat[]): ([number, number] | null)[];
  /** Point du globe sous un pixel écran (coordonnées continues), `null` hors du globe. */
  unproject(pixels: [number, number][]): (LngLat | null)[];
}
declare global { interface Window { __probe?: ProbeApi } }

/**
 * Page de sonde (dev seulement). Paramètres :
 * - `cca3` : pays cadré comme en jeu ; sinon `at=lng,lat` et `alt` : pose explicite ;
 * - `mode=game` : textures, halo, étoiles (sinon masque) ; `tier=haute` : textures 8K ; `sun=lng,lat` : soleil forcé ;
 * - `w`, `h` : taille ; `webgl` : repli WebGL 2 forcé.
 */
const q = new URLSearchParams(location.search);
const lngLat = (s: string | null): LngLat | null => (s ? (s.split(',').map(Number) as LngLat) : null);
const width = Number(q.get('w') ?? 960), height = Number(q.get('h') ?? 600);
const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
const { renderer, backend } = await createRenderer(canvas, { forceWebGL: q.has('webgl'), antialias: false });
renderer.setPixelRatio(1);
renderer.setSize(width, height);

const mode = q.get('mode') === 'game' ? 'game' : 'mask';
const textures = mode === 'game' ? await loadGlobeTextures(renderer, q.get('tier') === 'haute' ? 'haute' : 'standard') : undefined;
const globe = new Globe(mode, { textures });
const camera = new THREE.PerspectiveCamera(FOV_Y_DEG, width / height, 0.001, 100);

const rec = q.get('cca3') ? (await loadCountries('/')).find((c) => c.cca3 === q.get('cca3')) : undefined;
if (q.get('cca3') && !rec) throw new Error(`pays inconnu : ${q.get('cca3')}`);
let pose: FramePose;
if (rec) {
  globe.setPatch(rec.patch, await loadPatchTexture(`/data/${rec.patch.sdf}`));
  globe.setLook({ visible: true, reveal: 1, state: 'question', stateTime: 0 });
  const director = new CameraDirector({
    viewport: { width, height, fovYDeg: FOV_Y_DEG }, framing: FRAMING, flight: FLIGHT, reducedMotion: true, start: rec.cap.center,
  });
  void director.flyTo(rec);
  pose = director.update(0);
} else {
  const dir = toVec(lngLat(q.get('at')) ?? [0, 0]);
  pose = { dir, altitude: Number(q.get('alt') ?? 1.4), up: northUp(dir), cut: false };
}
globe.applyPose(pose, camera);
const sun = lngLat(q.get('sun'));
if (sun) globe.setSun(toVec(sun));
const scene = new THREE.Scene();
scene.add(globe.root);
renderer.render(scene, camera);

const ray = new THREE.Raycaster();
const sphere = new THREE.Sphere(new THREE.Vector3(), 1);
const hit = new THREE.Vector3();
window.__probe = {
  backend,
  cca3: rec?.cca3 ?? null,
  project: (points) => points.map((p) => {
    const v = new THREE.Vector3(...toVec(p));
    if (v.dot(camera.position) <= 1) return null; // derrière l'horizon (sphère unité)
    v.project(camera);
    return [((v.x + 1) / 2) * width, ((1 - v.y) / 2) * height];
  }),
  unproject: (pixels) => pixels.map(([x, y]) => {
    ray.setFromCamera(new THREE.Vector2((x / width) * 2 - 1, 1 - (y / height) * 2), camera);
    return ray.ray.intersectSphere(sphere, hit) ? toLngLat([hit.x, hit.y, hit.z]) : null;
  }),
};
```

- [ ] **Step 8 : Lancer, vérifier le succès**

Run: `npm run check && npm run e2e -- e2e/earth.spec.ts e2e/patch.spec.ts`
Expected : PASS — earth : 6 tests (mesuré : Sahara [157,135,107], Pacifique [39,52,71], Paris de nuit [255,255,255], Atlantique de nuit [8,9,20], halo jour [119,164,206], halo nuit [64,42,21], identiques sur les deux backends) ; patch : toujours 16 tests.

- [ ] **Step 9 : Regarder, pas seulement mesurer**

Capturer quatre vues avec `page.screenshot` sur la sonde (`mode=game&at=10,45&alt=1.4`, `mode=game&cca3=FRA`, `mode=game&at=-150,-10&alt=1.4`, `mode=game&at=82,28&alt=0.25`, `tier=haute`) et les montrer à l'utilisateur avant de commiter.

- [ ] **Step 10 : Commit**

```bash
git add .gitignore web/package.json web/scripts/copy-basis.mjs web/src/globe web/src/probe web/e2e
git commit -m "globe : Terre photoréaliste (jour, nuit, relief, océan, voile, halo, étoiles)"
```

---

### Task 8 : Révélation du pays

**Files:**
- Create: `web/src/globe/reveal.ts`
- Test: `web/src/globe/reveal.test.ts`, `web/e2e/reveal.spec.ts`
- Modify: `web/src/probe/main.ts`

**Interfaces:**
- Consumes: `CountryLook`, `CountryState` (Task 5).
- Produces: `WAVE_MS = 600` ; `interface RevealTimeline { questionAtMs; answer?: { kind: 'correct' | 'wrong'; atMs } }` ; `lookAt(t: RevealTimeline | null, nowMs): CountryLook` ; sonde : paramètres `reveal`, `state`, `t`.

La couche pays (Task 5) sait déjà dessiner la vague, le vert de la bonne réponse (avec flash du contour) et la pulsation rouge de la mauvaise ; cette tâche fournit l'horloge qui pilote ces états, et le contrôle de leur rendu sur la vraie Terre.

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
// web/src/globe/reveal.test.ts
import { describe, expect, it } from 'vitest';
import { lookAt, WAVE_MS } from './reveal';

describe('révélation du pays au fil du temps', () => {
  it('rien sans question', () => {
    expect(lookAt(null, 1000)).toEqual({ visible: false, reveal: 0, state: 'question', stateTime: 0 });
  });
  it('la vague part du centre et s’achève en 600 ms (sortie cubique)', () => {
    const t = { questionAtMs: 1000 };
    expect(WAVE_MS).toBe(600);
    expect(lookAt(t, 1000).reveal).toBe(0);
    expect(lookAt(t, 1300).reveal).toBeCloseTo(0.875, 9); // 1 − (1 − 0,5)³
    expect(lookAt(t, 1600).reveal).toBe(1);
    expect(lookAt(t, 9000).reveal).toBe(1);
    expect(lookAt(t, 1300).state).toBe('question');
  });
  it('la réponse change l’état et remet son horloge à zéro', () => {
    const t = { questionAtMs: 1000, answer: { kind: 'wrong' as const, atMs: 4000 } };
    expect(lookAt(t, 3999).state).toBe('question');
    const l = lookAt(t, 4500);
    expect(l).toEqual({ visible: true, reveal: 1, state: 'wrong', stateTime: 0.5 });
  });
});
```

```ts
// web/e2e/reveal.spec.ts
import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test(`${backend} révélation de la France : vague, bonne et mauvaise réponse`, async ({ page }) => {
    const paris: [number, number] = [2.35, 48.85];
    const [hidden] = await (await shoot(page, backend, 'mode=game&cca3=FRA&reveal=0')).at([paris]);
    const [question] = await (await shoot(page, backend, 'mode=game&cca3=FRA&reveal=1')).at([paris]);
    const [correct] = await (await shoot(page, backend, 'mode=game&cca3=FRA&state=correct&t=2')).at([paris]);
    const [wrong] = await (await shoot(page, backend, 'mode=game&cca3=FRA&state=wrong&t=0.125')).at([paris]);
    console.log(backend, JSON.stringify({ hidden, question, correct, wrong }));
    const yellow = (c: number[]) => c[0]! > 180 && c[1]! > 170 && c[2]! < 90;
    expect(yellow(hidden!)).toBe(false);
    expect(yellow(question!)).toBe(true);
    expect(correct![1]).toBeGreaterThan(correct![0]! + 20);
    expect(wrong![0]).toBeGreaterThan(wrong![1]! + 40);
  });
}
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run --project unit src/globe/reveal.test.ts` puis `npm run e2e -- e2e/reveal.spec.ts`
Expected : FAIL — module `./reveal` introuvable ; côté Playwright, la sonde ignore `reveal` et `state` (le pays reste jaune).

- [ ] **Step 3 : Implémenter**

```ts
// web/src/globe/reveal.ts
import type { CountryLook } from './globe';

/** Durée de la vague de révélation, du centre du patch vers ses bords. */
export const WAVE_MS = 600;

export interface RevealTimeline {
  questionAtMs: number;
  answer?: { kind: 'correct' | 'wrong'; atMs: number };
}

/** Apparence du pays visé à l'instant `nowMs` (horloge de la boucle de rendu). */
export function lookAt(t: RevealTimeline | null, nowMs: number): CountryLook {
  if (!t) return { visible: false, reveal: 0, state: 'question', stateTime: 0 };
  const e = Math.min(1, Math.max(0, (nowMs - t.questionAtMs) / WAVE_MS));
  const reveal = 1 - (1 - e) ** 3;
  if (!t.answer || nowMs < t.answer.atMs) return { visible: true, reveal, state: 'question', stateTime: (nowMs - t.questionAtMs) / 1000 };
  return { visible: true, reveal: 1, state: t.answer.kind, stateTime: (nowMs - t.answer.atMs) / 1000 };
}
```

1. Dans `web/src/probe/main.ts`, remplacer :

```ts
import { loadCountries } from '../data/countries';
```

par :

```ts
import { loadCountries } from '../data/countries';
import type { CountryState } from '../globe/globe';
```

2. Dans `web/src/probe/main.ts`, remplacer :

```ts
 * - `w`, `h` : taille ; `webgl` : repli WebGL 2 forcé.

```

par :

```ts
 * - `w`, `h` : taille ; `webgl` : repli WebGL 2 forcé ;
 * - `reveal`, `state`, `t` : apparence du pays (défaut : question, vague achevée).

```

3. Dans `web/src/probe/main.ts`, remplacer :

```ts
  globe.setLook({ visible: true, reveal: 1, state: 'question', stateTime: 0 });
```

par :

```ts
  globe.setLook({ visible: true, reveal: Number(q.get('reveal') ?? 1), state: (q.get('state') ?? 'question') as CountryState, stateTime: Number(q.get('t') ?? 0) });
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npm run check && npm run e2e -- e2e/reveal.spec.ts`
Expected : PASS — reveal : 3 tests ; Playwright : 2 tests (mesuré : sans vague [73,76,68], question [212,206,47], bonne réponse [104,193,149], mauvaise [203,128,115]).

- [ ] **Step 5 : Commit**

```bash
git add web/src/globe/reveal.ts web/src/globe/reveal.test.ts web/src/probe/main.ts web/e2e/reveal.spec.ts
git commit -m "globe : chronologie de la révélation (vague, bonne et mauvaise réponse)"
```

---

### Task 9 : Frontières de vue d'ensemble

**Files:**
- Create: `web/src/globe/borders.ts`
- Test: `web/src/globe/borders.test.ts`, `web/e2e/borders.spec.ts`
- Modify: `web/src/globe/globe.ts`, `web/src/probe/main.ts`

**Interfaces:**
- Consumes: `borders.json` (phase 0, 4 298 lignes, 65 646 points) ; `toVec` (Task 1).
- Produces: `BORDER_RADIUS = 1.0002` ; `borderOpacity(altitude): number` ; `createBorders(lines): { object: LineSegments2; setAltitude(altitude) }` ; `GlobeParts.borders?: LngLat[][]` ; sonde : paramètre `borders`.

Lignes épaisses en pixels (`Line2NodeMaterial`, §10.2 tranché au prototype : pas de rubans au build), transparentes pour s'estomper : pleines (0,55) au-dessus de 0,3 rayon d'altitude, effacées sous 0,03 — de près, le canal G du patch dessine les frontières voisines, plus fines que ces lignes simplifiées à 12 %.

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
// web/src/globe/borders.test.ts
import { describe, expect, it } from 'vitest';
import { borderOpacity } from './borders';

describe('estompage des frontières vectorielles avec l’altitude', () => {
  it('pleines en vue d’ensemble, effacées de près (le patch prend le relais)', () => {
    expect(borderOpacity(1.4)).toBeCloseTo(0.55, 12);
    expect(borderOpacity(0.3)).toBeCloseTo(0.55, 12);
    expect(borderOpacity(0.03)).toBe(0);
    expect(borderOpacity(0.0003)).toBe(0);
  });
  it('décroît sans saut entre les deux', () => {
    let prev = borderOpacity(0.3);
    for (let a = 0.3; a >= 0.03; a -= 0.001) {
      const o = borderOpacity(a);
      expect(o).toBeLessThanOrEqual(prev + 1e-12);
      expect(prev - o).toBeLessThan(0.01);
      prev = o;
    }
  });
});
```

```ts
// web/e2e/borders.spec.ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { LngLat } from '../src/data/types';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

// Un sommet de frontière près de la jonction France / Luxembourg / Allemagne.
const lines = JSON.parse(readFileSync('public/data/borders.json', 'utf8')) as LngLat[][];
let vertex: LngLat = [0, 0], best = Infinity;
for (const l of lines) for (const p of l) { const d = (p[0] - 6.4) ** 2 + (p[1] - 49.2) ** 2; if (d < best) { best = d; vertex = p; } }
const sum = (c: number[]) => c[0]! + c[1]! + c[2]!;
const darkest = async (s: Awaited<ReturnType<typeof shoot>>, page: import('@playwright/test').Page) => {
  const [p] = await page.evaluate((v) => window.__probe!.project(v), [vertex]);
  let m = Infinity;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) m = Math.min(m, sum(s.px([p![0] + dx, p![1] + dy])));
  return m;
};

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test(`${backend} frontières : tracées en vue d'ensemble, effacées de près`, async ({ page }) => {
    const farWith = await darkest(await shoot(page, backend, 'mode=game&at=6.4,49.2&alt=1.4&borders'), page);
    const farWithout = await darkest(await shoot(page, backend, 'mode=game&at=6.4,49.2&alt=1.4'), page);
    const nearWith = await darkest(await shoot(page, backend, 'mode=game&at=6.4,49.2&alt=0.02&borders'), page);
    const nearWithout = await darkest(await shoot(page, backend, 'mode=game&at=6.4,49.2&alt=0.02'), page);
    console.log(backend, { farWith, farWithout, nearWith, nearWithout });
    expect(farWith).toBeLessThan(farWithout - 30);
    expect(nearWith).toBe(nearWithout);
  });
}
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run --project unit src/globe/borders.test.ts` puis `npm run e2e -- e2e/borders.spec.ts`
Expected : FAIL — module `./borders` introuvable ; aucune ligne tracée (`farWith` = `farWithout`).

- [ ] **Step 3 : Implémenter**

```ts
// web/src/globe/borders.ts
import * as THREE from 'three/webgpu';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineSegments2 } from 'three/addons/lines/webgpu/LineSegments2.js';
import type { LngLat } from '../data/types';
import { toVec } from '../geo/vec';

/** Au-dessus des facettes du maillage 512×256 (flèche ≤ 1,9·10⁻⁵ rayon), sous la balise. */
export const BORDER_RADIUS = 1.0002;
const FULL = 0.55, FADE_FROM = 0.03, FADE_TO = 0.3;

/** Spec §4.3 : frontières vectorielles estompées avec l'altitude ; de près, le canal G du patch prend le relais. */
export function borderOpacity(altitude: number): number {
  const t = Math.min(1, Math.max(0, (altitude - FADE_FROM) / (FADE_TO - FADE_FROM)));
  return FULL * t * t * (3 - 2 * t);
}

export function createBorders(lines: LngLat[][]): { object: LineSegments2; setAltitude(altitude: number): void } {
  const positions: number[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = toVec(line[i - 1]!), b = toVec(line[i]!);
      positions.push(a[0] * BORDER_RADIUS, a[1] * BORDER_RADIUS, a[2] * BORDER_RADIUS, b[0] * BORDER_RADIUS, b[1] * BORDER_RADIUS, b[2] * BORDER_RADIUS);
    }
  }
  const material = new THREE.Line2NodeMaterial({ color: 0x000000, linewidth: 1.5, worldUnits: false, alphaToCoverage: false });
  material.transparent = true;
  const object = new LineSegments2(new LineSegmentsGeometry().setPositions(positions), material);
  return {
    object,
    setAltitude(altitude) {
      material.opacity = borderOpacity(altitude);
      object.visible = material.opacity > 0;
    },
  };
}
```

1. Dans `web/src/globe/globe.ts`, remplacer :

```ts
import type { PatchMeta } from '../data/types';
```

par :

```ts
import type { LngLat, PatchMeta } from '../data/types';
```

2. Dans `web/src/globe/globe.ts`, remplacer :

```ts
import { createAtmosphere } from './atmosphere';
```

par :

```ts
import { createAtmosphere } from './atmosphere';
import { createBorders } from './borders';
```

3. Dans `web/src/globe/globe.ts`, remplacer :

```ts
export interface GlobeParts { textures?: GlobeTextures }
```

par :

```ts
export interface GlobeParts { textures?: GlobeTextures; borders?: LngLat[][] }
```

4. Dans `web/src/globe/globe.ts`, remplacer :

```ts
  private readonly sunListeners: ((dir: Vec3) => void)[] = [];

```

par :

```ts
  private readonly sunListeners: ((dir: Vec3) => void)[] = [];
  private readonly altitudeListeners: ((altitude: number) => void)[] = [];

```

5. Dans `web/src/globe/globe.ts`, remplacer :

```ts
      this.root.add(atmosphere.mesh, createStars());

```

par :

```ts
      this.root.add(atmosphere.mesh, createStars());
      if (parts.borders) {
        const borders = createBorders(parts.borders);
        this.root.add(borders.object);
        this.altitudeListeners.push(borders.setAltitude);
      }

```

6. Dans `web/src/globe/globe.ts`, remplacer :

```ts
    this.setSun(sunDirection(pose));
  }
```

par :

```ts
    this.setSun(sunDirection(pose));
    for (const f of this.altitudeListeners) f(pose.altitude);
  }
```

1. Dans `web/src/probe/main.ts`, remplacer :

```ts
 * - `reveal`, `state`, `t` : apparence du pays (défaut : question, vague achevée).

```

par :

```ts
 * - `reveal`, `state`, `t` : apparence du pays (défaut : question, vague achevée) ;
 * - `borders` : frontières de vue d'ensemble.

```

2. Dans `web/src/probe/main.ts`, remplacer :

```ts
const globe = new Globe(mode, { textures });
```

par :

```ts
const borders = q.has('borders') ? ((await (await fetch('/data/borders.json')).json()) as LngLat[][]) : undefined;
const globe = new Globe(mode, { textures, borders });
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npm run check && npm run e2e -- e2e/borders.spec.ts`
Expected : PASS — borders : 2 tests ; Playwright : 2 tests (mesuré : pixel le plus sombre au sommet 83 avec les lignes contre 157 sans, en vue d'ensemble ; 178 dans les deux cas à 0,02 rayon).

- [ ] **Step 5 : Commit**

```bash
git add web/src/globe/borders.ts web/src/globe/borders.test.ts web/src/globe/globe.ts web/src/probe/main.ts web/e2e/borders.spec.ts
git commit -m "globe : frontières de vue d'ensemble en lignes épaisses, estompées avec l'altitude"
```

---

### Task 10 : Balise des micro-États et des archipels

**Files:**
- Create: `web/src/globe/beacon.ts`
- Test: `web/src/globe/beacon.test.ts`, `web/e2e/beacon.spec.ts`
- Modify: `web/src/globe/globe.ts`, `web/src/probe/main.ts`

**Interfaces:**
- Consumes: `frameAltitude`, `FramingParams`, `Viewport` (Task 1).
- Produces: `BEACON_MAX_SCREEN_PX2 = 400` ; `BEACON_SIZE_PX = 56` ; `screenAreaPx(areaKm2, altitude, viewport)` ; `needsBeacon(rec, viewport, framing): boolean` ; `createBeacon()` ; `Globe.setBeacon(point | null)`, `Globe.setTime(seconds)` ; sonde : paramètre `beacon=lng,lat`.

**La règle vient des données.** Au cadrage du jeu (960×600), la surface de terre à l'écran des sept plus petits est : Tuvalu 8 px², Marshall 11, Micronésie 12, Maldives 34, Seychelles 44, Palaos 153, Tonga 207 ; le suivant, Kiribati, en a 995. Au contrôle des 197 pays (Task 12), Micronésie, Maldives, Marshall, Seychelles et Tuvalu n'ont **aucun** point de la grille dans le pays : c'est la balise qui les montre. Un pays cadré au plancher (le Vatican si la calibration y conduit) en a une aussi, comme tout pays dont le patch n'a pas pu être chargé (Task 11).

- [ ] **Step 1 : Écrire les tests qui échouent**

```ts
// web/src/globe/beacon.test.ts
import { describe, expect, it } from 'vitest';
import { needsBeacon, screenAreaPx } from './beacon';

const landscape = { width: 960, height: 600, fovYDeg: 50 };
const framing = { k: 1, margin: 1.6, floor: 0.0003, overview: { landscape: 1.4, portrait: 2.2 } };
const rec = (areaKm2: number, radiusDeg: number) => ({ areaKm2, cap: { center: [0, 0] as [number, number], radiusDeg } });

describe('balise des micro-États et des archipels', () => {
  it('surface à l’écran au centre de l’image', () => {
    // à 0,1 rayon, la hauteur de l'image couvre 2·tan 25° · 0,1 · 6371,0088 km = 594,2 km sur 600 px
    const kmPerPx = (2 * Math.tan((25 * Math.PI) / 180) * 0.1 * 6371.0088) / 600;
    expect(screenAreaPx(1000, 0.1, landscape)).toBeCloseTo(1000 / kmPerPx ** 2, 9);
  });
  it('Tuvalu (26 km² sur une calotte de 4,1°) a sa balise, la France non', () => {
    expect(needsBeacon(rec(26, 4.1), landscape, framing)).toBe(true);
    expect(needsBeacon(rec(551695, 4.87), landscape, framing)).toBe(false);
  });
  it('un pays cadré au plancher a sa balise', () => {
    expect(needsBeacon(rec(0.49, 0.001), landscape, framing)).toBe(true);
  });
});
```

```ts
// web/e2e/beacon.spec.ts
import { expect, test } from '@playwright/test';
import { shoot } from './probe-page';
import type { BackendName } from './sdf-check';

const bright = (c: number[]) => c[0]! > 220 && c[1]! > 200;

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test(`${backend} balise : cœur au point, trait vers le haut, rien sans balise`, async ({ page }) => {
    const tuvalu: [number, number] = [179.2, -8.5];
    const s = await shoot(page, backend, `mode=game&at=179.2,-8.5&alt=0.25&beacon=${tuvalu.join(',')}`);
    const [p] = await page.evaluate((v) => window.__probe!.project(v), [tuvalu]);
    const [x, y] = [Math.round(p![0]), Math.round(p![1])];
    const core = s.px([x, y]), above = s.px([x, y - 15]), below = s.px([x, y + 15]);
    const none = (await shoot(page, backend, 'mode=game&at=179.2,-8.5&alt=0.25')).px([x, y]);
    console.log(backend, JSON.stringify({ core, above, below, none }));
    expect(bright(core)).toBe(true);
    expect(above[0]!).toBeGreaterThan(below[0]! + 60);
    expect(bright(none)).toBe(false);
  });
}
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npx vitest run --project unit src/globe/beacon.test.ts` puis `npm run e2e -- e2e/beacon.spec.ts`
Expected : FAIL — module `./beacon` introuvable ; aucune balise dessinée.

- [ ] **Step 3 : Implémenter**

```ts
// web/src/globe/beacon.ts
import * as THREE from 'three/webgpu';
import { abs, float, fract, max, mix, smoothstep, step, uniform, uv, vec3 } from 'three/tsl';
import { frameAltitude, type FramingParams, type Viewport } from '../camera/framing';
import type { LngLat } from '../data/types';
import { toVec } from '../geo/vec';

const EARTH_RADIUS_KM = 6371.0088;
/** Sous ≈ 20 × 20 px de terre à l'écran, le pays n'est plus lisible : la balise prend le relais (mesuré le 02/10 :
 *  TUV 8, MHL 11, FSM 12, MDV 34, SYC 44, PLW 153, TON 207 px² ; le suivant, KIR, 995). */
export const BEACON_MAX_SCREEN_PX2 = 400;
export const BEACON_SIZE_PX = 56;

/** Surface (px²) qu'occupent `areaKm2` au centre de l'image, à l'altitude donnée (approximation plane). */
export function screenAreaPx(areaKm2: number, altitude: number, v: Viewport): number {
  const kmPerPx = (2 * Math.tan((v.fovYDeg * Math.PI) / 360) * altitude * EARTH_RADIUS_KM) / v.height;
  return areaKm2 / kmPerPx ** 2;
}

export function needsBeacon(rec: { areaKm2: number; cap: { radiusDeg: number } }, v: Viewport, framing: FramingParams): boolean {
  const altitude = frameAltitude(rec.cap.radiusDeg, v, framing);
  return altitude <= framing.floor || screenAreaPx(rec.areaKm2, altitude, v) < BEACON_MAX_SCREEN_PX2;
}

/** Balise en pixels d'écran : cœur blanc, anneau jaune qui pulse, trait vertical au-dessus (spec §4.3). */
export function createBeacon(): { sprite: THREE.Sprite; setPosition(p: LngLat | null): void; setTime(seconds: number): void } {
  const time = uniform(0);
  const m = new THREE.PointsNodeMaterial({ sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false });
  m.sizeNode = float(BEACON_SIZE_PX);
  // Sur un Sprite unique, sans positionNode, les sommets du quad (±0,5 en unités monde) seraient projetés
  // puis décalés une seconde fois : rien n'apparaîtrait (constaté au prototype).
  m.positionNode = vec3(0, 0, 0);
  const p = uv().sub(0.5); // −0,5 … 0,5, y vers le haut
  const d = p.length();
  const pulse = fract(time.mul(0.8));
  const ring = smoothstep(float(0.035), float(0), abs(d.sub(mix(float(0.08), float(0.3), pulse)))).mul(pulse.oneMinus());
  const core = smoothstep(float(0.07), float(0.045), d);
  const beam = smoothstep(float(0.02), float(0), abs(p.x)).mul(step(float(0.06), p.y)).mul(p.y.mul(2).oneMinus());
  m.colorNode = mix(vec3(1.0, 0.933, 0.012), vec3(1, 1, 1), max(core, beam));
  m.opacityNode = max(max(ring, core), beam.mul(0.8));
  const sprite = new THREE.Sprite(m);
  sprite.renderOrder = 10;
  sprite.visible = false;
  return {
    sprite,
    setPosition(ll) {
      sprite.visible = ll !== null;
      if (ll) sprite.position.set(...toVec(ll)).multiplyScalar(1.0005);
    },
    setTime(seconds) { time.value = seconds; },
  };
}
```

1. Dans `web/src/globe/globe.ts`, remplacer :

```ts
import { createAtmosphere } from './atmosphere';

```

par :

```ts
import { createAtmosphere } from './atmosphere';
import { createBeacon } from './beacon';

```

2. Dans `web/src/globe/globe.ts`, remplacer :

```ts
  private readonly altitudeListeners: ((altitude: number) => void)[] = [];

```

par :

```ts
  private readonly altitudeListeners: ((altitude: number) => void)[] = [];
  private readonly beacon = createBeacon();

```

3. Dans `web/src/globe/globe.ts`, remplacer :

```ts
      this.root.add(atmosphere.mesh, createStars());

```

par :

```ts
      this.root.add(atmosphere.mesh, createStars(), this.beacon.sprite);

```

4. Dans `web/src/globe/globe.ts`, remplacer :

```ts
  /** Place la caméra (regard vers le centre, `up` en haut) et le soleil pour la pose de la frame. */
```

par :

```ts
  /** Balise au pôle d'inaccessibilité du pays visé (micro-États, archipels, patch absent) ; `null` la retire. */
  setBeacon(point: LngLat | null): void { this.beacon.setPosition(point); }

  /** Horloge des animations propres au globe (pulsation de la balise), en secondes. */
  setTime(seconds: number): void { this.beacon.setTime(seconds); }

  /** Place la caméra (regard vers le centre, `up` en haut) et le soleil pour la pose de la frame. */
```

1. Dans `web/src/probe/main.ts`, remplacer :

```ts
 * - `borders` : frontières de vue d'ensemble.

```

par :

```ts
 * - `borders` : frontières de vue d'ensemble ;
 * - `beacon=lng,lat` : balise.

```

2. Dans `web/src/probe/main.ts`, remplacer :

```ts
const sun = lngLat(q.get('sun'));
```

par :

```ts
globe.setBeacon(lngLat(q.get('beacon')));
const sun = lngLat(q.get('sun'));
```

- [ ] **Step 4 : Lancer, vérifier le succès**

Run: `npm run check && npm run e2e -- e2e/beacon.spec.ts`
Expected : PASS — beacon : 3 tests ; Playwright : 2 tests (mesuré : cœur [255,255,255], trait au-dessus [134,134,95], dessous [38,51,70], sans balise [38,51,71]).

- [ ] **Step 5 : Commit**

```bash
git add web/src/globe/beacon.ts web/src/globe/beacon.test.ts web/src/globe/globe.ts web/src/probe/main.ts web/e2e/beacon.spec.ts
git commit -m "globe : balise en pixels d'écran pour les micro-États et les archipels"
```

---

### Task 11 : GlobeView (R3F), cache des patchs et démonstration

**Files:**
- Create: `web/src/globe/three-elements.d.ts`, `web/src/globe/patchCache.ts`, `web/src/globe/controller.ts`, `web/src/globe/GlobeView.tsx`
- Modify: `web/src/main.tsx` (réécrit : démonstration), `web/index.html` (réécrit), `web/package.json` (R3F), `web/tsconfig.json` (`types`)
- Test: `web/src/globe/patchCache.test.ts`, `web/e2e/flight.spec.ts`, `web/e2e/unsupported.spec.ts`

**Interfaces:**
- Consumes: tout ce qui précède.
- Produces: `createPatchCache(load, dispose): { get(key); keep(keys) }` ; `class GlobeController` (`director`, `timeline`, `attach(globe)`, `setViewport`, `setFraming`, `flyTo(rec)`, `prefetch(rec)`, `showQuestion(now)`, `answer(kind, now)`, `clear()`) ; `GlobeView` (props `ref?: Ref<GlobeHandle>`, `framing?`, `onReady?`) ; `interface GlobeHandle { flyTo; prefetch; showQuestion; answer; clear; overview; setIdleSpin }` — c'est l'API que la phase 2 (jeu) consommera ; en dev, `window.__globe: GlobeDebug` (`backend`, `generation`, `frames`, `project`, `simulateDeviceLost`) et `window.__demo`.

**Ce que couvrent les tests (Review Focus n°2 et n°3) :** `flyTo` se résout à l'arrivée même si le patch est en 404 — la balise prend alors le relais ; une perte du GPU recrée le renderer (nouveau `Canvas`) sans perdre la partie, car l'état vit dans `GlobeController`, hors du `Canvas` ; sans WebGL ni WebGPU, l'erreur du renderer est rattrapée et la page affiche « Ton navigateur ne peut pas afficher le globe ». Mesuré au prototype : vols ≈ 20 s par test sous SwiftShader, 7 tests sur 7.

- [ ] **Step 1 : Dépendances et types**

```bash
npm install -E @react-three/fiber@9.8.1
```

Dans `web/tsconfig.json`, `types` devient `["node", "vite/client"]` (pour `import.meta.env.DEV`).

- [ ] **Step 2 : Écrire les tests qui échouent**

```ts
// web/src/globe/patchCache.test.ts
import { describe, expect, it } from 'vitest';
import { createPatchCache } from './patchCache';

const deferred = <T,>() => { let resolve!: (v: T) => void, reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

describe('cache des patchs : le courant et le suivant seulement', () => {
  it('ne charge qu’une fois par clé', async () => {
    let loads = 0;
    const c = createPatchCache(async (k: string) => { loads++; return k.toUpperCase(); }, () => {});
    expect(await c.get('fra')).toBe('FRA');
    expect(await c.get('fra')).toBe('FRA');
    expect(loads).toBe(1);
  });
  it('keep libère tout le reste, une fois chargé', async () => {
    const disposed: string[] = [];
    const c = createPatchCache(async (k: string) => k, (v) => disposed.push(v));
    await Promise.all(['fra', 'jpn', 'chl'].map((k) => c.get(k)));
    c.keep(['jpn', 'chl']);
    await Promise.resolve();
    expect(disposed).toEqual(['fra']);
  });
  it('un échec n’est pas mis en cache : la clé se recharge au prochain appel', async () => {
    let attempt = 0;
    const c = createPatchCache(async (k: string) => { attempt++; if (attempt === 1) throw new Error('404'); return k; }, () => {});
    await expect(c.get('fra')).rejects.toThrow('404');
    expect(await c.get('fra')).toBe('fra');
  });
  it('libère aussi un patch dont le chargement finit après keep', async () => {
    const d = deferred<string>();
    const disposed: string[] = [];
    const c = createPatchCache((k: string) => (k === 'slow' ? d.promise : Promise.resolve(k)), (v) => disposed.push(v));
    void c.get('slow');
    c.keep(['fra']);
    d.resolve('slow');
    await d.promise; await Promise.resolve();
    expect(disposed).toEqual(['slow']);
  });
});
```

```ts
// web/e2e/flight.spec.ts
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import type { CountryRecord } from '../src/data/types';
import type { BackendName } from './sdf-check';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const by = (cca3: string) => countries.find((c) => c.cca3 === cca3)!;

async function pixelAt(page: Page, rec: CountryRecord): Promise<number[]> {
  const p = await page.evaluate((b) => window.__globe!.project(b), rec.beacon);
  if (!p) throw new Error(`${rec.cca3} : balise derrière l'horizon`);
  const png = PNG.sync.read(await page.screenshot());
  const i = (Math.floor(p[1]) * png.width + Math.floor(p[0])) * 4;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
}

for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  const q = backend === 'webgl2' ? '&webgl' : '';
  test.describe(backend, () => {
    test.use({ viewport: { width: 960, height: 600 } });

    test('vole de pays en pays et allume chacun à l’arrivée', async ({ page }) => {
      await page.goto(`/?demo=FRA,JPN,FJI${q}`);
      await page.waitForFunction(() => window.__demo?.done === true, null, { timeout: 45_000 });
      expect(await page.evaluate(() => window.__demo!.arrived)).toEqual(['FRA', 'JPN', 'FJI']);
      expect(await page.evaluate(() => window.__globe!.backend)).toBe(backend);
      const c = await pixelAt(page, by('FJI'));
      console.log(backend, 'Fidji après bonne réponse', JSON.stringify(c));
      expect(c[1]!).toBeGreaterThan(c[0]! + 20); // vert
    });

    test('patch absent (404) : la manche continue et la balise prend le relais', async ({ page }) => {
      await page.route('**/data/patches/sdf/fra.png', (r) => r.fulfill({ status: 404 }));
      await page.goto(`/?demo=FRA${q}`);
      await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 30_000 });
      await page.waitForTimeout(300);
      const c = await pixelAt(page, by('FRA'));
      console.log(backend, 'balise de secours', JSON.stringify(c));
      expect(c.every((v) => v > 220)).toBe(true); // cœur blanc de la balise
    });

    test('perte du GPU : le renderer est recréé et le globe repart', async ({ page }) => {
      await page.goto(`/?demo=FRA${q}`);
      await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 30_000 });
      await page.evaluate(() => window.__globe!.simulateDeviceLost());
      await page.waitForFunction(() => window.__globe?.generation === 1 && window.__globe.frames > 10, null, { timeout: 30_000 });
      const c = await pixelAt(page, by('FRA'));
      console.log(backend, 'après recréation', JSON.stringify(c));
      expect(c[0]! + c[1]! + c[2]!).toBeGreaterThan(60);
    });
  });
}
```

```ts
// web/e2e/unsupported.spec.ts
import { expect, test } from '@playwright/test';

// Sans les options WebGPU de la configuration et avec WebGL coupé, ni l'un ni l'autre n'est disponible.
test.use({ launchOptions: { args: ['--disable-webgl'] } });

test('sans WebGL ni WebGPU : « navigateur non compatible »', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Ton navigateur ne peut pas afficher le globe')).toBeVisible({ timeout: 30_000 });
});
```

- [ ] **Step 3 : Lancer, vérifier l'échec**

Run: `npx vitest run --project unit src/globe/patchCache.test.ts` puis `npm run e2e -- e2e/flight.spec.ts e2e/unsupported.spec.ts`
Expected : FAIL — module `./patchCache` introuvable ; la page d'accueil est encore la page provisoire (`window.__demo` jamais défini, aucun message d'incompatibilité).

- [ ] **Step 4 : Implémenter**

```ts
// web/src/globe/patchCache.ts
/**
 * Garde en mémoire les patchs demandés (le courant et le suivant, spec §4.3) : un chargement par clé ; `keep` libère
 * tout le reste, y compris ce qui finit de charger après coup ; un échec n'est pas retenu (la clé se recharge).
 */
export function createPatchCache<T>(load: (key: string) => Promise<T>, dispose: (value: T) => void) {
  const entries = new Map<string, Promise<T>>();
  return {
    get(key: string): Promise<T> {
      let p = entries.get(key);
      if (!p) {
        const loading = load(key);
        p = loading;
        entries.set(key, loading);
        loading.catch(() => { if (entries.get(key) === loading) entries.delete(key); });
      }
      return p;
    },
    keep(keys: readonly string[]): void {
      for (const [k, p] of [...entries]) {
        if (keys.includes(k)) continue;
        entries.delete(k);
        p.then(dispose, () => {});
      }
    },
  };
}
```

```ts
// web/src/globe/three-elements.d.ts
import type { ThreeToJSXElements } from '@react-three/fiber';
import type * as THREE from 'three/webgpu';

// Les éléments JSX de R3F sont ceux de three/webgpu (et non de three) : <primitive>, <mesh>… acceptent les NodeMaterial.
declare module '@react-three/fiber' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ThreeElements extends ThreeToJSXElements<typeof THREE> {}
}
```

```ts
// web/src/globe/controller.ts
import type * as THREE from 'three/webgpu';
import { CameraDirector } from '../camera/director';
import { FLIGHT, FOV_Y_DEG, FRAMING } from '../camera/config';
import type { FramingParams, Viewport } from '../camera/framing';
import type { CountryRecord } from '../data/types';
import { needsBeacon } from './beacon';
import type { Globe } from './globe';
import { createPatchCache } from './patchCache';
import { disposePatchTexture, loadPatchTexture } from './patchTexture';
import type { RevealTimeline } from './reveal';

/**
 * État du globe qui survit à la recréation du renderer (perte du GPU) : caméra, pays visé, patchs, révélation.
 * Le `Globe` three, lui, est recréé avec le renderer et s'y rattache par `attach`.
 */
export class GlobeController {
  readonly director: CameraDirector;
  timeline: RevealTimeline | null = null;
  private globe: Globe | null = null;
  private target: CountryRecord | null = null;
  private patch: THREE.Texture | null = null;
  private patchFailed = false;
  private next: CountryRecord | null = null;
  private viewport: Viewport;
  private framing: FramingParams;
  private readonly cache = createPatchCache((sdf: string) => loadPatchTexture(`${this.baseUrl}data/${sdf}`), disposePatchTexture);

  constructor(private readonly baseUrl = '/', reducedMotion = false) {
    this.viewport = { width: 960, height: 600, fovYDeg: FOV_Y_DEG };
    this.framing = FRAMING;
    this.director = new CameraDirector({ viewport: this.viewport, framing: FRAMING, flight: FLIGHT, reducedMotion, start: [2.35, 30] });
  }

  attach(globe: Globe | null): void {
    this.globe = globe;
    this.apply();
  }

  setViewport(v: Viewport): void {
    this.viewport = v;
    this.director.setViewport(v);
    this.apply();
  }

  setFraming(p: FramingParams): void {
    this.framing = p;
    this.director.setFraming(p);
    this.apply();
  }

  /** Vole vers le pays ; résolue à l'arrivée, que le patch soit chargé, en retard ou en échec (la manche n'attend pas). */
  flyTo(rec: CountryRecord): Promise<void> {
    this.target = rec;
    this.timeline = null;
    this.patch = null;
    this.patchFailed = false;
    this.cache.keep([rec.patch.sdf, ...(this.next ? [this.next.patch.sdf] : [])]);
    this.cache.get(rec.patch.sdf).then(
      (t) => { if (this.target === rec) { this.patch = t; this.apply(); } },
      () => { if (this.target === rec) { this.patchFailed = true; this.apply(); } },
    );
    this.apply();
    return this.director.flyTo(rec);
  }

  prefetch(rec: CountryRecord): void {
    this.next = rec;
    this.cache.get(rec.patch.sdf).catch(() => {});
  }

  showQuestion(nowMs: number): void { this.timeline = { questionAtMs: nowMs }; }

  answer(kind: 'correct' | 'wrong', nowMs: number): void {
    if (this.timeline) this.timeline = { ...this.timeline, answer: { kind, atMs: nowMs } };
  }

  clear(): void {
    this.target = null;
    this.timeline = null;
    this.apply();
  }

  private apply(): void {
    const g = this.globe, rec = this.target;
    if (!g) return;
    g.setPatch(rec && this.patch ? rec.patch : null, this.patch);
    const beacon = rec !== null && (this.patchFailed || needsBeacon(rec, this.viewport, this.framing));
    g.setBeacon(beacon ? rec.beacon : null);
  }
}
```

```ts
// web/src/globe/GlobeView.tsx
import { Component, useEffect, useImperativeHandle, useState, type ReactNode, type Ref } from 'react';
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { FOV_Y_DEG } from '../camera/config';
import type { FramingParams } from '../camera/framing';
import type { CountryRecord, LngLat } from '../data/types';
import { toVec } from '../geo/vec';
import { GlobeController } from './controller';
import { Globe } from './globe';
import { createRenderer, qualityTier, type Backend, type QualityTier } from './renderer';
import { lookAt } from './reveal';
import { loadGlobeTextures } from './textures';

extend(THREE as unknown as Parameters<typeof extend>[0]);

export interface GlobeHandle {
  flyTo(rec: CountryRecord): Promise<void>;
  prefetch(rec: CountryRecord): void;
  showQuestion(): void;
  answer(kind: 'correct' | 'wrong'): void;
  clear(): void;
  overview(): Promise<void>;
  setIdleSpin(degPerSec: number): void;
}

/** Crochets de test (dev seulement) : backend, recréations du renderer, projection écran, perte simulée du GPU. */
export interface GlobeDebug {
  backend: Backend;
  generation: number;
  frames: number;
  project(p: LngLat): [number, number] | null;
  simulateDeviceLost(): void;
}
declare global { interface Window { __globe?: GlobeDebug } }

interface Props {
  ref?: Ref<GlobeHandle>;
  framing?: FramingParams;
  onReady?(info: { backend: Backend; tier: QualityTier }): void;
}

class Unsupported extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p className="globe-unsupported">Ton navigateur ne peut pas afficher le globe : il faut WebGPU ou WebGL 2.</p>
      : this.props.children;
  }
}

/** Globe plein cadre : R3F habille `Globe` ; l'état (caméra, pays, patchs) vit dans `GlobeController`. */
export function GlobeView({ ref, framing, onReady }: Props) {
  const [controller] = useState(() => new GlobeController('/', matchMedia('(prefers-reduced-motion: reduce)').matches));
  const [generation, setGeneration] = useState(0);
  const [fade, setFade] = useState(false);
  const forceWebGL = new URLSearchParams(location.search).has('webgl');

  useEffect(() => { if (framing) controller.setFraming(framing); }, [controller, framing]);
  useImperativeHandle(ref, () => ({
    flyTo: (rec) => controller.flyTo(rec),
    prefetch: (rec) => controller.prefetch(rec),
    showQuestion: () => controller.showQuestion(performance.now()),
    answer: (kind) => controller.answer(kind, performance.now()),
    clear: () => controller.clear(),
    overview: () => controller.director.flyToOverview(),
    setIdleSpin: (d) => controller.director.setIdleSpin(d),
  }), [controller]);

  return (
    <Unsupported>
      <div style={{ position: 'absolute', inset: 0 }}>
        <Canvas
          key={generation}
          flat
          dpr={[1, 2]}
          camera={{ fov: FOV_Y_DEG, near: 0.001, far: 100 }}
          gl={async (props) => {
            const info = await createRenderer(props.canvas as HTMLCanvasElement, { forceWebGL });
            const tier = qualityTier({ backend: info.backend, coarsePointer: matchMedia('(pointer: coarse)').matches, maxTexture2D: info.maxTexture2D });
            // Perte du GPU : on recrée le renderer (nouveau Canvas) ; le contrôleur garde la partie.
            info.renderer.onDeviceLost = () => setGeneration((g) => g + 1);
            Object.assign(info.renderer, { userData: { backend: info.backend, tier } });
            return info.renderer;
          }}
        >
          <GlobeScene controller={controller} generation={generation} onReady={onReady} onCut={() => setFade(true)} />
        </Canvas>
        <div
          onTransitionEnd={() => setFade(false)}
          style={{ position: 'absolute', inset: 0, background: '#000', pointerEvents: 'none', opacity: fade ? 1 : 0, transition: fade ? 'none' : 'opacity 250ms' }}
        />
      </div>
    </Unsupported>
  );
}

function GlobeScene({ controller, generation, onReady, onCut }: { controller: GlobeController; generation: number; onReady?: Props['onReady']; onCut(): void }) {
  const renderer = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer & { userData: { backend: Backend; tier: QualityTier } };
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const [globe, setGlobe] = useState<Globe | null>(null);

  useEffect(() => {
    let alive = true;
    const { backend, tier } = renderer.userData;
    void Promise.all([loadGlobeTextures(renderer, tier), fetch('/data/borders.json').then((r) => r.json() as Promise<LngLat[][]>)]).then(([textures, borders]) => {
      if (!alive) return;
      const g = new Globe('game', { textures, borders });
      controller.attach(g);
      setGlobe(g);
      onReady?.({ backend, tier });
    });
    return () => { alive = false; controller.attach(null); };
  }, [renderer, controller, onReady]);

  useEffect(() => { controller.setViewport({ width: size.width, height: size.height, fovYDeg: FOV_Y_DEG }); }, [controller, size.width, size.height]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const debug: GlobeDebug = {
      backend: renderer.userData.backend,
      generation,
      frames: 0,
      project(p) {
        const v = new THREE.Vector3(...toVec(p));
        if (v.dot(camera.position) <= 1) return null;
        v.project(camera);
        return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
      },
      simulateDeviceLost: () => renderer.onDeviceLost({ api: 'WebGPU', message: 'test', reason: null, originalEvent: null }),
    };
    window.__globe = debug;
  }, [renderer, camera, size.width, size.height, generation]);

  useFrame(() => {
    if (!globe) return;
    const now = performance.now();
    const pose = controller.director.update(now);
    globe.setLook(lookAt(controller.timeline, now));
    globe.setTime(now / 1000);
    globe.applyPose(pose, camera);
    if (pose.cut) onCut();
    if (window.__globe) window.__globe.frames++;
  });

  return globe ? <primitive object={globe.root} /> : null;
}
```

Remplacer `web/src/main.tsx` et `web/index.html` par :

```ts
// web/src/main.tsx
import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { loadCountries } from './data/countries';
import type { CountryRecord } from './data/types';
import { GlobeView, type GlobeHandle } from './globe/GlobeView';

declare global { interface Window { __demo?: { arrived: string[]; done: boolean } } }

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Démonstration de la phase 1A, en attendant le jeu (phase 2) : vols, question, réponse. `?demo=FRA,JPN,FJI` enchaîne
 * ces pays tout seul (contrôle Playwright) ; sinon, un bouton « pays suivant ».
 */
function Demo() {
  const globe = useRef<GlobeHandle>(null);
  const [countries, setCountries] = useState<CountryRecord[]>([]);
  const [current, setCurrent] = useState<CountryRecord | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { void loadCountries('/').then(setCountries); }, []);

  async function visit(rec: CountryRecord, next?: CountryRecord) {
    setCurrent(rec);
    if (next) globe.current!.prefetch(next);
    await globe.current!.flyTo(rec);
    window.__demo!.arrived.push(rec.cca3);
    globe.current!.showQuestion();
  }

  useEffect(() => {
    const list = new URLSearchParams(location.search).get('demo');
    if (!ready || !countries.length) return;
    window.__demo = { arrived: [], done: false };
    if (!list) return;
    const codes = list.split(',');
    void (async () => {
      for (let i = 0; i < codes.length; i++) {
        const rec = countries.find((c) => c.cca3 === codes[i])!;
        await visit(rec, countries.find((c) => c.cca3 === codes[i + 1]));
        await wait(700);
        globe.current!.answer('correct');
        await wait(600);
      }
      window.__demo!.done = true;
    })();
  }, [ready, countries]);

  const random = () => countries[Math.floor(Math.random() * countries.length)]!;
  return (
    <>
      <GlobeView ref={globe} onReady={() => setReady(true)} />
      <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', gap: 8, fontFamily: 'sans-serif' }}>
        <button disabled={!ready} onClick={() => void visit(random())}>Pays suivant</button>
        <button disabled={!current} onClick={() => globe.current!.answer('correct')}>Bonne réponse</button>
        <button disabled={!current} onClick={() => globe.current!.answer('wrong')}>Mauvaise réponse</button>
        <span style={{ color: '#f7dc6f' }}>{current?.name}</span>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>);
```

```html
<!-- web/index.html -->
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Countrizz</title>
    <style>html, body, #root { margin: 0; height: 100dvh; background: #000; overflow: hidden; }</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5 : Lancer, vérifier le succès**

Run: `npm run check && npm run e2e -- e2e/flight.spec.ts e2e/unsupported.spec.ts`
Expected : PASS — patchCache : 4 tests ; Playwright : 7 tests (mesuré : Fidji après bonne réponse [98,191,147], balise de secours [255,255,255], globe après recréation [102,192,148]).

- [ ] **Step 6 : Essai à la main**

`npm run dev`, ouvrir `http://localhost:5173/` : « Pays suivant » vole vers un pays tiré au hasard ; « Bonne réponse » / « Mauvaise réponse » ; redimensionner la fenêtre pendant un vol (pas de saut) ; `?webgl` force le repli. Montrer à l'utilisateur.

- [ ] **Step 7 : Commit**

```bash
git add web/package.json web/package-lock.json web/tsconfig.json web/index.html web/src web/e2e
git commit -m "globe : GlobeView (R3F), contrôleur, cache des patchs, démonstration ; patch absent, perte du GPU, navigateur incompatible"
```

---

### Task 12 : Contrôle des 197 pays et intégration continue

**Files:**
- Create: `web/e2e/countries.spec.ts`
- Modify: `.github/workflows/web-ci.yml`, `README.md`, `web/package.json`

**Interfaces:**
- Consumes: `checkCountry` (Task 5), `needsBeacon` (Task 10), `FRAMING`, `FOV_Y_DEG` (Task 3).
- Produces: le contrôle du spec §8 « chaque pays s'allume là où on l'attend », pour les 197 pays, sur les deux backends ; un job CI `e2e`.

Mesuré au prototype : **0 désaccord sur les 197 pays**, en WebGL 2 (1,7 min) comme en WebGPU (2,1 min) ; la suite Playwright complète (428 tests) en 6,0 min sur le poste.

- [ ] **Step 1 : Écrire le contrôle**

```ts
// web/e2e/countries.spec.ts
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FOV_Y_DEG, FRAMING } from '../src/camera/config';
import type { CountryRecord } from '../src/data/types';
import { needsBeacon } from '../src/globe/beacon';
import { checkCountry, type BackendName } from './sdf-check';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const VIEWPORT = { width: 960, height: 600 };

// Spec §8 : « chaque pays s'allume là où on l'attend », pour les 197, sur les deux backends.
for (const backend of ['webgpu', 'webgl2'] as BackendName[]) {
  test.describe(backend, () => {
    for (const rec of countries) {
      test(`${rec.cca3} s'allume là où on l'attend`, async ({ page }) => {
        const r = await checkCountry(page, rec, { backend, ...VIEWPORT });
        expect(r.mismatches).toEqual([]);
        // Un archipel d'îlots peut ne couvrir aucun point de la grille : c'est alors la balise qui le montre.
        expect(r.inside > 0 || needsBeacon(rec, { ...VIEWPORT, fovYDeg: FOV_Y_DEG }, FRAMING)).toBe(true);
      });
    }
  });
}
```

Dans `web/package.json` : `"e2e:countries": "playwright test e2e/countries.spec.ts"`.

- [ ] **Step 2 : Le lancer**

Run: `npm run e2e:countries`
Expected : 394 passed (197 × 2). Un échec se lit dans `mismatches` (pixel, point, attendu, rouge lu) : ne pas élargir la bande d'incertitude pour le faire passer — chercher d'abord la cause (le cas du Vatican au prototype était une vraie erreur de géométrie).

- [ ] **Step 3 : Job CI**

Ajouter à `.github/workflows/web-ci.yml`, après le job `check` :

```yaml
  e2e:
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
      - run: npm run e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright
          path: web/test-results/
```

Dans `README.md`, ajouter : `npm run e2e` (contrôles headless, deux backends) et `npm run textures:fetch && npm run textures` (textures globales).

- [ ] **Step 4 : Vérifier la CI sur Linux**

Le prototype a tourné sur macOS ; SwiftShader et les options WebGPU restent **à vérifier sur Linux**. Pousser la branche **avec l'accord de l'utilisateur** et lire le résultat du job. Si WebGPU n'y est pas obtenu (`backend webgl2 obtenu au lieu de webgpu`), le signaler à l'utilisateur et proposer de limiter la CI au backend WebGL 2 (variable `BACKENDS`), sans l'appliquer d'office.

- [ ] **Step 5 : Commit**

```bash
git add web/e2e/countries.spec.ts web/package.json .github/workflows/web-ci.yml README.md
git commit -m "e2e : les 197 pays s'allument là où on les attend, sur WebGPU et WebGL 2 ; job CI"
```

---

### Task 13 : Calibration du cadrage avec l'utilisateur

**Files:**
- Create: `web/calibrate.html`, `web/src/calibrate/main.tsx`
- Test: `web/e2e/calibrate.spec.ts`
- Modify: `web/src/camera/config.ts` (valeurs choisies par l'utilisateur)

**Interfaces:**
- Consumes: `GlobeView` (prop `framing`), `frameAltitude`, `FRAMING`, `FOV_Y_DEG`.
- Produces: les valeurs de `FRAMING` (`k`, `margin`, `floor`) retenues par l'utilisateur.

Spec §5 et §10.4 : `k` se calibre « sur une dizaine de pays de référence pour garder le recul actuel ». Voir « Point à trancher » en tête de plan : avec la formule du spec, `k` multiplie la distance au centre de la Terre, si bien que pour un micro-État l'altitude tend vers `k − 1`. La page montre l'effet de chaque réglage en direct ; la décision revient à l'utilisateur.

- [ ] **Step 1 : Écrire le test de fumée**

```ts
// web/e2e/calibrate.spec.ts
import { expect, test } from '@playwright/test';

test('la page de calibration charge le globe et cadre un pays de référence', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 });
  await page.goto('/calibrate.html?webgl');
  await page.getByRole('button', { name: 'FRA' }).click({ timeout: 45_000 });
  await expect(page.getByText(/^France : θ = 4\.866°, altitude = /)).toBeVisible();
  await expect(page.getByText('export const FRAMING: FramingParams = {k: 1, margin: 1.6, floor: 0.0003')).toBeVisible();
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run: `npm run e2e -- e2e/calibrate.spec.ts`
Expected : FAIL — `calibrate.html` absent.

- [ ] **Step 3 : Implémenter**

```html
<!-- web/calibrate.html -->
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Countrizz — calibration du cadrage</title>
    <style>html, body, #root { margin: 0; height: 100dvh; background: #000; overflow: hidden; font-family: sans-serif; }</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/calibrate/main.tsx"></script>
  </body>
</html>
```

```ts
// web/src/calibrate/main.tsx
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FOV_Y_DEG, FRAMING } from '../camera/config';
import { frameAltitude, type FramingParams } from '../camera/framing';
import { loadCountries } from '../data/countries';
import type { CountryRecord } from '../data/types';
import { GlobeView, type GlobeHandle } from '../globe/GlobeView';

/** Pays de référence du spec §8 (cadrage), plus quelques formes et tailles variées. */
const REFERENCES = ['RUS', 'FRA', 'CHL', 'LUX', 'MLT', 'VAT', 'KIR', 'BRA', 'EGY', 'JPN', 'ITA', 'IDN'];

/**
 * Page de calibration (dev seulement) : choisir k, m et le plancher en regardant les pays de référence, en paysage
 * et en portrait (redimensionner la fenêtre ou passer en mode appareil). « Copier » donne la ligne de config.ts.
 */
function Calibrate() {
  const globe = useRef<GlobeHandle>(null);
  const [countries, setCountries] = useState<CountryRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState<CountryRecord | null>(null);
  const [framing, setFraming] = useState<FramingParams>(FRAMING);
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight });
  useEffect(() => { void loadCountries('/').then(setCountries); }, []);
  useEffect(() => { const f = () => setSize({ width: innerWidth, height: innerHeight }); addEventListener('resize', f); return () => removeEventListener('resize', f); }, []);
  const refs = useMemo(() => REFERENCES.map((c) => countries.find((x) => x.cca3 === c)).filter((c): c is CountryRecord => !!c), [countries]);

  const go = (rec: CountryRecord) => { setCurrent(rec); void globe.current!.flyTo(rec).then(() => globe.current!.showQuestion()); };
  useEffect(() => { if (current) go(current); }, [framing]); // eslint-disable-line react-hooks/exhaustive-deps

  const slider = (key: 'k' | 'margin' | 'floor', min: number, max: number, step: number) => (
    <label style={{ display: 'block' }}>
      {key} = {framing[key]}
      <input type="range" min={min} max={max} step={step} value={framing[key]} onChange={(e) => setFraming({ ...framing, [key]: Number(e.target.value) })} />
    </label>
  );
  const line = `export const FRAMING: FramingParams = ${JSON.stringify(framing).replace(/"(\w+)":/g, '$1: ').replace(/,/g, ', ')};`;
  return (
    <>
      <GlobeView ref={globe} framing={framing} onReady={() => setReady(true)} />
      <div style={{ position: 'absolute', top: 8, left: 8, padding: 8, background: '#16173acc', color: '#f7dc6f', maxWidth: 360, fontSize: 13 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {refs.map((c) => <button key={c.cca3} disabled={!ready} onClick={() => go(c)}>{c.cca3}</button>)}
        </div>
        {slider('k', 0.8, 2, 0.01)}
        {slider('margin', 1, 3, 0.05)}
        {slider('floor', 0.0001, 0.002, 0.0001)}
        {current && <p>{current.name} : θ = {current.cap.radiusDeg.toFixed(3)}°, altitude = {frameAltitude(current.cap.radiusDeg, { ...size, fovYDeg: FOV_Y_DEG }, framing).toFixed(4)} rayon</p>}
        <button onClick={() => void navigator.clipboard.writeText(line)}>Copier la ligne de config.ts</button>
        <code style={{ display: 'block', marginTop: 4, wordBreak: 'break-all' }}>{line}</code>
      </div>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><Calibrate /></StrictMode>);
```

Run: `npm run e2e -- e2e/calibrate.spec.ts` — Expected : PASS (1 test).

- [ ] **Step 4 : Séance de calibration avec l'utilisateur**

`npm run dev`, ouvrir `http://localhost:5173/calibrate.html` ; parcourir les douze pays de référence en paysage, puis en portrait (outils de développement, appareil 390×844). Présenter à l'utilisateur, chiffres à l'appui, le choix entre (a) la formule telle quelle avec `k > 1`, (b) `k ≈ 1` et le contexte réglé par `margin`, (c) une autre forme qu'il proposerait. **Ne rien choisir à sa place.**

- [ ] **Step 5 : Enregistrer les valeurs retenues**

Reporter la ligne copiée depuis la page dans `web/src/camera/config.ts` (`FRAMING`). Si la forme de la formule change, modifier `frameAltitude` **et** ses tests (`framing.test.ts`) avec des valeurs recalculées à la main. Relancer `npm run check && npm run e2e` : le contrôle des 197 pays et la règle des balises dépendent du cadrage.

- [ ] **Step 6 : Commit**

```bash
git add web/calibrate.html web/src/calibrate web/e2e/calibrate.spec.ts web/src/camera/config.ts
git commit -m "camera : page de calibration, cadrage retenu avec l'utilisateur"
```

---

### Fin de phase

- [ ] Revue de toute la branche par un relecteur neuf (superpowers:requesting-code-review), corrections, puis superpowers:finishing-a-development-branch (fusion dans `newcountri` selon le choix de l'utilisateur).
- [ ] Mettre à jour `docs/HANDOFF.md` et la mémoire du projet.

---

## Feuille de route : phase 1B (plan à écrire après la 1A)

| Contenu | Notes déjà réunies le 02/10 |
|---|---|
| Patchs **image** Sentinel-2 cloudless, fondus sur la texture globale dans l'emprise du patch (même projection, même point exact de la sphère) | EOX : WMTS/WMS gratuits sans clé, requête ≤ 4096 px (assemblage permis), limitation de débit sans quota chiffré ; 2018–2025 sous CC BY-NC-SA 4.0, **2016 sous CC BY 4.0** ; attribution exacte : « EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data <année>) », visible dans la carte. **Millésime à faire choisir à l'utilisateur.** |
| Nuages (couche séparée, dérive, ombres, effacement à l'arrivée) | `cloud_combined_8192.tif` (35 870 468 octets), hôte `eoimages.gsfc.nasa.gov` sans page vivante : le mettre en cache tôt. |
| `RenderPipeline` : bloom, TRAA, tone mapping ; niveaux de qualité complets ; résolution dynamique | TRAA exige `antialias: false` (MSAA coupé). `PostProcessing` est l'ancien nom (déprécié r183). |
| Régression visuelle (six plans de référence, deux backends, téléphone et bureau) ; budget du premier chargement | Textures globales mesurées : 3 058 735 octets (« standard »), 5 693 506 (« haute »). |
| Soleil visible et son halo (spec §4.2, « autour : champ d'étoiles, soleil et halo ») | À faire avec le bloom ; position : `sunDirection(pose)` (Task 3). |

**Reporté à la phase 2 (jeu)** : le « léger rapprochement pendant la révélation » (spec §5) — un court vol vers la même direction à altitude × 0,95 par le `CameraDirector`, déclenché par la boucle de jeu au moment de la réponse.
