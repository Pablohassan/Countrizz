# Countrizz — zoom sur le pays et images de près · plan de mise en œuvre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** à l'arrivée, chaque pays occupe entre 10 % et 80 % du petit côté de l'écran ; le vol dure selon l'ampleur du zoom (6 s au plus) ; une chaîne de photos Sentinel-2 emboîtées rend le pays net de près ; la qualité haute s'ouvre aux téléphones en WebGPU, avec repli automatique et encart `?mesure`.

**Architecture:** fonctions pures de cadrage (`web/src/camera/framing.ts`) partagées par la caméra et par le pipeline des photos ; durée du vol multipliée par un facteur de zoom (`flight.ts`) ; chaîne de niveaux fabriquée par `web/scripts/imagery`, décrite dans `imagery.json`, relayée dans le shader par deux emplacements de photo dont le contrôleur choisit la paire à chaque image (`imageLevels.ts`) ; niveau de qualité choisi sur les capacités, rétrogradé en cours de partie d'après la résolution dynamique (`fallback.ts`).

**Tech Stack:** three 0.186.1 (WebGPURenderer, TSL, KTX2Loader/Basis ETC1S), R3F 9.8.1, React 19.3.0, d3-interpolate 3.0.1, Vitest, Playwright (SwiftShader), toktx, sharp, workbox (vite-plugin-pwa), nginx, Docker buildx, kubectl sur rpi1.

**Spec:** `docs/superpowers/specs/2026-10-15-countrizz-zoom-images-de-pres-design.md` (approuvée le 19/10, corrections du même jour comprises : commit `76ff254`).

## Global Constraints

- Dépôt `/Users/rusmirsadikovic/projetsperso/countriz/countrizz`, branche `newcountri` ; jamais dans `main`/`master` ; jamais de push ni de fusion sans accord.
- **GO de l'utilisateur sur la commande exacte** pour toute écriture hors du dépôt : Release GitHub `Pablohassan/Countrizz`, Docker Hub, cluster (`ssh pablo1@192.168.1.171`). Le proxy .60 n'est jamais touché. Le Mac reste en lecture seule hors du dépôt.
- Hooks : pas de `grep`, ni de `sed`/`awk` filtrant par motif (bloqués par `grep_gate.py`) : lire les fichiers en entier ou par plages, filtrer avec `node -e`.
- Bornes : `share: { min: 0.10, max: 0.80 }` du petit côté ; `sizeFactor: { large: 1.1, small: 3 }` ; `areaRange: { maxKm2: 16859281.08, minKm2: 0.51 }`.
- Vols : durée naturelle bornée à [1500 ; 3500] ms, × d(z) = max(1, 1 + 2·log2(z/1,1)/log2(3/1,1)), puis min(6000 ms) ; mouvement réduit : 0.
- Chaîne : `viewFactor: 2.2`, `levelRatio: 4`, `maxExtentDeg: 30`, cadrages de référence 390 × 844 et 1440 × 900 (champ vertical 50°) ; fichiers `data/patches/img/<cca3>-<niveau>-<taille>.ktx2`, niveau 0 = le plus large ; tailles 2048 et 1024 ; ETC1S, `qlevel` 192.
- Relais : opacité du niveau suivant = clamp(2 × ln(E_courant / D) / ln(4), 0, 1), D = 2,2 × `visibleHalfAngle(altitude, viewport)`.
- Qualité : haute = WebGPU et `maxTexture2D >= 8192` ; standard = tout le reste. Résolution dynamique dans les deux.
- Repli (haute seulement) : 3 fenêtres consécutives au plancher et lentes → TRAA coupé ; 6 → qualité standard ; jamais de retour ; format transcodé RGBA → standard d'emblée.
- Cache « pays » du service worker : 700 entrées. Budget : 12 000 000 octets pour l'accueil, dans les deux niveaux de qualité.
- Release : tag `imagerie-2025-niveaux`, archives `patchs-img-niveaux-<taille>.tar` ; image `pablohassan/countrizz-web:1.9`.
- Textes de l'interface en français correct (accents) ; commentaires du code en français, dans le style des fichiers voisins.
- Commits : messages en français, terminés par les deux lignes d'attribution de la session.

## Décisions du plan (écarts de forme avec le spec, à relire)

1. Les réglages d'arrivée du spec §2 (`share`, `sizeFactor`) vont dans `FRAMING.arrival`, avec `areaRange` : absent, l'arrivée suit le cadrage B, ce qui garde valables les tests et la sonde qui posent leur propre cadrage.
2. « Au plancher » (spec §5 bis) se lit « au plancher **et encore lente** » (médiane au-dessus de `slowMs`) : une fenêtre au plancher qui tient la cadence ne déclenche rien.
3. Le contrôle e2e « cadre de la frontière projetée ≤ 80 % » (spec §8) n'est pas écrit : la page n'a pas le contour fin des pays (`borders.json` est simplifié pour la vue d'ensemble) ; la calotte contient le pays et sa part est mesurée à 1 point près.
4. L'encart `?mesure` ne capte pas le doigt (`pointer-events: none`) : c'est ce qui garantit « sans gêner les réponses » au coin bas gauche.

## Review Focus

1. **Cadre du jeu différent des cadrages de référence** : en jeu, le cadrage se fait dans la zone libre (bandes du HUD retirées, `safeViewport`), pas en 390 × 844 plein ; la chaîne est fabriquée sur 390 × 844 et 1440 × 900. Attendu : à l'arrivée en jeu, le niveau le plus fin est entièrement posé (en courant, ou en suivant d'opacité 1). Test : Task 10, e2e « en jeu (zone libre), le Vatican arrive sur son niveau le plus fin ».
2. **Pays qui touche l'antiméridien ou un pôle dans un niveau fin** (Fidji, Kiribati, Tuvalu) : la photo d'un niveau serré doit rester centrée et non retournée. Test : Task 5, contrôle de données « chaque niveau est centré sur la calotte et lit `KTXorientation rd` », sur tous les pays.
3. **Relais pendant un vol rapide** : à 60 i/s, l'altitude franchit plusieurs niveaux en peu d'images ; aucune image ne doit montrer un trou (aucun des deux emplacements posé alors qu'un niveau couvrant est chargé). Test : Task 7, unitaire « balayage d'altitude : à chaque pas, un niveau chargé couvre la vue ».
4. **Recréation du renderer (perte du GPU) après un repli** : le repli tient jusqu'à la fin de la visite ; un renderer recréé ne doit pas remonter en qualité haute. Test : Task 8, unitaire `effectiveTier` et e2e de repli qui simule la perte du GPU après le repli.
5. **Côtes des petits pays aux niveaux fins** (Monaco, Singapour, Malte) : le masque mer/terre vient de Natural Earth ; à ≈ 37 m/px, il peut ne pas coller à la photo (reflet du soleil sur la terre). Pas de test automatique fiable : les captures de la Task 11 montrent Monaco à l'arrivée et l'utilisateur tranche ; la passation consigne ce qu'il a vu.

---

### Task 1 : cadrage à l'arrivée (fonctions pures)

**Files:**
- Modify: `web/src/camera/framing.ts`
- Modify: `web/src/camera/config.ts`
- Modify: `web/src/camera/framing.test.ts`
- Create: `web/src/camera/arrival.test.ts`

**Interfaces:**
- Consumes: `frameAltitude`, `limitingHalfAngle`, `Viewport`, `FramingParams` (existants).
- Produces :
  - `interface ArrivalParams { share: { min: number; max: number }; sizeFactor: { large: number; small: number }; areaRange: { maxKm2: number; minKm2: number } }`
  - `FramingParams.arrival?: ArrivalParams` (absent : cadrage B inchangé)
  - `interface ArrivalTarget { areaKm2: number; cap: { radiusDeg: number } }`
  - `capShare(capRadiusDeg: number, altitude: number, v: Viewport): number`
  - `sizeFactor(areaKm2: number, a: ArrivalParams): number`
  - `arrivalShare(t: ArrivalTarget, v: Viewport, p: FramingParams): number`
  - `arrivalAltitude(t: ArrivalTarget, v: Viewport, p: FramingParams): number`
  - `arrivalZoom(t: ArrivalTarget, v: Viewport, p: FramingParams): number`
  - `visibleHalfAngle(altitude: number, v: Viewport): number` (radians)
  - `inArrivalView(offsetDeg: number, t: ArrivalTarget, v: Viewport, p: FramingParams): boolean` (signature changée : la cible au lieu du rayon)
  - `FRAMING.arrival = { share: { min: 0.1, max: 0.8 }, sizeFactor: { large: 1.1, small: 3 }, areaRange: { maxKm2: 16859281.08, minKm2: 0.51 } }`

- [ ] **Step 1 : écrire les tests qui échouent.** Créer `web/src/camera/arrival.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { FRAMING } from './config';
import { arrivalAltitude, arrivalShare, arrivalZoom, capShare, frameAltitude, limitingHalfAngle, sizeFactor, visibleHalfAngle } from './framing';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const by = (cca3: string) => countries.find((c) => c.cca3 === cca3)!;
const phone = { width: 390, height: 844, fovYDeg: 50 };
const desk = { width: 1440, height: 900, fovYDeg: 50 };
const a = FRAMING.arrival!;

describe('cadrage à l’arrivée (spec zoom §2)', () => {
  it('les superficies extrêmes de FRAMING sont celles de countries.json', () => {
    const areas = countries.map((c) => c.areaKm2);
    expect(a.areaRange).toEqual({ maxKm2: Math.max(...areas), minKm2: Math.min(...areas) });
  });

  it('facteur de taille : 1,1 pour la Russie, 3 pour le Vatican, décroissant avec la superficie', () => {
    expect(sizeFactor(by('RUS').areaKm2, a)).toBeCloseTo(1.1, 12);
    expect(sizeFactor(by('VAT').areaKm2, a)).toBeCloseTo(3, 12);
    expect(sizeFactor(by('FRA').areaKm2, a)).toBeCloseTo(1.46, 2);
    expect(sizeFactor(1e3, a)).toBeGreaterThan(sizeFactor(1e4, a));
  });

  it('table du spec sur téléphone 390 × 844 (part B → part visée)', () => {
    const rows: [string, number, number][] = [['RUS', 1.13, 0.8], ['USA', 0.742, 0.8], ['FRA', 0.329, 0.48], ['BEL', 0.144, 0.258], ['LUX', 0.042, 0.1], ['VAT', 0.001, 0.1]];
    for (const [cca3, b, target] of rows) {
      const r = by(cca3);
      expect(capShare(r.cap.radiusDeg, frameAltitude(r.cap.radiusDeg, phone, FRAMING), phone), `${cca3} part B`).toBeCloseTo(b, 2);
      expect(arrivalShare(r, phone, FRAMING), `${cca3} part visée`).toBeCloseTo(target, 2);
    }
    expect(arrivalZoom(by('VAT'), phone, FRAMING)).toBeGreaterThan(100);
  });

  for (const [name, v] of [['téléphone', phone], ['bureau', desk]] as const) {
    it(`${name} : les 197 pays entre 10 % et 80 %, et l’altitude rend exactement la part visée`, () => {
      for (const c of countries) {
        const s = arrivalShare(c, v, FRAMING);
        expect(s, c.cca3).toBeGreaterThanOrEqual(0.1);
        expect(s, c.cca3).toBeLessThanOrEqual(0.8);
        const alt = arrivalAltitude(c, v, FRAMING);
        expect(alt, `${c.cca3} au plancher`).toBeGreaterThan(FRAMING.floor);
        expect(capShare(c.cap.radiusDeg, alt, v), c.cca3).toBeCloseTo(s, 6);
      }
    });
  }

  it('la vue d’ensemble ne borne plus l’arrivée : Russie (3,18) et Indonésie (2,27) au-dessus de 2,2 sur téléphone', () => {
    expect(arrivalAltitude(by('RUS'), phone, FRAMING)).toBeCloseTo(3.18, 2);
    expect(arrivalAltitude(by('IDN'), phone, FRAMING)).toBeCloseTo(2.27, 2);
  });

  it('sans `arrival`, le cadrage B est inchangé', () => {
    const b = { ...FRAMING, arrival: undefined };
    const r = by('FRA');
    expect(arrivalAltitude(r, phone, b)).toBe(frameAltitude(r.cap.radiusDeg, phone, b));
    expect(arrivalZoom(r, phone, b)).toBe(1);
  });
});

describe('demi-angle au sol vu sur le petit côté', () => {
  it('basse altitude : altitude × tan α ; loin : borné par l’horizon', () => {
    const alpha = limitingHalfAngle(phone);
    expect(visibleHalfAngle(1e-4, phone) / (1e-4 * Math.tan(alpha))).toBeCloseTo(1, 3);
    expect(visibleHalfAngle(50, phone)).toBeCloseTo(Math.acos(1 / 51), 12);
  });
  it('à l’arrivée, ≈ r / part visée (à 5 % près hors calottes au-delà de 10°)', () => {
    for (const c of countries) {
      if (c.cap.radiusDeg > 10) continue;
      const g = visibleHalfAngle(arrivalAltitude(c, phone, FRAMING), phone) * (180 / Math.PI);
      expect(g / (c.cap.radiusDeg / arrivalShare(c, phone, FRAMING)), c.cca3).toBeCloseTo(1, 1);
    }
  });
});
```

Dans `web/src/camera/framing.test.ts`, remplacer le bloc `describe('inArrivalView', …)` par la nouvelle signature (mêmes cas, la cible au lieu du rayon) :

```ts
describe('inArrivalView', () => {
  const P = { k: 1, margin: 3, floor: 0.0003, overview: { landscape: 1.4, portrait: 2.2 }, minContextDeg: 3 };
  const cap = (radiusDeg: number) => ({ areaKm2: 1000, cap: { radiusDeg } });
```

puis, dans ses `it`, chaque `inArrivalView(x, r, v, P)` devient `inArrivalView(x, cap(r), v, P)` (lignes 49 à 60 du fichier actuel ; valeurs inchangées).

- [ ] **Step 2 : les lancer, les voir échouer.** Run : `cd web && npx vitest run --project unit src/camera/arrival.test.ts src/camera/framing.test.ts`. Expected : FAIL, `arrivalShare` (et les autres) non exportés, et erreur de type sur `inArrivalView`.

- [ ] **Step 3 : implémenter.** Dans `web/src/camera/framing.ts`, ajouter à `FramingParams` :

```ts
  /** Spec zoom §2 (15/10) : part d'écran visée à l'arrivée ; absent, l'arrivée suit le cadrage B ci-dessus. */
  arrival?: ArrivalParams;
```

et, après `frameAltitude` :

```ts
/** Spec zoom §2 : le pays occupe entre `share.min` et `share.max` du petit côté ; zoom par rapport au cadrage B selon la superficie. */
export interface ArrivalParams {
  share: { min: number; max: number };
  /** Facteur appliqué à la part B : `large` pour la plus grande superficie, `small` pour la plus petite, linéaire en log. */
  sizeFactor: { large: number; small: number };
  /** Superficies extrêmes des 197 pays (km²), recomptées par arrival.test.ts sur countries.json. */
  areaRange: { maxKm2: number; minKm2: number };
}

/** Ce que le cadrage à l'arrivée lit d'un pays. */
export interface ArrivalTarget { areaKm2: number; cap: { radiusDeg: number } }

/**
 * Part du petit côté qu'occupe la calotte de rayon `capRadiusDeg` vue d'aplomb à `altitude` : son bord est vu sous
 * β = atan2(sin r, 1 + altitude − cos r), la part vaut tan β / tan α (α : demi-champ limitant).
 */
export function capShare(capRadiusDeg: number, altitude: number, v: Viewport): number {
  const r = capRadiusDeg * RAD;
  return Math.tan(Math.atan2(Math.sin(r), 1 + altitude - Math.cos(r))) / Math.tan(limitingHalfAngle(v));
}

/** f = large + (small − large) · (ln A_max − ln A) / (ln A_max − ln A_min), A borné à la plage. */
export function sizeFactor(areaKm2: number, a: ArrivalParams): number {
  const { maxKm2, minKm2 } = a.areaRange;
  const area = Math.min(maxKm2, Math.max(minKm2, areaKm2));
  const t = (Math.log(maxKm2) - Math.log(area)) / (Math.log(maxKm2) - Math.log(minKm2));
  return a.sizeFactor.large + (a.sizeFactor.small - a.sizeFactor.large) * t;
}

/** Part visée : part B × f, bornée à [share.min ; share.max] ; sans `arrival`, la part B. */
export function arrivalShare(t: ArrivalTarget, v: Viewport, p: FramingParams): number {
  const b = capShare(t.cap.radiusDeg, frameAltitude(t.cap.radiusDeg, v, p), v);
  if (!p.arrival) return b;
  const { share } = p.arrival;
  return Math.min(share.max, Math.max(share.min, b * sizeFactor(t.areaKm2, p.arrival)));
}

/**
 * Altitude qui rend la part visée : tan β = part × tan α, d'où 1 + altitude = cos r + sin r / tan β. Bornée en bas par
 * `floor` seulement : la vue d'ensemble ne la borne plus (Russie et Indonésie au-dessus sur téléphone, spec zoom §2).
 */
export function arrivalAltitude(t: ArrivalTarget, v: Viewport, p: FramingParams): number {
  if (!p.arrival) return frameAltitude(t.cap.radiusDeg, v, p);
  const r = t.cap.radiusDeg * RAD;
  const tanB = arrivalShare(t, v, p) * Math.tan(limitingHalfAngle(v));
  return Math.max(p.floor, Math.cos(r) + Math.sin(r) / tanB - 1);
}

/** Zoom par rapport au cadrage B (part visée / part B) : la durée du vol en dépend (spec zoom §3). */
export function arrivalZoom(t: ArrivalTarget, v: Viewport, p: FramingParams): number {
  if (!p.arrival) return 1;
  return arrivalShare(t, v, p) / capShare(t.cap.radiusDeg, frameAltitude(t.cap.radiusDeg, v, p), v);
}

/**
 * Demi-angle au sol (rad, au centre de la Terre) vu sur le petit côté à `altitude` : le rayon du bord du champ touche la
 * sphère en asin(d · sin α) − α (d = 1 + altitude) ; s'il la manque, l'horizon, acos(1 / d).
 */
export function visibleHalfAngle(altitude: number, v: Viewport): number {
  const d = 1 + altitude, alpha = limitingHalfAngle(v), s = d * Math.sin(alpha);
  return s >= 1 ? Math.acos(1 / d) : Math.asin(s) - alpha;
}
```

et remplacer `inArrivalView` (même corps, l'altitude d'arrivée) :

```ts
export function inArrivalView(offsetDeg: number, target: ArrivalTarget, v: Viewport, p: FramingParams): boolean {
  const d = 1 + arrivalAltitude(target, v, p);
  const t = offsetDeg * RAD;
  if (Math.cos(t) <= 1 / d) return false;
  return Math.atan2(Math.sin(t), d - Math.cos(t)) <= limitingHalfAngle(v);
}
```

(son commentaire : « à l'altitude de `arrivalAltitude` »). Dans `web/src/camera/config.ts`, `FRAMING` devient :

```ts
/**
 * Cadrage retenu par l'utilisateur le 02/10/2026 (réglage « B » de la planche de calibration) : le pays occupe 1/3 du
 * demi-champ (m = 3), et l'on montre toujours au moins une calotte de 3° autour de lui (θ_min) pour le situer ;
 * k = 1. Depuis le 15/10 (spec zoom §2), B n'est plus que la référence du zoom : à l'arrivée, le pays occupe entre 10 % et
 * 80 % du petit côté, B × 1,1 pour le plus grand pays à B × 3 pour le plus petit. Réglable sur calibrate.html.
 */
export const FRAMING: FramingParams = {
  k: 1, margin: 3, floor: 0.0003, overview: { landscape: 1.4, portrait: 2.2 }, minContextDeg: 3,
  arrival: { share: { min: 0.1, max: 0.8 }, sizeFactor: { large: 1.1, small: 3 }, areaRange: { maxKm2: 16859281.08, minKm2: 0.51 } },
};
```

Dans `web/scripts/geodata/__tests__/data/capitalPoints.test.ts:38`, `inArrivalView(offsetDeg, c.cap.radiusDeg, v, FRAMING)` devient `inArrivalView(offsetDeg, c, v, FRAMING)`.

- [ ] **Step 4 : les relancer.** Run : `cd web && npx vitest run --project unit src/camera/ && npx vitest run --project data scripts/geodata/__tests__/data/capitalPoints.test.ts`. Expected : PASS partout (le test des capitales vérifie que chaque capitale reste dans le cadre au cadrage serré ; un échec ici est une découverte à signaler, pas un test à assouplir).

- [ ] **Step 5 : `tsc`.** Run : `cd web && npx tsc --noEmit`. Expected : les seules erreurs restantes viennent des appelants de `FrameTarget` sans `areaKm2` (Task 2) ; aucune dans `framing.ts`/`config.ts`. Noter la liste.

- [ ] **Step 6 : commit.**

```bash
git add web/src/camera/framing.ts web/src/camera/config.ts web/src/camera/framing.test.ts web/src/camera/arrival.test.ts web/scripts/geodata/__tests__/data/capitalPoints.test.ts
git commit -m "cadrage : le pays entre 10 % et 80 % du petit côté à l'arrivée (spec zoom §2)"
```

---

### Task 2 : vols et directeur

**Files:**
- Modify: `web/src/camera/flight.ts`, `web/src/camera/config.ts`, `web/src/camera/director.ts`
- Test: `web/src/camera/flight.test.ts`, `web/src/camera/director.test.ts`

**Interfaces:**
- Consumes (Task 1) : `arrivalAltitude`, `arrivalZoom`, `ArrivalTarget`.
- Produces :
  - `FlightParams.zoom?: number`, `FlightParams.zoomRef?: { from: number; to: number }`, `FlightParams.capMs?: number`
  - `zoomDurationFactor(z: number, ref: { from: number; to: number }): number`
  - `FrameTarget = { areaKm2: number; cap: { center: LngLat; radiusDeg: number } }`
  - `FLIGHT = { rho: Math.SQRT2, timeScale: 1, minMs: 1500, maxMs: 3500, zoomRef: { from: 1.1, to: 3 }, capMs: 6000 }`

- [ ] **Step 1 : tests qui échouent.** Dans `web/src/camera/flight.test.ts`, ajouter :

```ts
import { zoomDurationFactor } from './flight';

describe('durée selon le zoom (spec zoom §3)', () => {
  const ref = { from: 1.1, to: 3 };
  it('1 à ×1,1 et en deçà, 3 à ×3, linéaire en log2, sans plafond propre', () => {
    expect(zoomDurationFactor(1.1, ref)).toBeCloseTo(1, 12);
    expect(zoomDurationFactor(0.71, ref)).toBe(1);
    expect(zoomDurationFactor(3, ref)).toBeCloseTo(3, 12);
    expect(zoomDurationFactor(Math.sqrt(1.1 * 3), ref)).toBeCloseTo(2, 12);
    expect(zoomDurationFactor(184, ref)).toBeGreaterThan(3);
  });
  it('un zoom ×3 met trois fois le temps d’un zoom ×1,1 ; plafond à 6000 ms ; mouvement réduit : 0', () => {
    const a = pose([6.1, 49.6], 0.02), b = pose([4.5, 50.6], 0.06);
    const p = { ...params, zoomRef: ref, capMs: 6000 };
    const base = planFlight(a, b, { ...p, zoom: 1.1 }).durationMs;
    expect(base).toBe(planFlight(a, b, params).durationMs);          // ×1,1 : la durée d'aujourd'hui
    expect(planFlight(a, b, { ...p, zoom: 3 }).durationMs).toBeCloseTo(Math.min(6000, 3 * base), 6);
    expect(planFlight(a, b, { ...p, zoom: 184 }).durationMs).toBe(6000);
    expect(planFlight(a, b, { ...p, zoom: Infinity }).durationMs).toBe(6000);
    expect(planFlight(a, b, { ...p, zoom: 184, reducedMotion: true }).durationMs).toBe(0);
  });
});
```

(Ce vol court est celui du test existant « durée bornée » : sa durée naturelle est au plancher ou près, donc `3 × base` reste sous 6000 ms et le rapport 3 se lit tel quel.)

Dans `web/src/camera/director.test.ts` : `japan` et `france` reçoivent `areaKm2` (`377975` et `551695`) ; ajouter :

```ts
import { FLIGHT, FRAMING } from './config';
import { arrivalAltitude } from './framing';

describe('arrivée au cadrage serré (spec zoom §2-3)', () => {
  const phone = { width: 390, height: 844, fovYDeg: 50 };
  const vatican = { areaKm2: 0.51, cap: { center: [12.4528, 41.9037] as [number, number], radiusDeg: 0.0049 } };
  it('flyTo arrive à arrivalAltitude ; depuis la vue d’ensemble, le Vatican vole 6000 ms', () => {
    const d = new CameraDirector({ ...opts, viewport: phone, framing: FRAMING, flight: FLIGHT });
    d.update(0);
    const t = d.flyTo(vatican);
    expect(t.durationMs).toBe(6000);
    expect(d.update(6000).altitude).toBeCloseTo(arrivalAltitude(vatican, phone, FRAMING), 9);
  });
  it('le recadrage (changement de viewport) ne prend pas le facteur de zoom', () => {
    const d = new CameraDirector({ ...opts, viewport: phone, framing: FRAMING, flight: FLIGHT });
    d.update(0);
    void d.flyTo(vatican);
    d.update(6000);
    d.setViewport({ width: 844, height: 390, fovYDeg: 50 });
    const start = d.update(6000).altitude;
    expect(d.update(6600).altitude).not.toBe(start);   // le vol de recadrage dure au plus 600 ms
    expect(d.update(6600).altitude).toBeCloseTo(arrivalAltitude(vatican, { width: 844, height: 390, fovYDeg: 50 }, FRAMING), 9);
  });
});
```

- [ ] **Step 2 : les voir échouer.** Run : `cd web && npx vitest run --project unit src/camera/flight.test.ts src/camera/director.test.ts`. Expected : FAIL (`zoomDurationFactor` absent ; `durationMs` du Vatican ≠ 6000).

- [ ] **Step 3 : implémenter.** `web/src/camera/flight.ts` : ajouter à `FlightParams`

```ts
  /** Zoom du vol (part d'écran visée / part B, spec zoom §3) ; absent : facteur 1. */
  zoom?: number;
  /** Zooms de référence : facteur 1 à `from`, 3 à `to`. */
  zoomRef?: { from: number; to: number };
  /** Plafond de la durée, facteur de zoom compris (ms). */
  capMs?: number;
```

et, avant `planFlight` :

```ts
/** Spec zoom §3 : d(z) = max(1, 1 + 2 · log2(z / from) / log2(to / from)) — 1 à ×1,1, 3 à ×3 (« zoom 300 % = 3 fois le temps »). */
export function zoomDurationFactor(z: number, ref: { from: number; to: number }): number {
  return Math.max(1, 1 + (2 * Math.log2(z / ref.from)) / Math.log2(ref.to / ref.from));
}
```

Dans `planFlight`, la ligne `const durationMs = …` devient :

```ts
  const natural = Math.min(p.maxMs, Math.max(p.minMs, zoom.duration * p.timeScale));
  const factor = p.zoom !== undefined && p.zoomRef ? zoomDurationFactor(p.zoom, p.zoomRef) : 1;
  const durationMs = Math.min(p.capMs ?? Infinity, natural * factor);
```

`web/src/camera/config.ts` :

```ts
/**
 * Vol : ρ de d3, durée naturelle de van Wijk bornée à [1500 ; 3500] ms (spec §5), multipliée par le facteur de zoom (1 à
 * ×1,1, 3 à ×3, spec zoom §3), plafonnée à 6 s (option A de l'utilisateur, 15/10).
 */
export const FLIGHT: Omit<FlightParams, 'alphaRad' | 'reducedMotion' | 'zoom'> = {
  rho: Math.SQRT2, timeScale: 1, minMs: 1500, maxMs: 3500, zoomRef: { from: 1.1, to: 3 }, capMs: 6000,
};
```

`web/src/camera/director.ts` : `import { arrivalAltitude, arrivalZoom, limitingHalfAngle, overviewAltitude, type FramingParams, type Viewport } from './framing';` ; `FrameTarget` devient `{ areaKm2: number; cap: { center: LngLat; radiusDeg: number } }` ; `DirectorOptions.flight` devient `Omit<FlightParams, 'alphaRad' | 'reducedMotion' | 'zoom'>` ; `flyTo` :

```ts
  flyTo(target: FrameTarget): FlightTicket {
    this.target = target;
    this.atHome = false;
    const dir = toVec(target.cap.center);
    const altitude = arrivalAltitude(target, this.viewport, this.framing);
    return this.flyToPose({ dir, altitude, up: northUp(dir) }, 0, this.axisTarget, arrivalZoom(target, this.viewport, this.framing));
  }
```

`flyToPose(to: Pose, toPitch = 0, toAxis = this.axisTarget, zoom?: number)` passe `zoom` à `planFlight` (`{ ...this.opts.flight, zoom, alphaRad: …, reducedMotion: … }`) ; dans `reframe`, `frameAltitude(this.target.cap.radiusDeg, …)` devient `arrivalAltitude(this.target, this.viewport, this.framing)` (pas de `zoom` : facteur 1). Retirer l'import devenu inutile de `frameAltitude` s'il l'est.

- [ ] **Step 4 : relancer, puis `tsc`.** Run : `cd web && npx vitest run --project unit src/camera/ && npx tsc --noEmit`. Expected : PASS ; `tsc` sans erreur. S'il en reste (appelants de `flyTo` qui passent un objet sans `areaKm2`, par exemple dans `src/calibrate` ou `src/probe`), leur donner `areaKm2` du `CountryRecord` qu'ils ont déjà.

- [ ] **Step 5 : commit.**

```bash
git add web/src/camera/
git commit -m "vols : durée selon le zoom, plafond à 6 s ; arrivée au cadrage serré (spec zoom §3)"
```

---

### Task 3 : balise, calibration, sonde

**Files:**
- Modify: `web/src/globe/beacon.ts`, `web/src/globe/beacon.test.ts`, `web/src/calibrate/main.tsx`, `web/e2e/calibrate.spec.ts` (si son texte attendu change)

**Interfaces:**
- Consumes (Task 1) : `arrivalAltitude`, `arrivalShare`, `ArrivalParams`.
- Produces : `needsBeacon(rec: { areaKm2: number; cap: { radiusDeg: number } }, v: Viewport, framing: FramingParams): boolean` (même signature, altitude d'arrivée).

- [ ] **Step 1 : test qui échoue.** Dans `web/src/globe/beacon.test.ts`, ajouter :

```ts
import { readFileSync } from 'node:fs';
import { FRAMING } from '../camera/config';
import type { CountryRecord } from '../data/types';

describe('balise au cadrage serré (spec zoom §2, listes du 19/10)', () => {
  const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
  const list = (v: { width: number; height: number; fovYDeg: number }) => countries.filter((c) => needsBeacon(c, v, FRAMING)).map((c) => c.cca3).sort();
  it('téléphone 390 × 844 : 19 pays (archipels et quelques petits États), sans le Vatican', () => {
    expect(list({ width: 390, height: 844, fovYDeg: 50 })).toEqual(['ATG', 'BHR', 'COM', 'FSM', 'GRD', 'KIR', 'KNA', 'LIE', 'MCO', 'MDV', 'MHL', 'MLT', 'PLW', 'SGP', 'STP', 'SYC', 'TON', 'TUV', 'VCT']);
  });
  it('bureau 1440 × 900 : 5 archipels', () => {
    expect(list({ width: 1440, height: 900, fovYDeg: 50 })).toEqual(['FSM', 'MDV', 'MHL', 'SYC', 'TUV']);
  });
});
```

- [ ] **Step 2 : le voir échouer.** Run : `cd web && npx vitest run --project unit src/globe/beacon.test.ts`. Expected : FAIL (aujourd'hui 38 pays sur téléphone, dont VAT, AND, LUX, SMR).

- [ ] **Step 3 : implémenter.** `web/src/globe/beacon.ts` : `import { arrivalAltitude, type FramingParams, type Viewport } from '../camera/framing';` et, dans `needsBeacon`, `const altitude = arrivalAltitude(rec, v, framing);`. Commentaire de `needsBeacon` : « à l'altitude d'arrivée (spec zoom §2 : 19 pays sur téléphone, 5 au bureau, listes figées dans beacon.test.ts) ».

`web/src/calibrate/main.tsx` :
- `framingFromUrl` lit aussi `smin`, `smax`, `fl`, `fs` :

```ts
  const a = FRAMING.arrival!;
  return {
    ...FRAMING, k: read('k', FRAMING.k), margin: read('margin', FRAMING.margin), floor: read('floor', FRAMING.floor), minContextDeg: read('ctx', FRAMING.minContextDeg ?? 0),
    arrival: { ...a, share: { min: read('smin', a.share.min), max: read('smax', a.share.max) }, sizeFactor: { large: read('fl', a.sizeFactor.large), small: read('fs', a.sizeFactor.small) } },
  };
```

- quatre curseurs de plus, sous ceux d'aujourd'hui :

```tsx
  const arrivalSlider = (label: string, value: number, min: number, max: number, step: number, set: (x: number) => FramingParams) => (
    <label style={{ display: 'block' }}>
      {label} = {value}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => setFraming(set(Number(e.target.value)))} />
    </label>
  );
  const ar = framing.arrival!;
```

```tsx
        {arrivalSlider('part min', ar.share.min, 0.02, 0.4, 0.01, (x) => ({ ...framing, arrival: { ...ar, share: { ...ar.share, min: x } } }))}
        {arrivalSlider('part max', ar.share.max, 0.4, 1, 0.01, (x) => ({ ...framing, arrival: { ...ar, share: { ...ar.share, max: x } } }))}
        {arrivalSlider('zoom grand pays', ar.sizeFactor.large, 0.5, 3, 0.05, (x) => ({ ...framing, arrival: { ...ar, sizeFactor: { ...ar.sizeFactor, large: x } } }))}
        {arrivalSlider('zoom petit pays', ar.sizeFactor.small, 1, 6, 0.05, (x) => ({ ...framing, arrival: { ...ar, sizeFactor: { ...ar.sizeFactor, small: x } } }))}
```

- la ligne d'information donne l'altitude et la part d'arrivée :

```tsx
        {current && <p>{current.name.fr} : θ = {current.cap.radiusDeg.toFixed(3)}°, altitude = {arrivalAltitude(current, { ...size, fovYDeg: FOV_Y_DEG }, framing).toFixed(4)} rayon, part = {(100 * arrivalShare(current, { ...size, fovYDeg: FOV_Y_DEG }, framing)).toFixed(1)} %</p>}
```

(import `arrivalAltitude, arrivalShare` au lieu de `frameAltitude`).

- [ ] **Step 4 : relancer.** Run : `cd web && npx vitest run --project unit src/globe/beacon.test.ts && npx tsc --noEmit && npx playwright test e2e/calibrate.spec.ts`. Expected : PASS ; si `calibrate.spec.ts` cherchait un texte qui a changé, ajuster l'attente au nouveau texte (sans retirer le contrôle) et le ledger le note.

- [ ] **Step 5 : commit.**

```bash
git add web/src/globe/beacon.ts web/src/globe/beacon.test.ts web/src/calibrate/main.tsx web/e2e/calibrate.spec.ts
git commit -m "balise et calibration au cadrage serré : 19 pays gardent la balise sur téléphone (spec zoom §2)"
```

---

### Task 4 : modèle de données des niveaux, vérifications, calques de l'image

**Files:**
- Modify: `web/src/data/imagery.ts`, `web/scripts/imagery/config.ts`, `web/scripts/imagery/lib/patchImage.ts`, `web/scripts/imagery/lib/verify.ts`, `web/scripts/imagery/fetch-patches.ts`
- Modify: `deploy/scripts/patchs.mjs`, `deploy/scripts/patchs.test.mjs`, `deploy/scripts/stage-image.mjs`, `deploy/web/Dockerfile`
- Test: `web/scripts/imagery/__tests__/unit/patchImage.test.ts`, `web/scripts/imagery/__tests__/unit/verify.test.ts`

**Interfaces:**
- Consumes (Task 1) : `arrivalAltitude`, `visibleHalfAngle`, `ArrivalTarget`, `ArrivalParams`, `Viewport`, `FramingParams`.
- Produces :
  - `interface ImageLevel { extentRad: number; files: Record<string, ImageFile> }`
  - `interface ImagePatchMeta { center: LngLat; levels: ImageLevel[] }` (du plus large au plus fin)
  - `ImageryIndex` : `framing: { margin: number; minContextDeg: number; arrival: ArrivalParams }`, `viewFactor`, `levelRatio`, `maxExtentDeg`, `viewports: Viewport[]`, `sizes`, `countries`
  - `imagePatchName(cca3: string, level: number, size: number): string` → `fra-0-2048.ktx2`
  - `imagePatchUrl(baseUrl: string, cca3: string, level: number, size: number): string`
  - `imageLevels(rec: ArrivalTarget, framing: FramingParams, o: { viewFactor: number; levelRatio: number; maxExtentDeg: number; viewports: readonly Viewport[] }): number[]` (rad, du plus large au plus fin)
  - `IMAGE_PATCH = { sizes: [2048, 1024], viewFactor: 2.2, levelRatio: 4, maxExtentDeg: 30, qlevel: 192, viewports: [390 × 844, 1440 × 900] }`
  - `checkPatches(index, size, dir)` : même retour, sur tous les niveaux
  - deploy : `nomPatch(cca3, niveau, taille)`, `verifierPatchs(dossier, index)` sur les niveaux ; calques `img-1024-0`, `img-2048-0`, `img-2048-1`

- [ ] **Step 1 : tests qui échouent.** Dans `web/scripts/imagery/__tests__/unit/patchImage.test.ts`, remplacer les tests de `imageExtentRad` (lignes 7 à 16 actuelles) par :

```ts
import { readFileSync } from 'node:fs';
import { FRAMING } from '../../../../src/camera/config';
import { arrivalAltitude, visibleHalfAngle } from '../../../../src/camera/framing';
import type { CountryRecord } from '../../../../src/data/types';
import { IMAGE_PATCH } from '../../config';
import { imageLevels } from '../../lib/patchImage';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const by = (cca3: string) => countries.find((c) => c.cca3 === cca3)!;

describe('chaîne de niveaux d’un pays (spec zoom §4.1)', () => {
  it('rapport 4 entre niveaux, du plus large au plus fin, rien au-delà de 30°', () => {
    for (const c of countries) {
      const e = imageLevels(c, FRAMING, IMAGE_PATCH);
      expect(e.length, c.cca3).toBeGreaterThanOrEqual(1);
      for (let i = 1; i < e.length; i++) expect(e[i - 1]! / e[i]!, c.cca3).toBeCloseTo(4, 9);
      expect(e[0]!, c.cca3).toBeLessThanOrEqual(30 * RAD + 1e-12);
      // minimale : un niveau de plus (× 4) dépasserait 30°
      expect(e[0]! * 4, c.cca3).toBeGreaterThan(30 * RAD);
    }
  });
  it('le plus fin = 2,2 × la vue d’arrivée, la plus petite des deux références, plafonnée à 30°', () => {
    for (const c of countries) {
      const want = Math.min(30 * RAD, ...IMAGE_PATCH.viewports.map((v) => 2.2 * visibleHalfAngle(arrivalAltitude(c, v, FRAMING), v)));
      expect(imageLevels(c, FRAMING, IMAGE_PATCH).at(-1)!, c.cca3).toBeCloseTo(want, 12);
    }
  });
  it('la Russie a un niveau (30°), le Vatican plusieurs, plus fins que 15 m par texel en 2048', () => {
    expect(imageLevels(by('RUS'), FRAMING, IMAGE_PATCH)).toEqual([30 * RAD]);
    const v = imageLevels(by('VAT'), FRAMING, IMAGE_PATCH);
    expect(v.length).toBeGreaterThan(1);
    expect((2 * v.at(-1)! * 6_371_000) / 2048).toBeLessThan(15);
    const total = countries.reduce((s, c) => s + imageLevels(c, FRAMING, IMAGE_PATCH).length, 0);
    console.log(`chaîne : ${total} niveaux pour ${countries.length} pays`);
  });
});
```

(Les imports rejoignent ceux d'en tête du fichier, sans `imageExtentRad` ; `RAD` existe déjà dans ce fichier, sinon `const RAD = Math.PI / 180;`.) Dans `web/scripts/imagery/__tests__/unit/verify.test.ts`, la fixture passe aux niveaux :

```ts
  const a = Buffer.from('patch fra'), b = Buffer.from('patch ita'), c = Buffer.from('patch ita fin');
  const index = { countries: {
    FRA: { levels: [{ files: { '1024': { bytes: a.length, sha256: sha256(a) } } }] },
    ITA: { levels: [{ files: { '1024': { bytes: b.length, sha256: sha256(b) } } }, { files: { '1024': { bytes: c.length, sha256: sha256(c) } } }] },
  } } as unknown as ImageryIndex;
  return { dir, index, a, b, c };
```

et les attentes : fichiers `fra-0-1024.ktx2`, `ita-0-1024.ktx2`, `ita-1-1024.ktx2` ; `total: 3` ; le test « absent / altéré » écrit `fra-0-1024.ktx2` altéré et ne crée pas `ita-1-1024.ktx2` → `missing: ['ita-0-1024.ktx2', 'ita-1-1024.ktx2']`, `corrupt: ['fra-0-1024.ktx2']` ; le test « taille absente » attend `/2048 pour FRA niveau 0/`.

Dans `deploy/scripts/patchs.test.mjs`, `jeu()` écrit deux niveaux par pays :

```js
  for (const cca3 of ['FRA', 'JPN']) {
    index.countries[cca3] = { levels: [{ files: {} }, { files: {} }] };
    for (const [niveau, lvl] of index.countries[cca3].levels.entries()) for (const taille of index.sizes) {
      const octets = randomBytes(taille === 1024 ? 100 : 300);
      writeFileSync(join(dossier, nomPatch(cca3, niveau, taille)), octets);
      lvl.files[String(taille)] = { bytes: octets.length, sha256: createHash('sha256').update(octets).digest('hex') };
    }
  }
```

attentes : `attendus: 8` ; le test des défauts altère `fra-0-2048.ktx2`, retire `jpn-1-1024.ktx2`, ajoute `zzz-0-2048.ktx2` et `fra-2048.ktx2` (ancien nom) → erreurs `['fra-0-2048.ktx2 : 301 octets au lieu de 300', 'fra-0-2048.ktx2 : sha256 différent', 'jpn-1-1024.ktx2 : fichier manquant', 'fra-2048.ktx2 : fichier en trop', 'zzz-0-2048.ktx2 : fichier en trop']` (ordre : pays puis niveaux puis tailles, puis les fichiers en trop dans l'ordre de `readdirSync`, trié par nom : `fra-2048` avant `zzz`) ; le dernier test supprime `index.countries.JPN.levels[1].files['1024']` et attend `jpn-1-1024.ktx2 : absent de imagery.json`.

- [ ] **Step 2 : les voir échouer.** Run : `cd web && npx vitest run --project unit scripts/imagery/__tests__/unit/ ; cd .. && node --test deploy/scripts/patchs.test.mjs`. Expected : FAIL (`imageLevels` absent, noms sans niveau).

- [ ] **Step 3 : implémenter.**

`web/src/data/imagery.ts` (en entier) :

```ts
import type { ArrivalParams, Viewport } from '../camera/framing';
import type { LngLat } from './types';

/** Fichier d'une photo (taille en texels → octets et empreinte). */
export interface ImageFile { bytes: number; sha256: string }

/** Un niveau de la chaîne d'un pays : emprise (demi-côté, rad) et fichiers par taille (spec zoom §4.2). */
export interface ImageLevel { extentRad: number; files: Record<string, ImageFile> }

/**
 * Photos emboîtées d'un pays (public/data/imagery.json, scripts/imagery) : même projection que le patch SDF (contrat de
 * PatchMeta : azimutale équidistante, ligne 0 au nord, sans retournement), centrées sur la calotte ; `levels` du plus large
 * (0) au plus fin, chacun 4 fois plus serré ; KTX2 ETC1S sRGB, alpha = mer. URL : `data/patches/img/<cca3>-<niveau>-<taille>.ktx2`.
 */
export interface ImagePatchMeta { center: LngLat; levels: ImageLevel[] }

export interface ImageryIndex {
  layer: string;
  year: number;
  license: string;
  attribution: string;
  /** Cadrage du jeu au moment de la fabrication (sinon : `npm run imagery`). */
  framing: { margin: number; minContextDeg: number; arrival: ArrivalParams };
  viewFactor: number;
  levelRatio: number;
  maxExtentDeg: number;
  /** Cadrages de référence de la chaîne (spec zoom §4.1). */
  viewports: Viewport[];
  sizes: number[];
  countries: Record<string, ImagePatchMeta>;
}

export const imagePatchName = (cca3: string, level: number, size: number) => `${cca3.toLowerCase()}-${level}-${size}.ktx2`;
export const imagePatchUrl = (baseUrl: string, cca3: string, level: number, size: number) => `${baseUrl}data/patches/img/${imagePatchName(cca3, level, size)}`;
```

`web/scripts/imagery/config.ts` : `import { FOV_Y_DEG } from '../../src/camera/config';` et

```ts
/**
 * Photos emboîtées (spec zoom §4, 15/10) : le niveau le plus fin couvre la vue d'arrivée × `viewFactor`, chaque niveau
 * plus large ×`levelRatio`, jusqu'à `maxExtentDeg` ; chaîne calculée sur les deux cadrages de référence (téléphone en
 * portrait, bureau) ; 2048 texels en « haute », 1024 en « standard » (réduction du 2048) ; ETC1S sRGB, alpha = masque
 * d'eau ; fichiers HORS dépôt.
 */
export const IMAGE_PATCH = {
  sizes: [2048, 1024] as const, viewFactor: 2.2, levelRatio: 4, maxExtentDeg: 30, qlevel: 192,
  viewports: [{ width: 390, height: 844, fovYDeg: FOV_Y_DEG }, { width: 1440, height: 900, fovYDeg: FOV_Y_DEG }],
} as const;
```

`web/scripts/imagery/lib/patchImage.ts` : retirer `imageExtentRad` et ajouter (imports `arrivalAltitude, visibleHalfAngle, type ArrivalTarget, type FramingParams, type Viewport` depuis `../../../src/camera/framing`) :

```ts
/**
 * Chaîne des emprises (demi-côté, rad) d'un pays, du plus large au plus fin (spec zoom §4.1) : le plus fin couvre la vue
 * d'arrivée (`visibleHalfAngle` à `arrivalAltitude`, la plus petite des références) × `viewFactor`, plafonné à
 * `maxExtentDeg` ; chaque niveau plus large ×`levelRatio`, tant qu'il ne dépasse pas `maxExtentDeg` : au-delà, 2048
 * texels ne seraient plus plus fins que la texture globale 8K.
 */
export function imageLevels(rec: ArrivalTarget, framing: FramingParams, o: { viewFactor: number; levelRatio: number; maxExtentDeg: number; viewports: readonly Viewport[] }): number[] {
  const max = o.maxExtentDeg * RAD;
  const finest = Math.min(max, ...o.viewports.map((v) => o.viewFactor * visibleHalfAngle(arrivalAltitude(rec, v, framing), v)));
  const n = 1 + Math.floor(Math.log(max / finest) / Math.log(o.levelRatio) + 1e-9);
  return Array.from({ length: n }, (_, i) => finest * o.levelRatio ** (n - 1 - i));
}
```

`web/scripts/imagery/lib/verify.ts` :

```ts
import { imagePatchName, type ImageryIndex } from '../../../src/data/imagery';

/** Photos d'une taille comparées à l'index versionné, tous niveaux : absentes, ou présentes mais d'une autre taille ou empreinte. */
export function checkPatches(index: ImageryIndex, size: number, dir: string): { total: number; missing: string[]; corrupt: string[] } {
  const missing: string[] = [], corrupt: string[] = [];
  let total = 0;
  for (const [cca3, meta] of Object.entries(index.countries)) {
    for (const [level, l] of meta.levels.entries()) {
      const want = l.files[String(size)];
      if (!want) throw new Error(`imagery.json : pas de fichier ${size} pour ${cca3} niveau ${level}`);
      total++;
      const name = imagePatchName(cca3, level, size);
      const file = path.join(dir, name);
      if (!existsSync(file)) { missing.push(name); continue; }
      const bytes = readFileSync(file);
      if (bytes.length !== want.bytes || sha256(bytes) !== want.sha256) corrupt.push(name);
    }
  }
  return { total, missing, corrupt };
}
```

`web/scripts/imagery/fetch-patches.ts` : `RELEASE = { repo: 'Pablohassan/Countrizz', tag: 'imagerie-2025-niveaux' }` ; `assetName = (size: number) => \`patchs-img-niveaux-${size}.tar\`` ; dans `pack`, `const names = Object.entries(index.countries).flatMap(([c, m]) => m.levels.map((_, i) => imagePatchName(c, i, size)));` (import de `imagePatchName`).

`deploy/scripts/patchs.mjs` :

```js
export const nomPatch = (cca3, niveau, taille) => `${cca3.toLowerCase()}-${niveau}-${taille}.ktx2`;

export function verifierPatchs(dossierImg, index) {
  const erreurs = [];
  const attendus = new Set();
  for (const [cca3, pays] of Object.entries(index.countries)) {
    for (const [niveau, n] of (pays.levels ?? []).entries()) {
      for (const taille of index.sizes) {
        const nom = nomPatch(cca3, niveau, taille);
        attendus.add(nom);
        const meta = n.files?.[String(taille)];
        // … (corps inchangé : absent de imagery.json, manquant, octets, sha256)
      }
    }
  }
  for (const f of existsSync(dossierImg) ? readdirSync(dossierImg).sort() : []) if (!attendus.has(f)) erreurs.push(`${f} : fichier en trop`);
  return { attendus: attendus.size, erreurs };
}
```

(le commentaire d'en-tête : « chaque pays × chaque niveau × chaque taille »).

`deploy/scripts/stage-image.mjs` : remplacer la boucle `for (const taille of index.sizes)` par une répartition sur des calques de taille fixée :

```js
/** Calques par taille de photos (Dockerfile : un COPY par calque) ; 2048 : 156 120 067 octets estimés le 15/10, au-delà d'un calque. */
const CALQUES = { 1024: 1, 2048: 2 };
for (const taille of index.sizes) {
  const n = CALQUES[taille];
  if (!n) { console.error(`Taille ${taille} sans calque prévu (CALQUES, Dockerfile).`); process.exit(1); }
  const dossiers = Array.from({ length: n }, (_, k) => join(out, `img-${taille}-${k}`));
  for (const d of dossiers) mkdirSync(d, { recursive: true });
  const octets = new Array(n).fill(0);
  let k = 0;
  for (const f of readdirSync(img).filter((nom) => nom.endsWith(`-${taille}.ktx2`)).sort()) {
    const s = statSync(join(img, f)).size;
    if (octets[k] + s >= CALQUE_MAX) k++;
    if (k >= n) { console.error(`Photos ${taille} : au-delà de ${n} calques de ${CALQUE_MAX} octets ; en ajouter un (CALQUES, Dockerfile).`); process.exit(1); }
    copyFileSync(join(img, f), join(dossiers[k], f));
    octets[k] += s;
  }
  dossiers.forEach((d, i) => console.log(`img-${taille}-${i} : ${readdirSync(d).length} fichiers, ${octets[i]} octets`));
}
```

`deploy/web/Dockerfile` : les deux `COPY .image-staging/img-…` deviennent

```dockerfile
COPY .image-staging/img-1024-0/ /usr/share/nginx/html/data/patches/img/
COPY .image-staging/img-2048-0/ /usr/share/nginx/html/data/patches/img/
COPY .image-staging/img-2048-1/ /usr/share/nginx/html/data/patches/img/
```

et l'en-tête dit « puis les photos, réparties sur des calques de moins de 150 Mo (`CALQUES` de stage-image.mjs) ».

- [ ] **Step 4 : relancer.** Run : `cd web && npx vitest run --project unit scripts/imagery/__tests__/unit/ && cd .. && node --test deploy/scripts/patchs.test.mjs`. Expected : PASS ; la ligne `chaîne : <N> niveaux pour 197 pays` s'affiche (attendu d'après le spec : 219 ; un autre nombre est noté au ledger et expliqué avant de continuer).

- [ ] **Step 5 : `tsc` (attendu : rouge).** Run : `cd web && npx tsc --noEmit`. Expected : erreurs seulement dans `build-patches.ts`, `controller.ts`, `src/probe/main.ts`, `e2e/image-*.spec.ts`, `e2e-budget/first-load.spec.ts`, `scripts/imagery/__tests__/data/imagery.test.ts` (consommateurs de l'ancien modèle, repris aux Tasks 5, 7, 9 et 10). Aucune autre.

- [ ] **Step 6 : commit.**

```bash
git add web/src/data/imagery.ts web/scripts/imagery/ deploy/scripts/ deploy/web/Dockerfile
git commit -m "photos emboîtées : modèle des niveaux, vérifications, calques de l'image (spec zoom §4.2)"
```

---

### Task 5 : fabrication de la chaîne de photos

**Files:**
- Modify: `web/scripts/imagery/build-patches.ts`, `web/scripts/imagery/__tests__/data/imagery.test.ts`
- Regenerated: `web/public/data/imagery.json`, `web/scripts/imagery/rapport-imagerie.md` (versionnés) ; `web/public/data/patches/img/*.ktx2` (hors dépôt)

**Interfaces:**
- Consumes (Task 4) : `imageLevels`, `IMAGE_PATCH`, `imagePatchName`, `ImageryIndex` ; (Task 1) `FRAMING.arrival`.
- Produces : `imagery.json` au nouveau modèle ; 2 × N fichiers `<cca3>-<niveau>-<taille>.ktx2`.

- [ ] **Step 1 : test de données qui échoue.** Dans `web/scripts/imagery/__tests__/data/imagery.test.ts` :
  - « généré au cadrage du jeu » : `expect(index().framing).toEqual({ margin: FRAMING.margin, minContextDeg: FRAMING.minContextDeg ?? 0, arrival: FRAMING.arrival })` et `expect([index().viewFactor, index().levelRatio, index().maxExtentDeg, index().viewports]).toEqual([IMAGE_PATCH.viewFactor, IMAGE_PATCH.levelRatio, IMAGE_PATCH.maxExtentDeg, IMAGE_PATCH.viewports])` ;
  - « les 197 pays… » : `expect(m.levels.map((l) => l.extentRad)).toEqual(imageLevels(c, FRAMING, IMAGE_PATCH).map((e) => expect.closeTo(e, 12)))` (import `imageLevels` au lieu de `imageExtentRad`) ;
  - « chaque fichier de l'index… » : boucle sur `m.levels.entries()` puis `Object.entries(l.files)`, nom `imagePatchName(cca3, level, Number(size))` ; mêmes contrôles (octets, sha256, dimensions, `supercompression` 1, `KTXorientation` `rd`) — c'est le contrôle du Review Focus 2, sur tous les niveaux de tous les pays ;
  - « le petit niveau garde la couleur » : fichiers `${cca3.toLowerCase()}-0-${size}.ktx2`.

- [ ] **Step 2 : le voir échouer.** Run : `cd web && npx vitest run --project data scripts/imagery/__tests__/data/imagery.test.ts`. Expected : FAIL (ancien `imagery.json`).

- [ ] **Step 3 : `build-patches.ts` par niveaux.** Imports : `readdirSync` (node:fs), `imagePatchName, type ImageLevel, type ImageryIndex` (`../../src/data/imagery`), `imageLevels` au lieu de `imageExtentRad`. Remplacer le corps de la boucle `for (const rec of countries)` par :

```ts
    const extents = imageLevels(rec, FRAMING, IMAGE_PATCH);
    const levels: ImageLevel[] = [];
    for (const [level, extentRad] of extents.entries()) {
      const frame = { center: rec.cap.center, extentRad, size: big };
      const texelDeg = (2 * extentRad) / big / RAD;
      const box = frameBox(frame);
      const pad = 2 * texelDeg;
      const grid = snapGrid({ west: box.west - pad, south: box.south - pad, east: box.east + pad, north: box.north + pad }, texelDeg);
      const { mosaic } = await loadMosaic(grid, { service: EOX.service, cacheDir: IMG_CACHE_DIR, maxPx: EOX.maxPx });
      const land = sampleMask(grid, rasterizeLandGrid(polygons, grid));
      const rgba = renderPatch(frame, (lon, lat) => sampleBilinear(mosaic, lon, lat), land);
      const png = path.join(TMP, `${level}-${big}.png`), pngSmall = path.join(TMP, `${level}-${small}.png`);
      await sharp(rgba, { raw: { width: big, height: big, channels: 4 } }).png({ compressionLevel: 6 }).toFile(png);
      await sharp(await downsamplePatch(rgba, big, small), { raw: { width: small, height: small, channels: 4 } }).png({ compressionLevel: 6 }).toFile(pngSmall);
      const files: Record<string, { bytes: number; sha256: string }> = {};
      for (const [size, src] of [[big, png], [small, pngSmall]] as const) {
        const out = path.join(IMG_OUT_DIR, imagePatchName(rec.cca3, level, size));
        toktx(out, src);
        const bytes = readFileSync(out);
        files[String(size)] = { bytes: bytes.length, sha256: sha256(bytes) };
      }
      levels.push({ extentRad, files });
      console.log(`${rec.cca3} niveau ${level} : ±${(extentRad / RAD).toFixed(4)}°, grille ${grid.width} × ${grid.height}, ${files[String(big)]!.bytes} + ${files[String(small)]!.bytes} octets`);
    }
    index.countries[rec.cca3] = { center: rec.cap.center, levels };
```

L'en-tête de l'index : `framing: { margin: FRAMING.margin, minContextDeg: FRAMING.minContextDeg ?? 0, arrival: FRAMING.arrival! }`, `viewFactor`, `levelRatio: IMAGE_PATCH.levelRatio`, `maxExtentDeg`, `viewports: IMAGE_PATCH.viewports.map((v) => ({ ...v }))`, `sizes`. L'index précédent n'est repris que s'il est au nouveau modèle : `countries: { ...(previous && 'levelRatio' in previous ? previous.countries : {}) }`. Après l'écriture de l'index, lors d'une passe complète (`only.length === 0`), supprimer de `IMG_OUT_DIR` tout `.ktx2` qui n'est pas dans l'index (les anciens `<cca3>-<taille>.ktx2`) :

```ts
  if (!only.length) {
    const want = new Set(Object.entries(index.countries).flatMap(([c, m]) => m.levels.flatMap((_, i) => IMAGE_PATCH.sizes.map((s) => imagePatchName(c, i, s)))));
    for (const f of readdirSync(IMG_OUT_DIR)) if (f.endsWith('.ktx2') && !want.has(f)) rmSync(path.join(IMG_OUT_DIR, f));
  }
```

Le rapport : une ligne par niveau (`| Pays | Niveau | Demi-emprise (°) | Octets 2048 | Octets 1024 |`), et en tête `- <pays> pays, <niveaux> niveaux ; 2048 px : <octets> ; 1024 px : <octets>`.

- [ ] **Step 4 : essai sur trois pays.** Run : `cd web && npm run imagery -- VAT FRA RUS 2>&1 | tail -20`. Expected : 5 lignes pour VAT (niveaux 0 à 4), 1 pour FRA, 1 pour RUS ; code 0. Regarder les PNG intermédiaires n'est pas possible (TMP supprimé) : décoder le niveau le plus fin du Vatican pour l'œil : `ktx extract --transcode rgba8 public/data/patches/img/vat-4-2048.ktx2 <scratchpad>/vat-4.png`, et l'ouvrir (Read) : on doit reconnaître la place Saint-Pierre et la basilique, nord en haut.

- [ ] **Step 5 : passe complète (réseau EOX, longue).** Run en arrière-plan : `cd web && npm run imagery > <scratchpad>/imagery.log 2>&1`. Expected : code 0 ; le rapport `scripts/imagery/rapport-imagerie.md` annonce 197 pays et le nombre de niveaux de la Task 4 ; le total 2048 est noté (le spec estimait 156 120 067 octets).

- [ ] **Step 6 : contrôles de données.** Run : `cd web && npx vitest run --project data scripts/imagery/__tests__/data/imagery.test.ts`. Expected : PASS (dont le Review Focus 2).

- [ ] **Step 7 : commit** (les `.ktx2` restent hors dépôt).

```bash
git add web/scripts/imagery/build-patches.ts web/scripts/imagery/__tests__/data/imagery.test.ts web/scripts/imagery/rapport-imagerie.md web/public/data/imagery.json
git commit -m "photos emboîtées : la chaîne fabriquée pour les 197 pays (spec zoom §4.1-4.2)"
```

---

### Task 6 : deux emplacements de photo dans le globe

**Files:**
- Modify: `web/src/globe/earth.ts`, `web/src/globe/globe.ts`, `web/src/globe/globe.test.ts`

**Interfaces:**
- Consumes : `createImageLayer` (inchangé).
- Produces :
  - `createEarthMaterial(...)` rend `images: [coarse, fine]` (au lieu de `image`) et `setDayNight(day: THREE.Texture, night: THREE.Texture): void`
  - `interface ImageSlot { meta: { center: LngLat; extentRad: number }; tex: THREE.Texture; opacity: number }`
  - `Globe.images: ReturnType<typeof createImageLayer>[]` (vide en mode masque)
  - `Globe.setImageLevels(coarse: ImageSlot | null, fine: ImageSlot | null, fadeSeconds?: number): void` (remplace `setImagePatch`)
  - `Globe.setDayNight(day: THREE.Texture, night: THREE.Texture): void`

- [ ] **Step 1 : tests qui échouent.** Dans `web/src/globe/globe.test.ts`, le premier test devient :

```ts
  it('setPatch(null) et setImageLevels(null, null) délient les textures : le cache peut les libérer sans réenvoi', () => {
    const textures = { day: new THREE.Texture(), night: new THREE.Texture(), surface: new THREE.Texture(), clouds: new THREE.Texture() };
    const globe = new Globe('game', { textures });
    const sdf = new THREE.Texture(), big = new THREE.Texture(), fine = new THREE.Texture();
    globe.setPatch({ sdf: 'patches/sdf/jpn.png', size: 1024, center: [137.1, 38], extentRad: 0.23, rangeTexels: 32 }, sdf);
    globe.setImageLevels({ meta: { center: [137.1, 38], extentRad: 0.4 }, tex: big, opacity: 1 }, { meta: { center: [137.1, 38], extentRad: 0.1 }, tex: fine, opacity: 0.5 });
    expect([globe.country.texture, globe.images[0]!.texture, globe.images[1]!.texture]).toEqual([sdf, big, fine]);
    expect(globe.images[1]!.uniforms.opacity.value).toBe(0.5);
    globe.setPatch(null, null);
    globe.setImageLevels(null, null);
    expect(globe.country.texture).not.toBe(sdf);
    expect([globe.images[0]!.texture, globe.images[1]!.texture]).not.toContain(big);
    expect([globe.images[0]!.texture, globe.images[1]!.texture]).not.toContain(fine);
    // Jamais le même objet Texture dans deux couches (03/10, FRA → JPN → FJI sous SwiftShader) : chaque couche a sa texture vide.
    const empties = [globe.country.texture, globe.images[0]!.texture, globe.images[1]!.texture];
    expect(new Set(empties).size).toBe(3);
  });

  it('première photo du pays en fondu ; le relais d’un niveau à l’autre sans fondu', () => {
    const textures = { day: new THREE.Texture(), night: new THREE.Texture(), surface: new THREE.Texture(), clouds: new THREE.Texture() };
    const globe = new Globe('game', { textures });
    const l0 = new THREE.Texture(), l1 = new THREE.Texture();
    const slot = (tex: THREE.Texture, extentRad: number, opacity = 1) => ({ meta: { center: [0, 0] as [number, number], extentRad }, tex, opacity });
    globe.setImageLevels(slot(l0, 0.4), null, 0.4);
    globe.setTime(10);
    expect(globe.images[0]!.uniforms.opacity.value).toBe(0);
    globe.setTime(10.2);
    expect(globe.images[0]!.uniforms.opacity.value).toBeCloseTo(0.5, 9);
    globe.setTime(10.5);
    globe.setImageLevels(slot(l0, 0.4), slot(l1, 0.1, 0.25), 0.4);
    expect(globe.images[1]!.uniforms.opacity.value).toBe(0.25);
    globe.setImageLevels(slot(l1, 0.1), null, 0.4);           // relais : l1 devient le courant
    expect(globe.images[0]!.uniforms.opacity.value).toBe(1);
    expect(globe.images[0]!.uniforms.extentRad.value).toBe(0.1);
  });

  it('setDayNight remplace les textures de jour et de nuit du matériau', () => {
    const textures = { day: new THREE.Texture(), night: new THREE.Texture(), surface: new THREE.Texture(), clouds: new THREE.Texture() };
    const globe = new Globe('game', { textures });
    const day = new THREE.Texture(), night = new THREE.Texture();
    globe.setDayNight(day, night);
    expect(globe.dayNight).toEqual([day, night]);
  });
```

- [ ] **Step 2 : les voir échouer.** Run : `cd web && npx vitest run --project unit src/globe/globe.test.ts`. Expected : FAIL (`setImageLevels` absent).

- [ ] **Step 3 : implémenter.** `web/src/globe/earth.ts` :

```ts
  const P = exactSpherePoint();
  // Photos emboîtées (spec zoom §4.3) : le niveau courant (0) se pose sur la texture globale, le suivant, plus fin (1), sur lui.
  const images = [createImageLayer(P), createImageLayer(P)] as const;
  const [coarse, fine] = images;
  const sea = mix(mix(texture(t.surface).g, coarse.sea, coarse.weight), fine.sea, fine.weight);
```

puis `const dayTex = texture(t.day), nightTex = texture(t.night);`, `const dayRgb = dayTex.rgb;`, la couleur du sol :

```ts
  const photo = mix(mix(dayColor, coarse.color, coarse.weight), fine.color, fine.weight);
  const ground = photo.add(vec3(0.0, 0.012, 0.035).mul(sea)).mul(shadow.mul(0.45).oneMinus());
```

`emissiveNode` lit `nightTex.rgb` ; le retour devient `{ material, base: …, images, setSun(…), setSaturation(…), setDayNight(day: THREE.Texture, night: THREE.Texture) { dayTex.value = day; nightTex.value = night; } }`. Les commentaires qui parlent du « patch image » parlent des « photos ».

`web/src/globe/globe.ts` :

```ts
/** Une photo posée dans un emplacement : son cadre, sa texture, son opacité propre (fondu du relais). */
export interface ImageSlot { meta: { center: LngLat; extentRad: number }; tex: THREE.Texture; opacity: number }
```

champs : `readonly images: ReturnType<typeof createImageLayer>[] = [];`, `private readonly slotTex: (THREE.Texture | null)[] = [null, null];`, `private readonly slotOpacity = [0, 0];`, `private imageFade: { seconds: number; since: number | null; progress: number } = { seconds: 0, since: null, progress: 1 };`, `private setDayNightTex: ((day: THREE.Texture, night: THREE.Texture) => void) | null = null;`, `private dayNightTex: [THREE.Texture, THREE.Texture] | null = null;` ; dans le constructeur (mode jeu) : `this.images = [...earth.images];`, `this.setDayNightTex = earth.setDayNight;`, `this.dayNightTex = [parts.textures.day, parts.textures.night];`. Remplacer `setImagePatch` par :

```ts
  /**
   * Photos emboîtées du pays visé (spec zoom §4.3) : `coarse` couvre la vue, `fine` (plus serré) se pose dessus à son
   * opacité ; `null` vide l'emplacement (sa couche reprend sa texture vide avant que le cache ne libère la photo). La
   * première photo d'un pays (emplacements vides avant) entre en `fadeSeconds` ; un relais de niveau, non.
   */
  setImageLevels(coarse: ImageSlot | null, fine: ImageSlot | null, fadeSeconds = 0): void {
    if (!this.images.length) return;
    const wasEmpty = this.slotTex.every((t) => t === null);
    if (wasEmpty && (coarse || fine)) this.imageFade = { seconds: fadeSeconds, since: null, progress: fadeSeconds > 0 ? 0 : 1 };
    [coarse, fine].forEach((s, i) => this.setSlot(i, s));
  }

  private setSlot(i: number, s: ImageSlot | null): void {
    const img = this.images[i]!;
    if (!s) { this.slotTex[i] = null; this.slotOpacity[i] = 0; img.uniforms.opacity.value = 0; img.clear(); return; }
    if (s.tex !== this.slotTex[i]) {
      const f = tangentFrame(s.meta.center);
      img.uniforms.center.value.set(...f.center);
      img.uniforms.east.value.set(...f.east);
      img.uniforms.north.value.set(...f.north);
      img.uniforms.extentRad.value = s.meta.extentRad;
      img.setTexture(s.tex);
      this.slotTex[i] = s.tex;
    }
    this.slotOpacity[i] = s.opacity;
    img.uniforms.opacity.value = s.opacity * this.imageFade.progress;
  }

  /** Textures de jour et de nuit (repli de qualité en cours de partie, spec zoom §5 bis) ; l'appelant libère les anciennes. */
  setDayNight(day: THREE.Texture, night: THREE.Texture): void {
    this.setDayNightTex?.(day, night);
    this.dayNightTex = [day, night];
  }

  /** Textures de jour et de nuit liées au matériau (contrôles). */
  get dayNight(): [THREE.Texture, THREE.Texture] | null { return this.dayNightTex; }
```

`setTime` : le fondu fait avancer `progress` et réapplique les deux opacités :

```ts
    const f = this.imageFade;
    if (f.progress < 1 && f.seconds > 0 && this.slotTex.some((t) => t !== null)) {
      f.since ??= seconds;
      f.progress = Math.min(1, (seconds - f.since) / f.seconds);
      this.images.forEach((img, i) => { img.uniforms.opacity.value = this.slotOpacity[i]! * f.progress; });
    }
```

`dispose` : `for (const img of this.images) img.dispose();`. Retirer `image`, `imageTexture` et l'ancien `imageFade`.

- [ ] **Step 4 : relancer.** Run : `cd web && npx vitest run --project unit src/globe/globe.test.ts src/globe/shaderUniformity.test.ts`. Expected : PASS.

- [ ] **Step 5 : commit.**

```bash
git add web/src/globe/earth.ts web/src/globe/globe.ts web/src/globe/globe.test.ts
git commit -m "globe : deux emplacements de photo, relais sans fondu, jour et nuit remplaçables (spec zoom §4.3)"
```

---

### Task 7 : choix des niveaux et chargement

**Files:**
- Create: `web/src/globe/imageLevels.ts`, `web/src/globe/imageLevels.test.ts`
- Modify: `web/src/globe/controller.ts`, `web/src/globe/controller.test.ts`, `web/src/globe/clouds.test.ts` (faux globe), `web/src/probe/main.ts`

**Interfaces:**
- Consumes : `visibleHalfAngle` (Task 1) ; `ImagePatchMeta`, `imagePatchUrl` (Task 4) ; `Globe.setImageLevels`, `ImageSlot` (Task 6).
- Produces :
  - `interface LevelPick { coarse: number; fine: number | null; fineOpacity: number }`
  - `pickLevels(altitude: number, v: Viewport, extentsRad: readonly number[], o: { viewFactor: number; levelRatio: number }): LevelPick`
  - `availableSlots(p: LevelPick, loaded: readonly boolean[]): { coarse: number | null; fine: number | null; fineOpacity: number }`
  - `GlobeController.imageSlots: { coarse: number | null; fine: number | null; fineOpacity: number } | null` (dernier choix appliqué, pour les e2e)

- [ ] **Step 1 : tests purs qui échouent.** Créer `web/src/globe/imageLevels.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { visibleHalfAngle } from '../camera/framing';
import { availableSlots, pickLevels } from './imageLevels';

const phone = { width: 390, height: 844, fovYDeg: 50 };
const o = { viewFactor: 2.2, levelRatio: 4 };
const finest = 0.0019;                                     // ≈ 0,109° : le Vatican
const chain = [256, 64, 16, 4, 1].map((k) => finest * k);  // du plus large au plus fin
/** Altitude dont la vue × 2,2 vaut `D` (recherche par dichotomie : visibleHalfAngle croît avec l'altitude). */
const altitudeFor = (D: number) => { let lo = 1e-7, hi = 50; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (2.2 * visibleHalfAngle(m, phone) < D) lo = m; else hi = m; } return (lo + hi) / 2; };

describe('choix des niveaux selon l’altitude (spec zoom §4.3)', () => {
  it('sous la vue du plus fin, le plus fin seul ; en vue d’ensemble, le niveau 0 et le 1 à 0', () => {
    expect(pickLevels(altitudeFor(0.99 * finest), phone, chain, o)).toMatchObject({ coarse: 4, fine: null });
    expect(pickLevels(2.2, phone, chain, o)).toEqual({ coarse: 0, fine: 1, fineOpacity: 0 });
  });
  it('le suivant est entièrement posé dès que la vue tombe à deux fois son emprise', () => {
    const p = pickLevels(altitudeFor(2 * chain[2]!), phone, chain, o);
    expect(p).toMatchObject({ coarse: 1, fine: 2 });
    expect(p.fineOpacity).toBeCloseTo(1, 6);
    expect(pickLevels(altitudeFor(3 * chain[2]!), phone, chain, o).fineOpacity).toBeLessThan(1);
  });
  it('à 1,079 × l’emprise du plus fin (l’autre cadrage de référence), le plus fin est entièrement posé', () => {
    const p = pickLevels(altitudeFor(1.079 * finest), phone, chain, o);
    expect(p).toEqual({ coarse: 3, fine: 4, fineOpacity: 1 });
  });
  it('balayage d’altitude : continu au relais, et à chaque pas un niveau chargé couvre la vue (Review Focus 3)', () => {
    let prevShown = 0;
    for (let k = 0; k <= 4000; k++) {
      const D = chain[0]! * 2 * Math.pow(finest / (chain[0]! * 2), k / 4000);
      const p = pickLevels(altitudeFor(D), phone, chain, o);
      const s = availableSlots(p, [true, true, true, true, true]);
      expect(s.coarse).not.toBeNull();
      // part de la vue couverte par une photo nette : le courant entier, plus le suivant à son opacité
      const shown = s.coarse! + s.fineOpacity;
      expect(shown + 1e-9).toBeGreaterThanOrEqual(prevShown);   // jamais de retour en arrière en descendant
      expect(shown - prevShown).toBeLessThan(0.05);              // pas de saut d'un pas à l'autre
      prevShown = shown;
    }
  });
});

describe('ce qui est chargé (la manche n’attend jamais une photo)', () => {
  const p = { coarse: 3, fine: 4, fineOpacity: 0.6 };
  it('tout chargé : la paire choisie', () => {
    expect(availableSlots(p, [true, true, true, true, true])).toEqual(p);
  });
  it('le plus fin en échec : le courant seul', () => {
    expect(availableSlots(p, [true, true, true, true, false])).toEqual({ coarse: 3, fine: null, fineOpacity: 0 });
  });
  it('le courant manquant : le niveau plus large le plus fin qui soit chargé', () => {
    expect(availableSlots(p, [true, true, false, false, true])).toEqual({ coarse: 1, fine: 4, fineOpacity: 0.6 });
  });
  it('rien de chargé : rien', () => {
    expect(availableSlots(p, [false, false, false, false, false])).toEqual({ coarse: null, fine: null, fineOpacity: 0 });
  });
});
```

(Le balayage descend de deux fois le niveau 0 au plus fin ; `shown` vaut 0 + opacité du 1, puis 1 + opacité du 2, … : il croît continûment de 0 à 4.)

- [ ] **Step 2 : les voir échouer.** Run : `cd web && npx vitest run --project unit src/globe/imageLevels.test.ts`. Expected : FAIL (module absent).

- [ ] **Step 3 : implémenter `web/src/globe/imageLevels.ts`.**

```ts
import { visibleHalfAngle, type Viewport } from '../camera/framing';

/** Niveau courant (couvre la vue), niveau suivant plus fin et son opacité. */
export interface LevelPick { coarse: number; fine: number | null; fineOpacity: number }

/**
 * Spec zoom §4.3 : D = viewFactor × demi-angle au sol vu sur le petit côté ; courant = le niveau le plus fin dont l'emprise
 * couvre D (le 0 sinon) ; suivant posé à clamp(2 · ln(E_courant / D) / ln(levelRatio), 0, 1) — entièrement dès que
 * D ≤ 2 × son emprise, donc avant qu'il ne devienne le courant : le relais n'a pas de saut. `extentsRad` : du plus large au plus fin.
 */
export function pickLevels(altitude: number, v: Viewport, extentsRad: readonly number[], o: { viewFactor: number; levelRatio: number }): LevelPick {
  const D = o.viewFactor * visibleHalfAngle(altitude, v);
  let coarse = 0;
  for (let i = 0; i < extentsRad.length; i++) if (extentsRad[i]! >= D) coarse = i;
  const fine = coarse + 1 < extentsRad.length ? coarse + 1 : null;
  const fineOpacity = fine === null ? 0 : Math.min(1, Math.max(0, (2 * Math.log(extentsRad[coarse]! / D)) / Math.log(o.levelRatio)));
  return { coarse, fine, fineOpacity };
}

/**
 * La paire réellement posée d'après ce qui est chargé : un courant absent cède la place au niveau plus large le plus fin
 * qui soit chargé ; un suivant absent, à rien (spec zoom §4.4 : la manche n'attend jamais une photo).
 */
export function availableSlots(p: LevelPick, loaded: readonly boolean[]): { coarse: number | null; fine: number | null; fineOpacity: number } {
  let coarse: number | null = null;
  for (let i = p.coarse; i >= 0; i--) if (loaded[i]) { coarse = i; break; }
  const fine = p.fine !== null && loaded[p.fine] ? p.fine : null;
  return { coarse, fine, fineOpacity: fine === null ? 0 : p.fineOpacity };
}
```

- [ ] **Step 4 : tests du contrôleur qui échouent.** Dans `web/src/globe/controller.test.ts` :

```ts
const meta = (...extents: number[]) => ({ center: [0, 0] as [number, number], levels: extents.map((extentRad) => ({ extentRad, files: {} })) });
const index = { viewFactor: 2.2, levelRatio: 4, countries: { FRA: meta(0.5), JPN: meta(0.4), FJI: meta(0.3), VAT: meta(0.03, 0.0075, 0.0019) } } as unknown as ImageryIndex;

function setup(load: (url: string) => Promise<THREE.Texture>) {
  const calls: [number | null, unknown, number | null, unknown, number, number | undefined][] = [];
  const globe = {
    setPatch() {}, setBeacon() {},
    setImageLevels(c: ImageSlot | null, f: ImageSlot | null, fade?: number) {
      calls.push([c?.meta.extentRad ?? null, c?.tex ?? null, f?.meta.extentRad ?? null, f?.tex ?? null, f?.opacity ?? 0, fade]);
    },
  };
  // … (reste inchangé)
}
const pose = (altitude: number) => ({ dir: [1, 0, 0] as [number, number, number], altitude, up: [0, 1, 0] as [number, number, number], cut: false, pitch: 0, axisY: 0 });
```

Tests (remplacent ceux du bloc « patch image du pays visé ») :

```ts
  it('le vol demande chaque niveau à la taille du niveau de qualité, du plus large au plus fin', async () => {
    const { c, urls } = setup(async (u) => tex(u));
    void c.flyTo(by('VAT'));
    await flush();
    expect(urls).toEqual(['/data/patches/img/vat-0-2048.ktx2', '/data/patches/img/vat-1-2048.ktx2', '/data/patches/img/vat-2-2048.ktx2']);
  });

  it('de haut, le niveau 0 ; de près, le plus fin ; première photo en fondu', async () => {
    const t = ['l0', 'l1', 'l2'].map((n) => tex(n));
    const { c, calls } = setup(async (u) => t[Number(u.split('-')[1])]!);
    void c.flyTo(by('VAT'));
    await flush();
    c.notePose(pose(2.2));
    expect(calls.at(-1)!.slice(0, 2)).toEqual([0.03, t[0]]);
    expect(calls.at(-1)![5]).toBe(IMAGE_FADE_S);
    c.notePose(pose(1e-6));
    expect(calls.at(-1)!.slice(0, 4)).toEqual([0.0019, t[2], null, null]);
    expect(c.imageSlots).toEqual({ coarse: 2, fine: null, fineOpacity: 0 });
  });

  it('le plus fin en échec (404) : le niveau plus large reste, rien ne lève', async () => {
    const t = ['l0', 'l1'].map((n) => tex(n));
    const { c, calls } = setup(async (u) => { const i = Number(u.split('-')[1]); if (i === 2) throw new Error('404'); return t[i]!; });
    void c.flyTo(by('VAT'));
    await flush();
    c.notePose(pose(1e-6));
    expect(calls.at(-1)!.slice(0, 4)).toEqual([0.0075, t[1], null, null]);
  });

  it('précharge tous les niveaux du suivant ; ne garde que le courant et le suivant', async () => {
    const disposed: string[] = [];
    const { c, urls } = setup(async (url) => tex(url.split('/').pop()!, disposed));
    c.prefetch(by('VAT'));
    void c.flyTo(by('FRA'));
    await flush();
    expect(urls).toEqual(['/data/patches/img/vat-0-2048.ktx2', '/data/patches/img/vat-1-2048.ktx2', '/data/patches/img/vat-2-2048.ktx2', '/data/patches/img/fra-0-2048.ktx2']);
    c.prefetch(by('JPN'));
    void c.flyTo(by('VAT'));
    await flush();
    expect(disposed).toEqual(['fra-0-2048.ktx2']);
  });

  it('pays absent de l’index : aucune requête, emplacements vides', async () => {
    const { c, urls, calls } = setup(async () => tex('x'));
    void c.flyTo(by('LUX'));
    await flush();
    expect(urls).toEqual([]);
    expect(calls.at(-1)!.slice(0, 4)).toEqual([null, null, null, null]);
  });

  it('changement de taille (repli en qualité standard) : les photos 2048 sont retirées avant d’être libérées', async () => {
    const disposed: string[] = [];
    const { c, calls, urls } = setup(async (url) => tex(url.split('/').pop()!, disposed));
    void c.flyTo(by('FRA'));
    await flush();
    c.notePose(pose(0.5));
    c.setImagery(index, { size: 1024, load: async (url) => { urls.push(url); return tex(url.split('/').pop()!, disposed); } });
    expect(calls.at(-1)!.slice(0, 2)).toEqual([null, null]);       // délié tout de suite
    await flush();
    expect(disposed).toEqual(['fra-0-2048.ktx2']);                  // libéré ensuite
    expect(urls.at(-1)).toBe('/data/patches/img/fra-0-1024.ktx2');
  });
```

(Le faux globe de `clouds.test.ts:21` et `controller.test.ts:84` remplace `setImagePatch() {}` par `setImageLevels() {}`.)

- [ ] **Step 5 : les voir échouer.** Run : `cd web && npx vitest run --project unit src/globe/controller.test.ts`. Expected : FAIL.

- [ ] **Step 6 : implémenter dans `web/src/globe/controller.ts`.**
  - imports : `imagePatchUrl, type ImagePatchMeta, type ImageryIndex` ; `availableSlots, pickLevels` ; `type ImageSlot` de `./globe`.
  - champs : remplacer `image` par `private levelTex: (THREE.Texture | null)[] = [];` et ajouter `private shownSlots: { coarse: number | null; fine: number | null; fineOpacity: number } | null = null;` et le getter `get imageSlots() { return this.shownSlots; }`.
  - `notePose(p)` : après `this.lastPose = p;`, appeler `this.applyImages();` (avant les abonnés).
  - `flyTo` : `this.image = null;` devient `this.levelTex = [];`.
  - remplacer `imageUrl`, `requestImage` et `prefetch` :

```ts
  prefetch(rec: CountryRecord): void {
    this.next = rec;
    this.cache.get(rec.patch.sdf).catch(() => {});
    for (const url of this.imageUrls(rec)) this.images.get(url).catch(() => {});
  }

  private imageMeta(rec: CountryRecord | null): ImagePatchMeta | null {
    return (rec && this.imageSource && this.imagery?.countries[rec.cca3]) || null;
  }

  /** Les niveaux du pays, du plus large au plus fin, à la taille du niveau de qualité. */
  private imageUrls(rec: CountryRecord): string[] {
    const meta = this.imageMeta(rec);
    return meta ? meta.levels.map((_, i) => imagePatchUrl(this.baseUrl, rec.cca3, i, this.imageSource!.size)) : [];
  }

  /** Photos du pays visé, tous niveaux, du plus large au plus fin ; un échec laisse le niveau plus large (spec zoom §4.4). */
  private requestImage(): void {
    const rec = this.target;
    if (!rec) return;
    const urls = this.imageUrls(rec);
    const nextUrls = this.next && this.next !== rec ? this.imageUrls(this.next) : [];
    this.images.keep([...urls, ...nextUrls]);
    this.levelTex = urls.map(() => null);
    urls.forEach((url, i) => this.images.get(url).then((t) => {
      if (this.target === rec && this.imageUrls(rec)[i] === url) { this.levelTex[i] = t; this.applyImages(); }
    }, () => {}));
  }

  /** La paire de niveaux posée pour l'altitude de la dernière image (spec zoom §4.3), d'après ce qui est chargé. */
  private applyImages(): void {
    const g = this.globe, rec = this.target, meta = this.imageMeta(rec);
    if (!g) return;
    if (!meta || !this.imagery || !this.levelTex.some((t) => t !== null)) { this.shownSlots = null; g.setImageLevels(null, null, IMAGE_FADE_S); return; }
    const extents = meta.levels.map((l) => l.extentRad);
    const pick = this.lastPose
      ? pickLevels(this.lastPose.altitude, this.viewport, extents, this.imagery)
      : { coarse: 0, fine: null, fineOpacity: 0 };
    const s = availableSlots(pick, this.levelTex.map((t) => t !== null));
    const slot = (i: number | null, opacity: number): ImageSlot | null =>
      i === null ? null : { meta: { center: meta.center, extentRad: extents[i]! }, tex: this.levelTex[i]!, opacity };
    this.shownSlots = s;
    g.setImageLevels(slot(s.coarse, 1), slot(s.fine, s.fineOpacity), IMAGE_FADE_S);
  }
```

  - `setImagery(index, source)` : avant `this.requestImage()`, si la taille change (`source?.size !== this.imageSource?.size` lu AVANT l'affectation), vider : `this.levelTex = []; this.applyImages();` — l'ordre compte : la couche est déliée de manière synchrone, `keep` (dans `requestImage`) ne libère qu'au tour suivant de la boucle d'événements.
  - `apply()` : les deux lignes `imageMeta` / `g.setImagePatch(…)` deviennent `this.applyImages();`.

`web/src/probe/main.ts` : le paramètre `img` lit un niveau (`level`, défaut : le plus fin) :

```ts
    const meta = (await loadImageryIndex())?.countries[rec.cca3];
    const source = createImageSource(renderer, q.get('tier') === 'haute' ? 'haute' : 'standard');
    const size = q.get('img') ? Number(q.get('img')) : source.size;
    const level = q.has('level') ? Number(q.get('level')) : (meta?.levels.length ?? 1) - 1;
    const tex = meta ? await source.load(imagePatchUrl('/', rec.cca3, level, size)).catch(() => null) : null;
    source.dispose();
    globe.setImageLevels(meta && tex ? { meta: { center: meta.center, extentRad: meta.levels[level]!.extentRad }, tex, opacity: 1 } : null, null);
```

(et la ligne de doc des paramètres : « `img` … ; `level` : niveau de la chaîne, le plus fin par défaut »).

- [ ] **Step 7 : relancer, `tsc`.** Run : `cd web && npx vitest run --project unit src/globe/ && npx tsc --noEmit`. Expected : PASS ; `tsc` ne signale plus que `e2e/image-*.spec.ts` et `e2e-budget/first-load.spec.ts` (Tasks 9 et 10).

- [ ] **Step 8 : commit.**

```bash
git add web/src/globe/imageLevels.ts web/src/globe/imageLevels.test.ts web/src/globe/controller.ts web/src/globe/controller.test.ts web/src/globe/clouds.test.ts web/src/probe/main.ts
git commit -m "photos emboîtées : la paire de niveaux suit l'altitude, tous les niveaux préchargés (spec zoom §4.3-4.4)"
```

---

### Task 8 : qualité haute sur téléphone, repli automatique, encart `?mesure`

**Files:**
- Modify: `web/src/globe/renderer.ts`, `web/src/globe/renderer.test.ts`, `web/src/globe/dynamicResolution.ts`, `web/src/globe/dynamicResolution.test.ts`, `web/src/globe/textures.ts`, `web/src/globe/GlobeView.tsx`
- Create: `web/src/globe/fallback.ts`, `web/src/globe/fallback.test.ts`, `web/src/globe/MeasureOverlay.tsx`

**Interfaces:**
- Consumes : `Globe.setDayNight` (Task 6) ; `GlobeController.setImagery` (Task 7).
- Produces :
  - `qualityTier(i: { backend: Backend; maxTexture2D: number }): QualityTier`
  - governor : `slowWindowsAtFloor: number` (fenêtres consécutives au plancher et lentes), `lastMedianMs: number | null`
  - `type Degradation = 'aucune' | 'sans-traa' | 'standard'`, `FALLBACK_WINDOWS = { traa: 3, standard: 6 }`
  - `nextDegradation(current: Degradation, slowWindowsAtFloor: number): Degradation`
  - `effectiveTier(tier: QualityTier, d: Degradation): QualityTier`
  - `isUncompressed(t: THREE.Texture): boolean`, `formatName(format: number): string`
  - `interface MeasureState { backend: Backend; tier: QualityTier; degradation: Degradation; maxTexture2D: number; format: number | null; dpr: number; medianMs: number | null; traa: boolean; events: { step: Degradation; atS: number; reason: 'lenteur' | 'format' }[] }`
  - `measureLines(m: MeasureState): string[]`
  - `loadDayNight(renderer: THREE.WebGPURenderer, tier: QualityTier, base?: string): Promise<[THREE.Texture, THREE.Texture]>`
  - `GlobeDebug.quality(): { tier: QualityTier; degradation: Degradation; traa: boolean }`, `GlobeDebug.maxTexture2D: number`

- [ ] **Step 1 : tests qui échouent.**

`web/src/globe/renderer.test.ts` (en entier) :

```ts
import { describe, expect, it } from 'vitest';
import { qualityTier } from './renderer';

describe('niveau de qualité (spec zoom §5)', () => {
  it('haute : WebGPU avec des textures de 8192, téléphone compris', () => {
    expect(qualityTier({ backend: 'webgpu', maxTexture2D: 8192 })).toBe('haute');
    expect(qualityTier({ backend: 'webgpu', maxTexture2D: 16384 })).toBe('haute');
  });
  it('standard : le repli — WebGL 2, ou WebGPU limité sous 8192', () => {
    expect(qualityTier({ backend: 'webgl2', maxTexture2D: 16384 })).toBe('standard');
    expect(qualityTier({ backend: 'webgpu', maxTexture2D: 4096 })).toBe('standard');
  });
});
```

`web/src/globe/dynamicResolution.test.ts`, ajouter :

```ts
  it('compte les fenêtres consécutives au plancher et encore lentes, remet à zéro dès qu’une ne l’est plus', () => {
    const g = createDprGovernor(o);
    run(g, 40, 30 * 5);                 // 2 → 0,75 en cinq fenêtres
    expect(g.dpr).toBe(0.75);
    expect(g.slowWindowsAtFloor).toBe(0);
    run(g, 40, 30 * 3);
    expect(g.slowWindowsAtFloor).toBe(3);
    expect(g.lastMedianMs).toBe(40);
    run(g, 18, 30);                      // sous le seuil lent : la série s'arrête
    expect(g.slowWindowsAtFloor).toBe(0);
  });
```

`web/src/globe/fallback.test.ts` :

```ts
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { effectiveTier, formatName, isUncompressed, maxDegradation, measureLines, nextDegradation } from './fallback';

describe('repli en cours de partie (spec zoom §5 bis)', () => {
  it('3 fenêtres au plancher et lentes : TRAA coupé ; 6 : qualité standard', () => {
    expect(nextDegradation('aucune', 2)).toBe('aucune');
    expect(nextDegradation('aucune', 3)).toBe('sans-traa');
    expect(nextDegradation('sans-traa', 5)).toBe('sans-traa');
    expect(nextDegradation('sans-traa', 6)).toBe('standard');
    expect(nextDegradation('aucune', 6)).toBe('standard');
  });
  it('jamais de retour en arrière', () => {
    expect(nextDegradation('sans-traa', 0)).toBe('sans-traa');
    expect(nextDegradation('standard', 0)).toBe('standard');
    expect(maxDegradation('standard', 'sans-traa')).toBe('standard');
    expect(maxDegradation('aucune', 'sans-traa')).toBe('sans-traa');
  });
  it('niveau effectif : standard reste standard ; haute descend avec le repli (une recréation du renderer garde le repli)', () => {
    expect(effectiveTier('standard', 'aucune')).toBe('standard');
    expect(effectiveTier('haute', 'aucune')).toBe('haute');
    expect(effectiveTier('haute', 'sans-traa')).toBe('haute');
    expect(effectiveTier('haute', 'standard')).toBe('standard');
  });
  it('format transcodé : RGBA non compressé reconnu, noms lisibles', () => {
    const t = new THREE.Texture();
    t.format = THREE.RGBAFormat;
    expect(isUncompressed(t)).toBe(true);
    t.format = THREE.RGBA_ETC2_EAC_Format;
    expect(isUncompressed(t)).toBe(false);
    expect(formatName(THREE.RGBA_ETC2_EAC_Format)).toBe('ETC2 RGBA');
    expect(formatName(THREE.RGBA_ASTC_4x4_Format)).toBe('ASTC 4×4');
    expect(formatName(THREE.RGBA_BPTC_Format)).toBe('BC7');
    expect(formatName(THREE.RGBAFormat)).toBe('RGBA (non compressé)');
  });
  it('encart : une ligne par mesure, en français', () => {
    expect(measureLines({ backend: 'webgpu', tier: 'haute', degradation: 'sans-traa', maxTexture2D: 16384, format: THREE.RGBA_ETC2_EAC_Format, dpr: 1.25, medianMs: 18.34, traa: false, events: [{ step: 'sans-traa', atS: 42.4, reason: 'lenteur' }] }))
      .toEqual(['Moteur : WebGPU', 'Qualité : haute (sans TRAA)', 'Textures max : 16384', 'Format : ETC2 RGBA', 'Densité : 1,25', 'Image : 18,3 ms (médiane)', 'TRAA : non', 'Replis : sans TRAA à 42 s (lenteur)']);
  });
});
```

- [ ] **Step 2 : les voir échouer.** Run : `cd web && npx vitest run --project unit src/globe/renderer.test.ts src/globe/dynamicResolution.test.ts src/globe/fallback.test.ts`. Expected : FAIL.

- [ ] **Step 3 : implémenter.**

`web/src/globe/renderer.ts` :

```ts
/**
 * Spec zoom §5 (15/10, amende le §4.1 de la refonte) : « haute » = WebGPU avec des textures de 8192, téléphone compris
 * (« WebGL 2 ne doit être qu'un repli ») ; « standard » = tout le reste, dont WebGL 2.
 */
export function qualityTier(i: { backend: Backend; maxTexture2D: number }): QualityTier {
  return i.backend === 'webgpu' && i.maxTexture2D >= 8192 ? 'haute' : 'standard';
}
```

`web/src/globe/dynamicResolution.ts` : commentaire de `dprOptions` « Les deux niveaux (spec zoom §5) » ; dans `createDprGovernor`, `let slowAtFloor = 0; let lastMedian: number | null = null;` ; dans la branche lente :

```ts
      if (median > o.slowMs) {
        const failed = dpr;
        dpr = Math.max(o.min, dpr - o.step);
        slowAtFloor = dpr === failed ? slowAtFloor + 1 : 0;   // déjà au plancher : la densité ne peut plus rien
        …
      } else {
        slowAtFloor = 0;
        if (median < o.fastMs || median <= displayMs * AT_DISPLAY_RATE) { … }
      }
```

(`lastMedian = median` après le calcul de la médiane) et les getters `get slowWindowsAtFloor() { return slowAtFloor; }`, `get lastMedianMs() { return lastMedian; }`.

`web/src/globe/fallback.ts` :

```ts
import * as THREE from 'three/webgpu';
import type { Backend, QualityTier } from './renderer';

/** Spec zoom §5 bis : ce qui a été retiré à la qualité haute en cours de visite. */
export type Degradation = 'aucune' | 'sans-traa' | 'standard';

/** Fenêtres consécutives de la résolution dynamique au plancher et encore lentes avant chaque repli. */
export const FALLBACK_WINDOWS = { traa: 3, standard: 6 } as const;

const RANK: Record<Degradation, number> = { aucune: 0, 'sans-traa': 1, standard: 2 };

/** Le repli ne fait que descendre : il tient jusqu'à la fin de la visite, jamais annulé en cours de partie. */
export function nextDegradation(current: Degradation, slowWindowsAtFloor: number): Degradation {
  const wanted: Degradation = slowWindowsAtFloor >= FALLBACK_WINDOWS.standard ? 'standard' : slowWindowsAtFloor >= FALLBACK_WINDOWS.traa ? 'sans-traa' : 'aucune';
  return RANK[wanted] > RANK[current] ? wanted : current;
}

/** Le plus avancé des deux replis (deux demandes rapprochées, ou un repli antérieur à une recréation du renderer). */
export const maxDegradation = (a: Degradation, b: Degradation): Degradation => (RANK[b] > RANK[a] ? b : a);

export const effectiveTier = (tier: QualityTier, d: Degradation): QualityTier => (tier === 'haute' && d !== 'standard' ? 'haute' : 'standard');

/** Le transcodeur est retombé sur du RGBA (4 octets par texel au lieu de 1) : la qualité haute coûterait quatre fois la mémoire prévue. */
export const isUncompressed = (t: THREE.Texture): boolean => t.format === THREE.RGBAFormat;

const FORMATS: [number, string][] = [
  [THREE.RGBA_ASTC_4x4_Format, 'ASTC 4×4'], [THREE.RGBA_BPTC_Format, 'BC7'], [THREE.RGB_ETC2_Format, 'ETC2 RGB'],
  [THREE.RGBA_ETC2_EAC_Format, 'ETC2 RGBA'], [THREE.RGB_ETC1_Format, 'ETC1'], [THREE.RGBA_S3TC_DXT5_Format, 'BC3'],
  [THREE.RGBA_S3TC_DXT1_Format, 'BC1'], [THREE.RGB_S3TC_DXT1_Format, 'BC1'], [THREE.RGB_PVRTC_4BPPV1_Format, 'PVRTC'],
  [THREE.RGBA_PVRTC_4BPPV1_Format, 'PVRTC'], [THREE.RGBAFormat, 'RGBA (non compressé)'],
];
export const formatName = (format: number): string => FORMATS.find(([f]) => f === format)?.[1] ?? `format ${format}`;

export interface MeasureState {
  backend: Backend; tier: QualityTier; degradation: Degradation; maxTexture2D: number; format: number | null;
  dpr: number; medianMs: number | null; traa: boolean; events: { step: Degradation; atS: number; reason: 'lenteur' | 'format' }[];
}

const STEP: Record<Degradation, string> = { aucune: 'aucun', 'sans-traa': 'sans TRAA', standard: 'standard' };
const num = (x: number, digits: number) => x.toFixed(digits).replace('.', ',');

/** L'encart `?mesure` (spec zoom §5 bis), une ligne par mesure. */
export function measureLines(m: MeasureState): string[] {
  return [
    `Moteur : ${m.backend === 'webgpu' ? 'WebGPU' : 'WebGL 2'}`,
    `Qualité : ${effectiveTier(m.tier, m.degradation)}${m.degradation === 'sans-traa' ? ' (sans TRAA)' : m.degradation === 'standard' && m.tier === 'haute' ? ' (repli)' : ''}`,
    `Textures max : ${m.maxTexture2D}`,
    `Format : ${m.format === null ? '—' : formatName(m.format)}`,
    `Densité : ${num(m.dpr, 2)}`,
    `Image : ${m.medianMs === null ? '—' : `${num(m.medianMs, 1)} ms (médiane)`}`,
    `TRAA : ${m.traa ? 'oui' : 'non'}`,
    `Replis : ${m.events.length ? m.events.map((e) => `${STEP[e.step]} à ${Math.round(e.atS)} s (${e.reason})`).join(' ; ') : 'aucun'}`,
  ];
}
```

`web/src/globe/textures.ts` : ajouter

```ts
/** Jour et nuit seuls, au niveau donné (repli en cours de partie, spec zoom §5 bis : 8K → 4K sans recréer le renderer). */
export async function loadDayNight(renderer: THREE.WebGPURenderer, tier: QualityTier, base = '/'): Promise<[THREE.Texture, THREE.Texture]> {
  const loader = new KTX2Loader().setTranscoderPath(`${base}basis/`).detectSupport(renderer);
  const size = tier === 'haute' ? '8k' : '4k';
  try {
    const [day, night] = await Promise.all([loader.loadAsync(`${base}textures/day-${size}.ktx2`), loader.loadAsync(`${base}textures/night-${size}.ktx2`)]);
    for (const t of [day, night]) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; }
    return [day, night];
  } finally { loader.dispose(); }
}
```

`web/src/globe/MeasureOverlay.tsx` :

```tsx
import { useEffect, useState } from 'react';
import { measureLines, type MeasureState } from './fallback';

/**
 * Encart `?mesure` (spec zoom §5 bis) : pour les essais de l'utilisateur sur ses téléphones. Coin bas gauche, au-dessus du
 * jeu, sans capter le doigt (les réponses restent jouables) ; relu deux fois par seconde ; rien n'est envoyé nulle part.
 */
export function MeasureOverlay({ read }: { read(): MeasureState | null }) {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    const id = setInterval(() => { const m = read(); setLines(m ? measureLines(m) : []); }, 500);
    return () => clearInterval(id);
  }, [read]);
  if (!lines.length) return null;
  return (
    <div className="mesure" aria-hidden="true" style={{ position: 'absolute', left: 8, bottom: 8, zIndex: 50, pointerEvents: 'none', padding: '6px 8px', background: '#000000b3', color: '#e8f0ff', font: '11px/1.35 ui-monospace, monospace', borderRadius: 6, whiteSpace: 'pre' }}>
      {lines.join('\n')}
    </div>
  );
}
```

`web/src/globe/GlobeView.tsx` :
- `qualityTier({ backend: info.backend, maxTexture2D: info.maxTexture2D })` ; `userData: { backend, tier, maxTexture2D: info.maxTexture2D }` (type de `userData` étendu).
- `GlobeView` tient l'état du repli, qui survit à la recréation du renderer (Review Focus 4) :

```tsx
  const [degradation, setDegradation] = useState<Degradation>('aucune');
  const events = useRef<MeasureState['events']>([]);
  const measure = useRef<MeasureState | null>(null);
  const onDegrade = useCallback((d: Degradation, reason: 'lenteur' | 'format') => {
    setDegradation((cur) => {
      const next = maxDegradation(cur, d);
      if (next !== cur) events.current = [...events.current, { step: next, atS: performance.now() / 1000, reason }];
      return next;
    });
  }, []);
```

  et passe à `GlobeScene` `degradation`, `onDegrade`, `events` et `measure`.
- Rendu : `{new URLSearchParams(location.search).has('mesure') && <MeasureOverlay read={readMeasure} />}` à côté de `ImageryCredit` (`readMeasure` stable : `useCallback(() => measure.current, [])`).
- `GlobeScene` :
  - `const tier = effectiveTier(renderer.userData.tier, degradation);`
  - le régulateur pour tous : `const governor = useMemo(() => createDprGovernor(dprOptions(window.devicePixelRatio)), [renderer]);` (et `if (governor)` disparaît de `useFrame`).
  - post-traitement : `createPostProcessing(renderer, scene, camera, postOptions(degradation === 'aucune' ? renderer.userData.tier : 'standard'))`, dépendances `[renderer, scene, camera, degradation]`.
  - photos : `createImageSource(renderer, tier)`, dépendances `[renderer, controller, tier]`.
  - textures : le premier chargement utilise `tier` (après une recréation qui suit un repli, directement 4K) ; `built` devient un `useRef` (`builtRef`) ; après le chargement en haute, si `isUncompressed(textures.day)`, appeler `onDegrade('standard', 'format')`.
  - effet de repli 8K → 4K : quand `tier === 'standard'` et que `builtRef.current` a des textures 8K (`builtRef.current.tier === 'haute'`), `loadDayNight(renderer, 'standard')` puis `globe.setDayNight(day, night)`, libérer les anciennes, `builtRef.current = { ...builtRef.current, textures: { ...textures, day, night }, tier: 'standard' }` ; en échec, garder la 8K (console.warn), la partie continue.
  - dans `useFrame`, après `governor.update(…)` : si `renderer.userData.tier === 'haute'`, `const next = nextDegradation(degradationRef.current, governor.slowWindowsAtFloor); if (next !== degradationRef.current) onDegrade(next, 'lenteur');` (`degradationRef` suit la prop) ; puis remplir `measure.current = { backend, tier: renderer.userData.tier, degradation, maxTexture2D, format: builtRef.current?.textures.day.format ?? null, dpr: renderer.getPixelRatio(), medianMs: governor.lastMedianMs, traa: degradation === 'aucune' && renderer.userData.tier === 'haute', events: events.current }`.
  - `GlobeDebug` : `quality: () => ({ tier, degradation, traa: degradation === 'aucune' && renderer.userData.tier === 'haute' })`, `maxTexture2D`.

- [ ] **Step 4 : relancer, `tsc`.** Run : `cd web && npx vitest run --project unit src/globe/ && npx tsc --noEmit`. Expected : PASS ; `tsc` comme à la fin de la Task 7.

- [ ] **Step 5 : e2e du repli qui échoue puis passe.** Créer `web/e2e/fallback.spec.ts` :

```ts
import { expect, test } from '@playwright/test';

test.slow(true, 'SwiftShader : onze fenêtres de 30 images');
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('téléphone en WebGPU : qualité haute, puis repli sous la lenteur, sans arrêter la manche ni remonter après une perte du GPU', async ({ page }) => {
  await page.goto('/demo.html?demo=FRA&mesure');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.__globe!.quality())).toEqual({ tier: 'haute', degradation: 'aucune', traa: true });
  await expect(page.locator('.mesure')).toContainText('Qualité : haute');
  await page.evaluate(() => { window.__globe!.frameMsOverride = 40; });
  await page.waitForFunction(() => window.__globe!.quality().degradation === 'sans-traa', null, { timeout: 180_000 });
  await page.waitForFunction(() => window.__globe!.quality().degradation === 'standard', null, { timeout: 180_000 });
  expect(await page.evaluate(() => window.__globe!.quality().tier)).toBe('standard');
  await expect(page.locator('.mesure')).toContainText('Replis : sans TRAA à');
  await page.evaluate(() => { window.__globe!.frameMsOverride = undefined; window.__globe!.simulateDeviceLost(); });
  await page.waitForFunction(() => window.__globe?.generation === 1 && window.__globe.frames > 10, null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.__globe!.quality())).toEqual({ tier: 'standard', degradation: 'standard', traa: false });
  expect(await page.evaluate(() => window.__demo!.errors)).toEqual([]);
});
```

Run : `cd web && npx playwright test e2e/fallback.spec.ts`. Expected : PASS (si SwiftShader WebGPU ne donne pas `maxTexture2D >= 8192`, la première attente échoue : arrêt, relever la valeur de `window.__globe.maxTexture2D` au ledger et en décider — ne pas affaiblir l'attente).

- [ ] **Step 6 : commit.**

```bash
git add web/src/globe/ web/e2e/fallback.spec.ts
git commit -m "qualité haute sur téléphone en WebGPU, repli automatique, encart ?mesure (spec zoom §5, §5 bis)"
```

---

### Task 9 : cache du service worker et budget

**Files:**
- Modify: `web/vite.config.ts`, `web/src/pwa/pwa.test.ts`, `web/e2e/pwa.spec.ts`, `web/e2e-budget/first-load.spec.ts`

**Interfaces:**
- Consumes : `imagePatchName` (Task 4).
- Produces : cache « pays » à 700 entrées ; budget de l'accueil borné en haute.

- [ ] **Step 1 : tests qui échouent.** `web/src/pwa/pwa.test.ts`, dans « service worker : ce qu'il garde » :

```ts
  it('les niveaux de photos d’un pays vu restent gardés ; le cache des pays tient un tour complet (700 entrées)', () => {
    for (const u of ['/data/patches/img/vat-4-2048.ktx2', '/data/patches/img/fra-0-1024.ktx2', 'https://countrizz.fr/data/patches/img/mco-3-2048.ktx2']) expect(MOTIF_PAYS.test(u), u).toBe(true);
    const conf = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
    const pays = conf.slice(conf.indexOf('urlPattern: MOTIF_PAYS'), conf.indexOf('urlPattern: MOTIF_DONNEES'));
    expect(pays).toContain('maxEntries: 700');
  });
```

`web/e2e/pwa.spec.ts`, ajouter :

```ts
test('un niveau de photo déjà vu est servi par le service worker à la visite suivante', async ({ page }) => {
  await page.goto(`/?webgl&introVariante=${VARIANTE}`);
  test.skip((await page.locator('link[rel="manifest"]').count()) === 0, 'pas de service worker : serveur de dev');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto('/demo.html?demo=FRA&webgl');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 180_000 });
  await expect.poll(async () => (await enCache(page)).includes('/data/patches/img/fra-0-1024.ktx2'), { timeout: 60_000 }).toBe(true);
  const served: boolean[] = [];
  page.on('response', (r) => { if (new URL(r.url()).pathname === '/data/patches/img/fra-0-1024.ktx2') served.push(r.fromServiceWorker()); });
  await page.reload();
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 180_000 });
  expect(served).toEqual([true]);
});
```

(Avant d'écrire ce test, lire la configuration workbox de `web/vite.config.ts` : si un `navigateFallback` sert `index.html` aux navigations sans liste d'exclusion, `/demo.html` serait remplacée par l'accueil sous le service worker ; dans ce cas, ajouter `navigateFallbackDenylist: [/^\/(demo|probe|calibrate)\.html/]`, qui rend aux pages de contrôle leur propre HTML, et l'inscrire au ledger.)

- [ ] **Step 2 : le voir échouer.** Run : `cd web && npx vitest run --project unit src/pwa/pwa.test.ts`. Expected : FAIL (`maxEntries: 400`).

- [ ] **Step 3 : implémenter.** `web/vite.config.ts`, cache `pays` : `expiration: { maxEntries: 700, purgeOnQuotaError: true }`, avec le commentaire « un tour complet dans une taille : 219 niveaux + 197 SDF + 197 drapeaux (spec zoom §6) ». `web/e2e-budget/first-load.spec.ts` :
  - les photos absentes en CI sont comptées d'après l'index, au nouveau nom :

```ts
    const m = url.match(/\/patches\/img\/(\w+)-(\d+)-(\d+)\.ktx2$/);
    if (r.status() === 404 && m) {
      const [, id, level, size] = m;
      rows.push({ url: `${url} (index)`, bytes: imagery.countries[id!.toUpperCase()]!.levels[Number(level)]!.files[size!]!.bytes });
      return;
    }
```

  - `report` affiche aussi la ligne des photos : `console.log(\`dont photos du pays : ${rows.filter((r) => r.url.includes('/patches/img/')).reduce((s, r) => s + r.bytes, 0)} octets\`)` ;
  - l'accueil est borné dans les deux niveaux : `expect(total).toBeLessThanOrEqual(FIRST_LOAD_BUDGET.accueil);` sans la condition `tier === 'standard'` (et le commentaire « haute : mesuré, pas encore borné » disparaît : « spec zoom §6 : les deux niveaux »).

- [ ] **Step 4 : relancer.** Run : `cd web && npx vitest run --project unit src/pwa/pwa.test.ts && npx tsc --noEmit`. Expected : PASS ; `tsc` ne signale plus que `e2e/image-*.spec.ts` (Task 10). Le test e2e du service worker et le budget tournent sous le nginx de l'image à la Task 11.

- [ ] **Step 5 : commit.**

```bash
git add web/vite.config.ts web/src/pwa/pwa.test.ts web/e2e/pwa.spec.ts web/e2e-budget/first-load.spec.ts
git commit -m "cache des pays à 700 entrées, niveaux de photos gardés ; budget borné en qualité haute (spec zoom §6)"
```

---

### Task 10 : e2e du zoom

**Files:**
- Create: `web/e2e/zoom.spec.ts`
- Modify: `web/e2e/image-flight.spec.ts`, `web/e2e/image-patch.spec.ts`, `web/src/globe/GlobeView.tsx` (crochets), `web/src/globe/globe.ts` (`beaconShown`)

**Interfaces:**
- Consumes : `arrivalShare`, `FRAMING` (Task 1) ; `GlobeController.imageSlots` (Task 7) ; `imagePatchName` (Task 4).
- Produces : `GlobeDebug.beacon(): boolean`, `GlobeDebug.imageSlots(): { coarse: number | null; fine: number | null; fineOpacity: number } | null` ; `Globe.beaconShown: boolean`.

- [ ] **Step 1 : crochets.** `Globe` : `get beaconShown(): boolean { return this.beacon.sprite.visible; }`. `GlobeDebug` : `beacon(): boolean` (`() => globe?.beaconShown ?? false`) et `imageSlots()` (`() => controller.imageSlots`), posés dans l'effet qui installe `window.__globe` (ajouter `globe` et `controller` à ses dépendances).

- [ ] **Step 2 : e2e qui échoue.** Créer `web/e2e/zoom.spec.ts` :

```ts
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { FRAMING } from '../src/camera/config';
import { arrivalShare } from '../src/camera/framing';
import { imagePatchName, type ImageryIndex } from '../src/data/imagery';
import type { CountryRecord, LngLat } from '../src/data/types';

test.slow(true, 'SwiftShader : vols de 6 s et photos');
const PHONE = { width: 390, height: 844 };
test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const imagery = JSON.parse(readFileSync('public/data/imagery.json', 'utf8')) as ImageryIndex;
const by = (cca3: string) => countries.find((c) => c.cca3 === cca3)!;
const quadrants = readFileSync('e2e/fixtures/quadrants.ktx2');

/** Point à `deg` degrés du centre, vers l'est (azimut 90°) ou l'ouest (270°), sur la sphère. */
function destination([lng, lat]: LngLat, deg: number, bearingDeg: number): LngLat {
  const R = Math.PI / 180, d = deg * R, b = bearingDeg * R, p1 = lat * R, l1 = lng * R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [l2 / R, p2 / R];
}

/** Part du petit côté (la largeur, en portrait) qu'occupe la calotte projetée par la caméra de la page. */
async function measuredShare(page: Page, rec: CountryRecord): Promise<number> {
  const [e, w] = await page.evaluate((pts) => pts.map((p) => window.__globe!.project(p)), [destination(rec.cap.center, rec.cap.radiusDeg, 90), destination(rec.cap.center, rec.cap.radiusDeg, 270)]);
  return Math.abs(e![0] - w![0]) / PHONE.width;
}

/** Photos remplacées par la mire des quadrants (les vraies sont hors dépôt, absentes en CI). */
const routeQuadrants = (page: Page) => page.route('**/data/patches/img/*.ktx2', (r) => r.fulfill({ body: quadrants, contentType: 'image/ktx2' }));
async function goAndWait(page: Page, cca3: string, extra = '') {
  await page.goto(`/demo.html?demo=${cca3}${extra}`);
  await page.waitForFunction((c) => window.__demo?.arrived.includes(c) === true, cca3, { timeout: 180_000 });
}
async function arrive(page: Page, cca3: string) {
  await routeQuadrants(page);
  await goAndWait(page, cca3);
}

for (const cca3 of ['VAT', 'MCO', 'FRA', 'RUS']) {
  test(`${cca3} à l’arrivée sur téléphone : entre 10 % et 80 % de la largeur, à la part visée`, async ({ page }) => {
    await arrive(page, cca3);
    const s = await measuredShare(page, by(cca3));
    console.log(cca3, 'part mesurée', s.toFixed(4), 'visée', arrivalShare(by(cca3), { ...PHONE, fovYDeg: 50 }, FRAMING).toFixed(4));
    expect(s).toBeGreaterThanOrEqual(0.09);
    expect(s).toBeLessThanOrEqual(0.81);
    expect(Math.abs(s - arrivalShare(by(cca3), { ...PHONE, fovYDeg: 50 }, FRAMING))).toBeLessThan(0.01);
    expect(await page.evaluate(() => window.__globe!.beacon())).toBe(cca3 === 'MCO');   // spec zoom §2 : Monaco garde la sienne
  });
}

test('le Vatican : tous ses niveaux demandés en 2048, le plus fin entièrement posé à l’arrivée', async ({ page }) => {
  const n = imagery.countries.VAT!.levels.length;
  const requested: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/patches/img/')) requested.push(r.url().split('/').pop()!); });
  await arrive(page, 'VAT');
  expect([...requested].sort()).toEqual(Array.from({ length: n }, (_, i) => imagePatchName('VAT', i, 2048)).sort());
  const s = (await page.evaluate(() => window.__globe!.imageSlots()))!;
  expect(s.coarse === n - 1 || (s.fine === n - 1 && s.fineOpacity === 1), JSON.stringify(s)).toBe(true);
});

test('le niveau le plus fin du Vatican en 404 : la manche continue sur le niveau plus large', async ({ page }) => {
  const n = imagery.countries.VAT!.levels.length;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await routeQuadrants(page);
  // déclarée après la mire : Playwright essaie les routes de la dernière déclarée à la première
  await page.route(`**/data/patches/img/${imagePatchName('VAT', n - 1, 2048)}`, (r) => r.fulfill({ status: 404 }));
  await goAndWait(page, 'VAT');
  expect(await page.evaluate(() => window.__globe!.imageSlots())).toEqual({ coarse: n - 2, fine: null, fineOpacity: 0 });
  expect(errors).toEqual([]);
});
```

Ajouter le contrôle du Review Focus 1 dans le même fichier. Faire viser le Vatican par le jeu lui-même n'est pas déterministe ; la démo pose donc une zone libre comme le jeu, par un paramètre `safe=<haut>,<bas>` (px CSS) :

```ts
test('en zone libre (bandes du jeu), le Vatican arrive sur son niveau le plus fin (Review Focus 1)', async ({ page }) => {
  const n = imagery.countries.VAT!.levels.length;
  await routeQuadrants(page);
  await goAndWait(page, 'VAT', '&safe=80,300');
  const s = (await page.evaluate(() => window.__globe!.imageSlots()))!;
  expect(s.coarse === n - 1 || (s.fine === n - 1 && s.fineOpacity === 1), JSON.stringify(s)).toBe(true);
});
```

Dans `web/src/demo/main.tsx`, au début de la boucle `void (async () => { … })()` (globe prêt, avant le premier vol) :

```ts
      const safe = q.get('safe')?.split(',').map(Number);
      if (safe) globe.current!.setSafeArea({ top: safe[0]!, bottom: safe[1]! });
```

et la ligne de doc de la démo : « `safe=<haut>,<bas>` : bandes occupées comme en jeu (zone libre) ».

- [ ] **Step 3 : le voir échouer, puis corriger les deux e2e existants.** Run : `cd web && npx playwright test e2e/zoom.spec.ts e2e/image-flight.spec.ts e2e/image-patch.spec.ts`. Expected avant correction : `zoom.spec.ts` passe ou échoue sur ses seules attentes (les crochets existent) ; `image-flight`/`image-patch` ne compilent pas (`fra.extentRad`). Les corriger : `const fra = imagery.countries.FRA!; const fraLevel = fra.levels.at(-1)!;` et `makeProjector({ center: fra.center, extentRad: fraLevel.extentRad, size: 4 })` ; noms attendus `fra-0-${size}.ktx2` (`imagePatchName('FRA', 0, size)`) ; routes `**/data/patches/img/fra-*.ktx2` inchangées. Dans `image-flight.spec.ts`, le cas `webgpu` reste à 2048 et `webgl2` à 1024.

- [ ] **Step 4 : relancer.** Run : `cd web && npx tsc --noEmit && npx playwright test e2e/zoom.spec.ts e2e/image-flight.spec.ts e2e/image-patch.spec.ts e2e/fallback.spec.ts`. Expected : `tsc` sans erreur ; tous PASS. Un écart de part mesurée au-delà de 0,01 est une découverte (caméra décentrée, `axisY`) : la consigner et la comprendre avant d'élargir quoi que ce soit.

- [ ] **Step 5 : commit.**

```bash
git add web/e2e/zoom.spec.ts web/e2e/image-flight.spec.ts web/e2e/image-patch.spec.ts web/src/globe/GlobeView.tsx web/src/globe/globe.ts web/src/demo/main.tsx
git commit -m "e2e du zoom : parts d'écran, balise, niveaux du Vatican, 404, zone libre (spec zoom §8)"
```

---

### Task 11 : suite complète, captures, passation, mise en ligne

**Files:**
- Create: `web/e2e/zoom-visual.spec.ts`
- Modify: `web/e2e/visual.spec.ts-snapshots/*` (si les références changent), `docs/HANDOFF.md`, `deploy/k8s/countrizz.yaml` (`1.8` → `1.9`)

**Interfaces:**
- Consumes : toute la branche ; `deploy/scripts/build-image.sh` ; `web/e2e/deployed.ts`.
- Produces : la Release `imagerie-2025-niveaux`, l'image `pablohassan/countrizz-web:1.9` et son déploiement (chacun sur GO) ; la passation.

- [ ] **Step 1 : suite du Mac.** Run : `cd web && npm run check > <ws>/check.log 2>&1; npm run test:data > <ws>/data.log 2>&1; npm run e2e:local > <ws>/e2e.log 2>&1` (`<ws>` : l'espace de travail du plan) ; lire la fin de chaque journal. Expected : `tsc` sans erreur ; Vitest tout vert ; `test:data` tout vert ; Playwright sans échec, `staleFrames` à 0. Les e2e qui encodaient l'ancien cadrage (positions écran attendues, balises attendues, références de `visual.spec.ts`) échouent sans doute : pour chacun, vérifier que l'échec vient du cadrage (et non d'un défaut), mettre à jour l'attente à partir de `arrivalAltitude`/`needsBeacon` plutôt qu'en dur, et l'inscrire au ledger (`Ruling:`). Les références d'images de `visual.spec.ts` ne se régénèrent (`--update-snapshots`) qu'APRÈS le regard de l'utilisateur au Step 3.

- [ ] **Step 2 : captures avant/après.** Créer `web/e2e/zoom-visual.spec.ts` (sauté sans `CAPTURES`) : pour RUS, FRA, MCO et VAT, sur téléphone 390 × 844, `demo.html?demo=<cca3>` avec les vraies photos (aucune route), attente de l'arrivée puis 800 ms (fondu), capture `${CAPTURES}/zoom-<cca3>.png`. « Avant » : `CAPTURES=<scratchpad>/zoom-avant E2E_BASE_URL=https://countrizz.fr npx playwright test e2e/zoom-visual.spec.ts` (site 1.8, préparé par `e2e/deployed.ts`) ; « après » : `CAPTURES=<scratchpad>/zoom-apres npm run e2e:local -- e2e/zoom-visual.spec.ts`. Ouvrir chaque capture (Read) et noter ce qu'on y voit, Monaco compris (Review Focus 5 : côte et reflet).

- [ ] **Step 3 : page de suivi de l'utilisateur.** Lire la page (`Artifact` action `read`, url `https://claude.ai/artifact/4Sd4LAsYeL8YUa77vBhLki`), y ajouter une section « Zoom et images de près » avec les huit captures côte à côte (avant / après), la part mesurée de chaque pays et une ligne par point à regarder (netteté du Vatican, côte de Monaco, Russie entière), puis republier à la même adresse. Lui demander son avis ; ne régénérer les références de `visual.spec.ts` qu'après son accord, et refaire alors `npx playwright test e2e/visual.spec.ts`.

- [ ] **Step 4 : build de production sous le nginx de l'image, service worker et budget.** Run, depuis la racine, le port 5176 libre :

```bash
(cd web && npm run build)
docker run -d --rm --name countrizz-e2e -p 127.0.0.1:5176:8080 -v "$PWD/deploy/web/nginx.conf:/etc/nginx/conf.d/default.conf:ro" -v "$PWD/web/dist:/usr/share/nginx/html:ro" nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
(cd web && E2E_BASE_URL=http://127.0.0.1:5176 npx playwright test e2e/intro.spec.ts e2e/pwa.spec.ts e2e/game.spec.ts e2e/zoom.spec.ts e2e/fallback.spec.ts)
(cd web && BUDGET_BASE_URL=http://127.0.0.1:5176 npm run budget)
docker stop countrizz-e2e
node deploy/scripts/stage-image.mjs && rm -rf .image-staging
```

Expected : aucun échec, le test « un niveau de photo déjà vu est servi par le service worker » compris ; budget : les deux lignes `total <TS> octets (budget 12000000)` (standard) et `total <TH> octets (budget 12000000)` (haute), toutes deux sous le plafond, et les lignes « dont photos du pays » ; `stage-image.mjs` : `img-2048-0`, `img-2048-1`, `img-1024-0` sous 150 000 000 octets chacun, et `Patchs image vérifiés : <2 × niveaux> fichiers conformes à imagery.json.` Un total au-dessus du plafond : arrêt, le chiffre devant l'utilisateur (ne pas relever le plafond).

- [ ] **Step 5 : archives de la Release.** Run : `cd web && npm run imagery:fetch -- --pack`. Expected : `patchs-img-niveaux-2048.tar : <N> patchs`, idem 1024, et `LICENCE-IMAGERIE.txt` dans `scripts/imagery/.cache/release/`.

- [ ] **Step 6 : passation.** Dans `docs/HANDOFF.md`, juste après la ligne qui commence par `> **Récupérer le travail.**`, insérer (chaque `<…>` remplacé, `<JJ/MM>` = `date +%d/%m`) :

```markdown
> **<JJ/MM> — sous-projet 1 du rendu réaliste fait : zoom sur le pays et images de près** (`docs/superpowers/plans/2026-10-19-countrizz-zoom-images-de-pres.md`, spec `docs/superpowers/specs/2026-10-15-countrizz-zoom-images-de-pres-design.md`). À l'arrivée, chaque pays occupe 10 à 80 % du petit côté (`arrivalShare`/`arrivalAltitude`, `web/src/camera/framing.ts`) ; vols × facteur de zoom, 6 s au plus ; chaîne de <niveaux> photos pour 197 pays (`imagery.json`, `<cca3>-<niveau>-<taille>.ktx2`, Release `imagerie-2025-niveaux`), relayées par deux emplacements (`web/src/globe/imageLevels.ts`) ; qualité haute pour tout WebGPU à 8192, repli automatique (`fallback.ts`) et encart `?mesure` ; XUASTC non lu par three 0.186.1 : ETC1S reste. Balise : <19> pays sur téléphone, <5> au bureau. Suite du Mac : `check` <U> passed, `test:data` <D> passed, `e2e:local` <E> passed ; budget sous le nginx de l'image : standard <TS> octets, haute <TH>. Captures avant/après sur la page de suivi ; avis de l'utilisateur : <AVIS>. Revue finale : <REVUE>. Image `countrizz-web:1.9` à construire et déployer sur GO. **Suite : essai sur iPhone 13 et Android avec `?mesure` (l'utilisateur), puis sous-projet 2 (océan et nuages).**
```

Run : `node -e 'require("fs").readFileSync("docs/HANDOFF.md","utf8").split("\n").slice(5,10).forEach((l,i)=>console.log(i+6,l.slice(0,90)))'`. Expected : la ligne insérée suit `> **Récupérer le travail.** …`, sans gabarit `<…>`.

- [ ] **Step 7 : étiquette.** Run (lectures seules) :

```bash
ssh pablo1@192.168.1.171 "kubectl -n countrizz get deploy countrizz-web -o jsonpath='{.spec.template.spec.containers[0].image}'"; echo
for t in 1.8 1.9; do docker buildx imagetools inspect pablohassan/countrizz-web:$t >/dev/null 2>&1 && echo "$t publiée" || echo "$t absente"; done
```

Expected : `pablohassan/countrizz-web:1.8`, `1.8 publiée`, `1.9 absente`. Autre chose : arrêt, demander à l'utilisateur. Puis `deploy/k8s/countrizz.yaml` : `image: pablohassan/countrizz-web:1.8` → `1.9` ; contrôle : `node -e 'const t=require("fs").readFileSync("deploy/k8s/countrizz.yaml","utf8");console.log(t.match(/image: (pablohassan\/countrizz-web:\S+)/)[1])'` → `pablohassan/countrizz-web:1.9`. Commit :

```bash
git add docs/HANDOFF.md deploy/k8s/countrizz.yaml web/e2e/zoom-visual.spec.ts
git commit -m "déploiement : countrizz-web 1.9 (zoom et images de près) — passation"
```

- [ ] **Step 8 : GO, puis la Release.** Demander, et attendre un « oui » explicite : « Je publie sur GitHub (dépôt public `Pablohassan/Countrizz`) la Release `imagerie-2025-niveaux` avec `patchs-img-niveaux-2048.tar`, `patchs-img-niveaux-1024.tar` et `LICENCE-IMAGERIE.txt`, par `gh release create imagerie-2025-niveaux web/scripts/imagery/.cache/release/* --repo Pablohassan/Countrizz --title "Imagerie 2025 — photos emboîtées" --notes "Photos Sentinel-2 (EOxCloudless 2025, CC BY-NC-SA 4.0) en niveaux emboîtés, spec zoom §4."`. GO ? » Puis la commande. Expected : l'URL de la Release. Contrôle : dans un dossier vide, `IMG_OUT_DIR` déplacé de côté, `npm run imagery:fetch` télécharge et vérifie les deux tailles (`<N>/<N> conformes`) ; remettre le dossier.

- [ ] **Step 9 : GO, puis l'image.** Demander : « Je construis l'image arm64 `pablohassan/countrizz-web:1.9` sur ce Mac et je la pousse sur Docker Hub (publique) par `deploy/scripts/build-image.sh`. Elle met le zoom et les photos emboîtées en ligne. GO ? » Puis `deploy/scripts/build-image.sh`. Expected : le build Vite, les trois calques de photos, `Patchs image vérifiés : <2 × niveaux> fichiers conformes à imagery.json.`, la poussée, et en dernière ligne `pablohassan/countrizz-web:1.9` ; code 0.

- [ ] **Step 10 : GO, puis le déploiement.** Demander : « J'applique `deploy/k8s/countrizz.yaml` sur le cluster depuis rpi1 (`kubectl apply`, étiquette 1.9) et j'attends le déploiement. GO ? » Puis :

```bash
ssh pablo1@192.168.1.171 'kubectl apply -f -' < deploy/k8s/countrizz.yaml
ssh pablo1@192.168.1.171 'kubectl -n countrizz rollout status deploy/countrizz-web --timeout=300s'
ssh pablo1@192.168.1.171 "kubectl -n countrizz get deploy countrizz-web -o jsonpath='{.spec.template.spec.containers[0].image}'"; echo
```

Expected : `configured`, `successfully rolled out`, `pablohassan/countrizz-web:1.9`. Retour arrière si le site casse : `1.8` dans `countrizz.yaml`, réappliqué sur GO.

- [ ] **Step 11 : sur le site.** Run : `cd web && npm run e2e && npm run budget`. Expected : aucun échec ni test sauté (hors ceux qui le sont par conception) ; budget `passed`, les deux niveaux sous 12 000 000 octets. Puis, dans la ligne du Step 6 de `docs/HANDOFF.md`, `Image \`countrizz-web:1.9\` à construire et déployer sur GO.` devient `**\`countrizz-web:1.9\` en ligne** (<JJ/MM>, GO de l'utilisateur) : sur countrizz.fr, e2e <E_SITE> passed, budget passed.` Commit :

```bash
git add docs/HANDOFF.md
git commit -m "passation : countrizz-web 1.9 en ligne (zoom et images de près), e2e et budget sur countrizz.fr — spec zoom §9"
```

- [ ] **Step 12 : l'essai de l'utilisateur.** Lui demander de jouer une partie sur countrizz.fr avec `?mesure` depuis un iPhone 13 (Safari) et un Android de 2020 ou après (Chrome), avec un passage par le Vatican ou Monaco, et de rapporter : fluidité de la plongée, netteté à l'arrivée, chaleur, onglet jamais rechargé, lignes de l'encart (moteur, qualité, format, replis). Les seuils de repli se règlent alors dans `web/src/globe/fallback.ts` (`FALLBACK_WINDOWS`) et `dynamicResolution.ts`.
