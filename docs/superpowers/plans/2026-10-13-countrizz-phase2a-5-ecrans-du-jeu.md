# Countrizz 2A-5 — les écrans du jeu · plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rendre Countrizz jouable de bout en bout sur countrizz.fr : accueil → choix du mode → 3-2-1 → manches (vol → question → révélation) → fin → scores, plus « À propos », « Tourne ton téléphone », les écrans d'erreur et l'haptique, en français et en anglais.

**Architecture:** le moteur pur de 2A-3 (`web/src/game/`) et le `GlobeHandle` de 2A-4 existent et sont testés ; ce plan les relie. La logique nouvelle reste pure et testée sous Vitest (`app/globeCommands.ts` : ce que le globe doit faire à chaque changement d'état ; `app/finish.ts` : la partie entre au top 10 ; `ui/flagSize.ts`, `ui/answerLabel.ts`, `ui/haptics.ts`, `ui/share.ts`, `ui/rotate.ts`, `ui/keys.ts`). Un seul crochet React, `app/useGame.ts`, branche la machine, les minuteries, l'onglet caché, le téléphone tourné et le globe. Les écrans sont des composants React sans logique, stylés d'après les maquettes validées (D1–D17). `App.tsx` choisit l'écran selon `state.screen`.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Vitest 5 (`--project unit`, environnement `node`), Playwright 1.63 ; three 0.186.1 seulement derrière le `GlobeHandle`. Aucun nouveau paquet.

**Spec:** `docs/superpowers/specs/2026-10-05-countrizz-phase2a-design.md` §2, §3, §7, §10, §11 ; décisions D1–D17 et valeurs des maquettes : `docs/superpowers/brainstorm/2026-10-03-phase2a-interface/README.md` et `ecrans/*.html` ; section 5 : `…/section-5-tests-erreurs.md`. Feuille de route : `docs/superpowers/plans/2026-10-06-countrizz-phase2a-1-mise-en-ligne.md` (2A-5 = « Écrans du jeu (spec §3), haptique (§7), erreurs (§10) »). Contrats amont : plan 2A-3 l. 579 (appelant de la machine), plan 2A-4 décision 7 (ticket de vol) et passation (`setSafeArea` à l'entrée du 3-2-1, `errorUi={false}` avec les écrans D16).

## Prérequis

Le plan de l'intro vidéo (`docs/superpowers/plans/2026-10-11-countrizz-intro-video-blender.md`) doit être **fini** avant la Task 1 : vidéos commitées, Task 11 (e2e `intro.spec.ts` et `pwa.spec.ts` réécrits pour la vidéo, budget) et Task 12 (image `countrizz-web:1.7` en ligne). Ce plan modifie `App.tsx`, `Home.tsx` et `home.css`, que l'intro touche aussi ; il ne modifie **aucun** fichier daté par la garde de fraîcheur de `scripts/intro/blender.ts` (`src/intro/temps.ts`, `timeline.ts`, `cadrages.ts`, `scripts/intro/*`).

## Décisions prises en écrivant le plan

1. **Décor des écrans hors partie** (mode, fin, scores, À propos) : la vue d'accueil « lever de Terre » (`globe.home()`, rotation lente `HOME_SPIN_DEG_PER_S`), comme les maquettes F1, S2 et À propos, qui posent toutes la capture d'accueil `acc-16.jpg`. La « vue d'ensemble » du §3 (Fin) est lue comme cette vue : le globe en bas, qui tourne. Coût si faux : remplacer `home()` par `overview()` dans la commande `leaveGame`.
2. **Échelle des maquettes** : `revelation.html`, `drapeaux-sans-tuile.html`, `mode.html`, `fin.html`, `scores.html`, `derniers-ecrans.html`, `a-propos-chargement.html` et `paysage.html` sont en px réels (390 × 844 ou 1440 × 900) : valeurs reprises telles quelles. `question-modes.html`, `hud.html` et `compte-a-rebours.html` sont dessinées sur un téléphone de 300 px : leurs valeurs sont **multipliées par 1,3** (390 / 300) et arrondies. La jauge du chrono fait 14 px, comme la jauge de chargement en px réels (« la même que le chrono », maquette de chargement).
3. **Motifs haptiques** : ceux du prototype essayé par l'utilisateur (`ecrans/haptique.js`), recopiés tels quels. La mauvaise réponse y vaut `[70, 25, 8, 2, 8, 2, 8, 2, 8, 25, 140]`, soit trois `8·2` puis un `8`, alors que la formule du spec §7 en annonce quatre. Le prototype fait foi. Les motifs vivent dans un seul tableau (spec §13.1).
4. **Étiquette « Pays · capitale »** (R3) posée sur la **balise** du pays (`beacon`, pôle d'inaccessibilité, déjà utilisée pour les micro-États), pointe vers le bas, au-dessus du point : elle ne masque pas un micro-État.
5. **Crochets des e2e** (actifs en dev, ou avec le drapeau `countrizz:e2e` comme `window.__globe`) : `?partie=<ms>` (durée nette de 1 000 à 60 000 ms) et `?graine=<entier>` (tirage rejouable) ; `window.__game` expose l'état. Sans le drapeau, rien de tout cela n'existe.
6. **Erreur du globe pendant une partie** (chargement, recréation ratée après perte du GPU) : la partie est quittée et l'écran d'erreur D16 s'affiche (texte de la maquette : « la partie en cours est perdue »). Une perte du GPU **réussie** ne touche pas la partie (le contrôleur garde l'état).
7. **Téléphone en paysage** = pointeur grossier (`pointer: coarse`), largeur > hauteur et hauteur < 500 px : écran « Tourne ton téléphone » (partout), chrono en pause en partie. Tablette et bureau en paysage : jeu normal (L1).
8. **« Mentions et licences »** : un écran simple qui liste mot pour mot l'attribution EOX, `data/credits.json` et `textures/credits.json` (liste brute, spec §12).
9. **Références visuelles** des nouveaux écrans prises **globe masqué** (`canvas { visibility: hidden }`) : l'interface seule, stable ; le globe a déjà ses références.
10. **Hors de ce plan (2A-6)** : écran de chargement Terre cartoon (D15), avion A2 de l'accueil (D8), PWA hors ligne complète.
11. **Déploiement** : les nouveaux e2e passent en local (`npm run e2e:local`) pendant le plan ; l'image `countrizz-web:1.8` est construite et déployée **sur GO de l'utilisateur** (Task 12), puis la suite complète repasse sur le site.

## Global Constraints

- « **Aucun nouveau paquet** pour le jeu » (spec §1).
- « GitHub : `check` seul. **Le Mac fait foi** (`check && test:data && e2e && budget`) et barre l'image. Test d'abord. » (spec §11)
- « **Chrono net de 60 s** : en pause pendant le vol, la révélation, onglet caché et « Tourne ton téléphone ». À zéro, la question en cours n'est pas comptée. » ; « +10 par bonne réponse, 0 sinon » ; « « Quitter » sans confirmation. Pas de son. » (spec §2)
- « Les ombres des titres sont `-6px 4px 2px rgb(11,13,15)` (valeur de l'ancien jeu, D6) ; la variante à `-4px 3px` sert aux titres plus petits. » (spec §3)
- Couleurs de l'interface : nuit `#16173a`, jaune `#f7dc6f`, violet `#6225e6`, crème `#fff8e7` (`web/src/ui/theme.css`), vert `#2fbf4a`, rouge `#e8413a` (D4, D10).
- « crédit EOX jamais recouvert (`elementFromPoint`, chaque écran avec globe) » (spec §11).
- Contrat de la machine (plan 2A-3) : « à l'entrée en `countdown` et en `flight`, lancer le vol vers `question.cca3`, puis envoyer `ARRIVED` ; envoyer `COUNTDOWN_TICK` chaque seconde en `countdown` ; envoyer `REVEAL_DONE` `REVEAL_MS` après `ANSWER` ; envoyer `TICK` pendant `question` ; envoyer `PAUSE`/`RESUME` à l'onglet caché et au téléphone tourné. » Contrat du globe (plan 2A-4) : « envoyer `ARRIVED` seulement si `arrived === true` ; `setSafeArea` à l'entrée du 3-2-1 (et `null` en sortie) ; `errorUi={false}` avec les écrans D16 ».
- Fichiers datés de l'intro (`src/intro/temps.ts`, `timeline.ts`, `cadrages.ts`, `scripts/intro/*`) : **jamais modifiés**.
- Hooks du poste : pas de `grep`/`sed`/`awk` filtrants (lire en entier, par plages, ou filtrer avec `node -e`) ; e2e locaux par `npm run e2e:local` (serveur de dev sur 5174).
- Écritures hors dépôt (Docker Hub, cluster) : **GO de l'utilisateur sur la commande exacte**.
- Code et commentaires en français, au ton du code voisin ; commits « domaine : quoi — spec 2A §x », terminés par les lignes d'attribution de la session.

## Review Focus

1. **Quitter pendant le premier vol** (3-2-1) : retour à l'accueil, et l'arrivée du vol abandonné ne fait jamais apparaître de question → e2e `game.spec.ts` « quitter pendant le 3-2-1 » (Task 7).
2. **Deux réponses presque simultanées** (double tape, ou tape + touche 1-4) : une seule manche comptée, une seule vibration → `globeCommands.test.ts` (une seule commande `answer` par révélation, Task 4) et e2e « double tape » (Task 6).
3. **Onglet caché pendant un vol ou une révélation, puis retour** : le chrono reprend au temps exact, la manche suivante arrive → e2e « onglet caché » (Task 6).
4. **Stockage bloqué** (navigation privée) : la fin affiche « Ton score ne peut pas être gardé sur cet appareil », l'écran des scores montre la partie pendant la visite → `finish.test.ts` (Task 4) et e2e « stockage bloqué » (Task 7).
5. **Libellés longs sur un petit écran** (360 × 640, « Saint-Vincent-et-les-Grenadines ») : aucun débordement horizontal, la grille tient au-dessus du crédit → `answerLabel.test.ts` (Task 2) et e2e « 360 × 640 » (Task 10).

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `web/src/game/machine.ts` (modifié) | `createGame(countries, gameMs = GAME_MS)` : durée réglable (crochet e2e) |
| `web/src/app/hooks.ts` (nouveau) | drapeau des e2e, `?partie=`, `?graine=`, graine aléatoire |
| `web/src/data/flagRatio.ts` (nouveau) | proportion d'un drapeau SVG (width/height, sinon viewBox) |
| `web/scripts/flags/ratios.ts` (nouveau) | écrit `web/src/data/flagRatios.json` (proportions précalculées, D3) |
| `web/src/ui/flagSize.ts` (nouveau) | taille d'un drapeau à aire égale bornée (D3 · P1) |
| `web/src/ui/answerLabel.ts` (nouveau) | libellé long (≥ 20 caractères) → deux lignes, plus petit (D2) |
| `web/src/ui/haptics.ts` (nouveau) | motifs et moteurs haptiques (§7) |
| `web/src/app/globeCommands.ts` (nouveau) | commandes du globe à chaque changement d'état |
| `web/src/app/finish.ts` (nouveau) | fin de partie : top 10, record, sauvegarde |
| `web/src/app/useGame.ts` (nouveau) | crochet React : machine + minuteries + globe + haptique |
| `web/src/ui/keys.ts` (nouveau) | touches 1-4 → réponse (L1) |
| `web/src/ui/rotate.ts` (nouveau) | téléphone en paysage ? (D5, D16) |
| `web/src/ui/share.ts` (nouveau) | « Partager le jeu » : partage natif, copie, lien (§8) |
| `web/src/ui/GameScreen.tsx`, `Hud.tsx`, `Countdown.tsx`, `Answers.tsx`, `RevealLabel.tsx`, `game.css` (nouveaux) | partie : HUD H2, 3-2-1 C1, grille A/P1, révélation R3 |
| `web/src/ui/ModeScreen.tsx`, `EndScreen.tsx`, `ScoresScreen.tsx`, `screens.css` (nouveaux) | choix du mode A, fin F1, scores S2 |
| `web/src/ui/AboutScreen.tsx`, `LegalScreen.tsx` (nouveaux) | À propos D14, mentions et licences |
| `web/src/ui/GlobeError.tsx`, `RotateScreen.tsx` (nouveaux) | erreurs D16, « Tourne ton téléphone » |
| `web/src/ui/Home.tsx`, `home.css` (modifiés) | « Jouer », « Scores », « À propos » branchés |
| `web/src/app/App.tsx` (modifié) | pays chargés, `useGame`, écran courant, erreurs, rotation |
| `web/e2e/game.spec.ts`, `web/e2e/game-visual.spec.ts` (nouveaux) | parcours, erreurs, rotation, haptique, références visuelles |

---

### Task 1 : durée de partie réglable et crochets des e2e

**Files:**
- Modify: `web/src/game/machine.ts` (signature de `createGame`, horloge de `newGame`)
- Test: `web/src/game/machine.test.ts`
- Create: `web/src/app/hooks.ts`
- Test: `web/src/app/hooks.test.ts`

**Interfaces:**
- Consumes: `createGame(countries)`, `GAME_MS`, `createClock` (2A-3).
- Produces: `createGame(countries: DrawCountry[], gameMs?: number)` ; `E2E_FLAG = 'countrizz:e2e'` ; `hooksEnabled(dev: boolean, storage: KeyValueStorage | null): boolean` ; `e2eOverrides(search: string): { gameMs?: number; seed?: number }` ; `newSeed(override?: number): number`.

- [ ] **Step 1 : écrire les tests (qui échouent)**

Dans `web/src/game/machine.test.ts`, à la fin du `describe` :

```ts
  it('durée de partie réglable (crochet des e2e) : la partie dure gameMs nettes', () => {
    const short = createGame(countries, 8_000);
    const s = toQuestion.reduce(short, initialState('fr'));
    expect(s.screen).toBe('question');
    expect(remainingMs(s.clock, 4_000)).toBe(8_000);
    expect(short(s, { type: 'TICK', now: 11_999 }).screen).toBe('question');
    expect(short(s, { type: 'TICK', now: 12_000 }).screen).toBe('end');
  });
```

`web/src/app/hooks.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { E2E_FLAG, e2eOverrides, hooksEnabled, newSeed } from './hooks';

const stored = (v: string | null) => ({ getItem: (k: string) => (k === E2E_FLAG ? v : null), setItem() {}, removeItem() {} });

describe('crochets des e2e du jeu', () => {
  it('actifs en dev, ou avec le drapeau posé par Playwright ; jamais si le stockage lève', () => {
    expect(hooksEnabled(true, null)).toBe(true);
    expect(hooksEnabled(false, stored('1'))).toBe(true);
    expect(hooksEnabled(false, stored(null))).toBe(false);
    expect(hooksEnabled(false, null)).toBe(false);
    expect(hooksEnabled(false, { getItem() { throw new Error('bloqué'); }, setItem() {}, removeItem() {} })).toBe(false);
  });

  it('?partie= : durée nette entière de 1 000 à 60 000 ms ; ?graine= : entier positif ou nul', () => {
    expect(e2eOverrides('?partie=3000&graine=42')).toEqual({ gameMs: 3000, seed: 42 });
    expect(e2eOverrides('?graine=0')).toEqual({ seed: 0 });
    expect(e2eOverrides('')).toEqual({});
    expect(e2eOverrides('?partie=999&graine=-1')).toEqual({});
    expect(e2eOverrides('?partie=60001&graine=1.5')).toEqual({});
    expect(e2eOverrides('?partie=abc&graine=')).toEqual({});
  });

  it('graine : celle du crochet, sinon un entier aléatoire sur 32 bits', () => {
    expect(newSeed(7)).toBe(7);
    const s = newSeed();
    expect(Number.isInteger(s) && s >= 0 && s < 2 ** 32).toBe(true);
  });
});
```

- [ ] **Step 2 : les lancer**

Run : `cd web && npx vitest run --project unit src/game/machine.test.ts src/app/hooks.test.ts`
Expected : FAIL — `machine.test.ts` « durée de partie réglable » (`remainingMs` vaut 60 000), `hooks.test.ts` ne trouve pas `./hooks`.

- [ ] **Step 3 : le code**

`web/src/game/machine.ts` : la signature devient

```ts
/** `gameMs` : durée nette d'une partie (60 s ; plus courte seulement par le crochet `?partie=` des e2e). */
export function createGame(countries: DrawCountry[], gameMs: number = GAME_MS): (s: GameState, e: GameEvent) => GameState {
```

et dans `newGame`, `clock: createClock(GAME_MS, ['flight'])` devient `clock: createClock(gameMs, ['flight'])`.

`web/src/app/hooks.ts` :

```ts
import type { KeyValueStorage } from '../game/prefs';

/** Drapeau posé par Playwright (playwright.config.ts) : il installe les crochets, comme `window.__globe` (GlobeView). */
export const E2E_FLAG = 'countrizz:e2e';

/** Crochets du jeu (`window.__game`, `?partie=`, `?graine=`) : en dev, ou avec le drapeau ; jamais si le stockage lève. */
export function hooksEnabled(dev: boolean, storage: KeyValueStorage | null): boolean {
  if (dev) return true;
  try { return storage?.getItem(E2E_FLAG) === '1'; } catch { return false; }
}

/** `?partie=3000` : partie courte (1 000 à 60 000 ms nettes) ; `?graine=42` : tirage rejouable. Le reste est ignoré. */
export function e2eOverrides(search: string): { gameMs?: number; seed?: number } {
  const q = new URLSearchParams(search);
  const out: { gameMs?: number; seed?: number } = {};
  const ms = Number(q.get('partie'));
  if (q.get('partie') && Number.isInteger(ms) && ms >= 1000 && ms <= 60_000) out.gameMs = ms;
  const seed = Number(q.get('graine'));
  if (q.get('graine') && Number.isInteger(seed) && seed >= 0) out.seed = seed;
  return out;
}

/** Graine d'une partie : celle du crochet, sinon 32 bits aléatoires. */
export const newSeed = (override?: number): number => override ?? crypto.getRandomValues(new Uint32Array(1))[0]!;
```

- [ ] **Step 4 : les relancer**

Run : `cd web && npx vitest run --project unit src/game/machine.test.ts src/app/hooks.test.ts`
Expected : PASS (tous).

- [ ] **Step 5 : suite et commit**

Run : `cd web && npm run check` — Expected : `tsc` sans erreur, tous les tests unitaires verts (le nombre augmente de 4).

```bash
git add web/src/game/machine.ts web/src/game/machine.test.ts web/src/app/hooks.ts web/src/app/hooks.test.ts
git commit -m "jeu : durée de partie réglable et crochets des e2e (?partie=, ?graine=) — spec 2A §2, §11"
```

---

### Task 2 : libellés longs, proportions et taille des drapeaux

**Files:**
- Create: `web/src/ui/answerLabel.ts`, `web/src/ui/answerLabel.test.ts`
- Create: `web/src/data/flagRatio.ts`, `web/src/data/flagRatio.test.ts`
- Create: `web/scripts/flags/ratios.ts` ; Modify: `web/package.json` (script `flags:ratios`)
- Create (généré, versionné): `web/src/data/flagRatios.json`
- Create: `web/src/ui/flagSize.ts`, `web/src/ui/flagSize.test.ts`

**Interfaces:**
- Produces: `LONG_LABEL = 20` ; `isLongLabel(label: string): boolean` ; `svgRatio(svg: string): number` ; `flagRatios.json` : `Record<cca3, number>` (4 décimales) ; `FLAG_BOX = { width: 150, height: 88, area: 7776 }` ; `flagSize(ratio: number): { width: number; height: number }` ; `SHAPED_FLAGS: ReadonlySet<string>` (`'NPL'`).

- [ ] **Step 1 : écrire les tests (qui échouent)**

`web/src/ui/answerLabel.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { isLongLabel, LONG_LABEL } from './answerLabel';

describe('libellés des réponses (D2)', () => {
  it('à partir de 20 caractères visibles : deux lignes, plus petit', () => {
    expect(LONG_LABEL).toBe(20);
    expect(isLongLabel('Saint-Vincent-et-les-Grenadines')).toBe(true);
    expect(isLongLabel('République centrafricaine')).toBe(true);
    expect(isLongLabel('Sri Jayawardenapura')).toBe(false); // 19 : la capitale la plus longue garde la taille normale
    expect(isLongLabel('a'.repeat(20))).toBe(true);
    expect(isLongLabel('a'.repeat(19))).toBe(false);
  });

  it('dans les données : 6 noms de pays longs en français, aucune capitale', () => {
    const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
    expect(countries.filter((c) => isLongLabel(c.name.fr))).toHaveLength(6);
    expect(countries.filter((c) => isLongLabel(c.capital.fr))).toHaveLength(0);
  });
});
```

`web/src/data/flagRatio.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import ratios from './flagRatios.json';
import { svgRatio } from './flagRatio';
import type { CountryRecord } from './types';

describe('proportions des drapeaux (D3)', () => {
  it('width/height de la balise <svg> priment ; sinon le viewBox', () => {
    expect(svgRatio('<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="550" viewBox="0 0 75 18" preserveAspectRatio="none">')).toBeCloseTo(2.5455, 4);
    expect(svgRatio('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2">')).toBe(1.5);
    expect(svgRatio('<svg version="1.1" width="726" height="885" viewBox="-17.582 -4.664 71.571 87.246">')).toBeCloseTo(0.8203, 4);
    expect(svgRatio('<svg width="100%" height="100%" viewBox="0 0 32 32">')).toBe(1);
    expect(svgRatio('<svg stroke-width="2" viewBox="0 0 2 1">')).toBe(2);
    expect(() => svgRatio('<g/>')).toThrow();
  });

  it('flagRatios.json suit les 197 fichiers de public/data (npm run flags:ratios)', () => {
    const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
    const table = ratios as Record<string, number>;
    expect(Object.keys(table).sort()).toEqual(countries.map((c) => c.cca3).sort());
    for (const c of countries) {
      const r = Math.round(svgRatio(readFileSync(`public/data/${c.flag}`, 'utf8')) * 10_000) / 10_000;
      expect(table[c.cca3], c.cca3).toBe(r);
    }
  });
});
```

`web/src/ui/flagSize.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { FLAG_BOX, flagSize, SHAPED_FLAGS } from './flagSize';

const px = (r: number) => { const s = flagSize(r); return [Math.round(s.width), Math.round(s.height)]; };

describe('drapeaux à aire égale bornée (D3 · P1)', () => {
  it('zone utile 150 × 88, aire 7776 : les cinq formes de la maquette', () => {
    expect(FLAG_BOX).toEqual({ width: 150, height: 88, area: 7776 });
    expect(px(0.8203)).toEqual([72, 88]);   // Népal
    expect(px(1)).toEqual([88, 88]);        // Suisse
    expect(px(1.5)).toEqual([108, 72]);     // France
    expect(px(2)).toEqual([125, 62]);       // 2:1
    expect(px(2.5455)).toEqual([141, 55]);  // Qatar
  });

  it('jamais plus grand que la zone, proportions gardées', () => {
    for (const r of [0.5, 0.8203, 1, 1.25, 1.5, 1.9, 2.5455, 4]) {
      const s = flagSize(r);
      expect(s.width).toBeLessThanOrEqual(150 + 1e-9);
      expect(s.height).toBeLessThanOrEqual(88 + 1e-9);
      expect(s.width / s.height).toBeCloseTo(r, 9);
    }
  });

  it('seul le Népal suit sa forme (contour en drop-shadow)', () => {
    expect([...SHAPED_FLAGS]).toEqual(['NPL']);
  });
});
```

- [ ] **Step 2 : les lancer**

Run : `cd web && npx vitest run --project unit src/ui/answerLabel.test.ts src/data/flagRatio.test.ts src/ui/flagSize.test.ts`
Expected : FAIL — modules introuvables (`./answerLabel`, `./flagRatio`, `./flagRatios.json`, `./flagSize`).

- [ ] **Step 3 : le code**

`web/src/ui/answerLabel.ts` :

```ts
/** D2 : à partir de 20 caractères visibles (6 noms de pays sur 197), le libellé passe sur deux lignes, en plus petit. */
export const LONG_LABEL = 20;

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export const isLongLabel = (label: string): boolean => Array.from(graphemes.segment(label)).length >= LONG_LABEL;
```

`web/src/data/flagRatio.ts` :

```ts
/**
 * Proportion largeur / hauteur d'un drapeau SVG (D3) : `width` et `height` de la balise <svg> quand ce sont des nombres
 * (le viewBox de `qat.svg` ment : 75 × 18 pour un drapeau de 1400 × 550), sinon le viewBox.
 */
export function svgRatio(svg: string): number {
  const tag = /<svg\b[^>]*>/.exec(svg)?.[0];
  if (!tag) throw new Error('drapeau : balise <svg> absente');
  const attr = (name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
  const w = Number(attr('width')), h = Number(attr('height'));
  if (w > 0 && h > 0) return w / h;
  const box = attr('viewBox')?.trim().split(/[\s,]+/).map(Number);
  if (box?.length === 4 && box[2]! > 0 && box[3]! > 0) return box[2]! / box[3]!;
  throw new Error('drapeau : ni width/height ni viewBox');
}
```

`web/scripts/flags/ratios.ts` :

```ts
/**
 * Proportions des 197 drapeaux, précalculées (D3 : « proportions lues dans width/height du SVG, précalculées au build ») :
 * `npm run flags:ratios` écrit `src/data/flagRatios.json` (cca3 → largeur / hauteur, 4 décimales). L'essai
 * `src/data/flagRatio.test.ts` refait le calcul et casse si un drapeau change sans que le fichier suive.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { svgRatio } from '../../src/data/flagRatio';
import type { CountryRecord } from '../../src/data/types';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const table: Record<string, number> = {};
for (const c of [...countries].sort((a, b) => a.cca3.localeCompare(b.cca3))) {
  table[c.cca3] = Math.round(svgRatio(readFileSync(`public/data/${c.flag}`, 'utf8')) * 10_000) / 10_000;
}
writeFileSync('src/data/flagRatios.json', `${JSON.stringify(table, null, 1)}\n`);
console.log(`flagRatios.json : ${Object.keys(table).length} drapeaux`);
```

`web/package.json`, dans `scripts`, après `"imagery:fetch"` : `"flags:ratios": "tsx scripts/flags/ratios.ts",`.

Run : `cd web && npm run flags:ratios` — Expected : `flagRatios.json : 197 drapeaux`.

`web/src/ui/flagSize.ts` :

```ts
/**
 * D3 · P1 : le drapeau garde ses vraies proportions, à **aire égale bornée** (zone utile 150 × 88 px, aire 7776 px²) :
 * Népal 72 × 88, Suisse 88 × 88, France 108 × 72, 2:1 125 × 62, Qatar 141 × 55. Jamais teinté.
 */
export const FLAG_BOX = { width: 150, height: 88, area: 7776 } as const;

export function flagSize(ratio: number): { width: number; height: number } {
  const width = Math.min(FLAG_BOX.width, FLAG_BOX.height * ratio, Math.sqrt(FLAG_BOX.area * ratio));
  return { width, height: width / ratio };
}

/** Drapeaux qui ne sont pas des rectangles : le décor « autocollant » suit leur forme (drop-shadow) au lieu d'un cadre. */
export const SHAPED_FLAGS: ReadonlySet<string> = new Set(['NPL']);
```

- [ ] **Step 4 : les relancer**

Run : `cd web && npx vitest run --project unit src/ui/answerLabel.test.ts src/data/flagRatio.test.ts src/ui/flagSize.test.ts`
Expected : PASS. Si « 6 noms longs » diffère, recopier le nombre réel de la sortie dans le rapport et **s'arrêter** (D2 dit 6 : une donnée a changé).

- [ ] **Step 5 : suite et commit**

Run : `cd web && npm run check` — Expected : vert.

```bash
git add web/src/ui/answerLabel.ts web/src/ui/answerLabel.test.ts web/src/data/flagRatio.ts web/src/data/flagRatio.test.ts web/src/data/flagRatios.json web/scripts/flags/ratios.ts web/package.json web/src/ui/flagSize.ts web/src/ui/flagSize.test.ts
git commit -m "jeu : libellés longs, proportions précalculées et drapeaux à aire égale — spec 2A §3 (D2, D3)"
```

---

### Task 3 : haptique

**Files:**
- Create: `web/src/ui/haptics.ts`, `web/src/ui/haptics.test.ts`

**Interfaces:**
- Consumes: `isIos(userAgent, maxTouchPoints)` (`web/src/pwa/install.ts`), `PREF_KEYS.vibrations` (`web/src/game/prefs.ts`).
- Produces: `type HapticEvent = 'press' | 'release' | 'correct' | 'wrong' | 'countdown' | 'go' | 'record'` ; `PATTERNS` ; `interface HapticEngine { vibrate: ((p: number[]) => void) | null; tick: (() => void) | null; later(fn: () => void, ms: number): void }` ; `createHaptics(engine: HapticEngine, enabled?: boolean): Haptics` avec `play(e): 'off' | 'vibrate' | 'tick' | 'none'`, `enabled`, `setEnabled(v)` ; `browserEngine(): HapticEngine` ; `vibrationsOn(stored: string | null): boolean`.

- [ ] **Step 1 : écrire les tests (qui échouent)**

`web/src/ui/haptics.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createHaptics, PATTERNS, vibrationsOn, type HapticEngine } from './haptics';

function engine(kind: 'android' | 'ios' | 'desktop') {
  const calls: (number[] | 'tick')[] = [];
  const timers: { ms: number; fn: () => void }[] = [];
  const e: HapticEngine = {
    vibrate: kind === 'android' ? (p) => { calls.push(p); } : null,
    tick: kind === 'ios' ? () => { calls.push('tick'); } : null,
    later: (fn, ms) => { timers.push({ ms, fn }); },
  };
  return { e, calls, timers };
}

describe('haptique (spec 2A §7, prototype haptique.js)', () => {
  it('les motifs du prototype, en ms', () => {
    expect(PATTERNS).toEqual({
      press: [9], release: [4], correct: [14, 60, 22], wrong: [70, 25, 8, 2, 8, 2, 8, 2, 8, 25, 140],
      countdown: [18], go: [45], record: [20, 40, 20, 40, 20, 40, 90],
    });
  });

  it('Android : navigator.vibrate reçoit le motif de l’événement', () => {
    const { e, calls } = engine('android');
    const h = createHaptics(e);
    expect(h.play('wrong')).toBe('vibrate');
    expect(h.play('press')).toBe('vibrate');
    expect(calls).toEqual([PATTERNS.wrong, PATTERNS.press]);
  });

  it('iPhone : un tic tout de suite, des tics de rappel à 90 ms d’écart (bonne 1, mauvaise et record 2)', () => {
    const { e, calls, timers } = engine('ios');
    const h = createHaptics(e);
    expect(h.play('wrong')).toBe('tick');
    expect(calls).toEqual(['tick']);
    expect(timers.map((t) => t.ms)).toEqual([90, 180]);
    timers.forEach((t) => t.fn());
    expect(calls).toEqual(['tick', 'tick', 'tick']);
    h.play('correct');
    expect(timers.map((t) => t.ms)).toEqual([90, 180, 90]);
    h.play('press');
    expect(timers).toHaveLength(3);
  });

  it('ordinateur : rien, sans erreur ; réglage coupé : rien ; un moteur qui lève : rien', () => {
    expect(createHaptics(engine('desktop').e).play('go')).toBe('none');
    const { e, calls } = engine('android');
    const h = createHaptics(e, false);
    expect(h.play('record')).toBe('off');
    h.setEnabled(true);
    expect(h.play('record')).toBe('vibrate');
    expect(calls).toHaveLength(1);
    const boom = createHaptics({ vibrate: () => { throw new Error('refusé'); }, tick: null, later: () => {} });
    expect(boom.play('go')).toBe('none');
  });

  it('réglage « Vibrations » : oui par défaut, non seulement si « 0 » est mémorisé', () => {
    expect(vibrationsOn(null)).toBe(true);
    expect(vibrationsOn('1')).toBe(true);
    expect(vibrationsOn('0')).toBe(false);
  });
});
```

- [ ] **Step 2 : les lancer**

Run : `cd web && npx vitest run --project unit src/ui/haptics.test.ts`
Expected : FAIL — `./haptics` introuvable.

- [ ] **Step 3 : le code**

`web/src/ui/haptics.ts` :

```ts
import { isIos } from '../pwa/install';

/**
 * Retours haptiques (spec 2A §7 ; prototype `docs/superpowers/brainstorm/2026-10-03-phase2a-interface/ecrans/haptique.js`,
 * essayé par l'utilisateur le 05/10). Les motifs ne vivent qu'ici : le réglage fin au doigt, après la 2A sur countrizz.fr,
 * ne touche que ce tableau (spec §13.1).
 */
export type HapticEvent = 'press' | 'release' | 'correct' | 'wrong' | 'countdown' | 'go' | 'record';

/** Motifs (ms : vibration, pause, vibration…) ; la mauvaise réponse : choc, grondement haché, long retour de force. */
export const PATTERNS: Readonly<Record<HapticEvent, readonly number[]>> = {
  press: [9], release: [4], correct: [14, 60, 22], wrong: [70, 25, 8, 2, 8, 2, 8, 2, 8, 25, 140],
  countdown: [18], go: [45], record: [20, 40, 20, 40, 20, 40, 90],
};

/** Ce que sait l'appareil : vibrer (Android), « tic » du système (iPhone, iOS 18+), ou rien (ordinateur). */
export interface HapticEngine {
  vibrate: ((pattern: number[]) => void) | null;
  tick: (() => void) | null;
  later(fn: () => void, ms: number): void;
}

export type HapticOutcome = 'off' | 'vibrate' | 'tick' | 'none';

/** iPhone : une seule intensité ; des tics de rappel gardent le rythme (le premier dans le geste, les suivants peuvent être ignorés). */
const EXTRA_TICKS: Partial<Record<HapticEvent, number>> = { correct: 1, wrong: 2, record: 2 };

export function createHaptics(engine: HapticEngine, enabled = true) {
  let on = enabled;
  return {
    get enabled() { return on; },
    setEnabled(v: boolean) { on = v; },
    play(e: HapticEvent): HapticOutcome {
      if (!on) return 'off';
      try {
        if (engine.vibrate) { engine.vibrate([...PATTERNS[e]]); return 'vibrate'; }
        if (engine.tick) {
          engine.tick();
          for (let i = 1; i <= (EXTRA_TICKS[e] ?? 0); i++) engine.later(engine.tick, 90 * i);
          return 'tick';
        }
      } catch { /* jamais d'erreur : l'effet visuel reste */ }
      return 'none';
    },
  };
}
export type Haptics = ReturnType<typeof createHaptics>;

/** « Vibrations » (À propos) : oui par défaut ; `'0'` mémorisé = non. */
export const vibrationsOn = (stored: string | null): boolean => stored !== '0';

/** Le moteur du navigateur : `navigator.vibrate`, sinon l'interrupteur caché d'iOS 18 (basculé pendant le geste). */
export function browserEngine(): HapticEngine {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const vibrate = nav && typeof nav.vibrate === 'function' ? (p: number[]) => { nav.vibrate(p); } : null;
  let toggle: HTMLLabelElement | null = null;
  const tick = !vibrate && nav && isIos(nav.userAgent, nav.maxTouchPoints ?? 0) ? () => {
    if (!toggle) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      label.append(input);
      label.setAttribute('aria-hidden', 'true');
      label.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9px;top:-9px';
      document.body.append(label);
      toggle = label;
    }
    toggle.click();
  } : null;
  return { vibrate, tick, later: (fn, ms) => { setTimeout(fn, ms); } };
}
```

- [ ] **Step 4 : les relancer**

Run : `cd web && npx vitest run --project unit src/ui/haptics.test.ts` — Expected : PASS (5 tests).

- [ ] **Step 5 : suite et commit**

Run : `cd web && npm run check` — Expected : vert.

```bash
git add web/src/ui/haptics.ts web/src/ui/haptics.test.ts
git commit -m "jeu : retours haptiques (motifs du prototype, Android, iPhone, réglage) — spec 2A §7"
```

---

### Task 4 : commandes du globe et fin de partie

**Files:**
- Create: `web/src/app/globeCommands.ts`, `web/src/app/globeCommands.test.ts`
- Create: `web/src/app/finish.ts`, `web/src/app/finish.test.ts`

**Interfaces:**
- Consumes: `createGame`, `initialState`, `GameState` (machine), `insertScore`, `openScoreBook`, `ScoreBook`, `ScoreEntry` (scores), `Tally` (rules), `normalizeName` (prefs).
- Produces: `type GlobeCommand = { kind: 'enterGame' } | { kind: 'fly'; cca3: string; flight: number } | { kind: 'showQuestion' } | { kind: 'answer'; result: 'correct' | 'wrong' } | { kind: 'leaveGame' }` ; `globeCommands(prev: GameState, next: GameState): GlobeCommand[]` ; `interface GameResult { mode; score; correct; total; record; previousBest; rank; saved; entry }` ; `finishGame(book, mode, tally, name, at): GameResult` ; `playerName(name: string, fallback: string): string`.

- [ ] **Step 1 : écrire les tests (qui échouent)**

`web/src/app/globeCommands.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { createGame, initialState, type GameEvent, type GameState } from '../game/machine';
import { globeCommands, type GlobeCommand } from './globeCommands';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const reduce = createGame(countries, 3_000);

/** Rejoue les événements et rend les commandes de chaque transition. */
function play(events: GameEvent[], from: GameState = initialState('fr')) {
  let s = from;
  const steps: { s: GameState; cmds: GlobeCommand[] }[] = [];
  for (const e of events) { const n = reduce(s, e); steps.push({ s: n, cmds: globeCommands(s, n) }); s = n; }
  return steps;
}

const start: GameEvent[] = [{ type: 'PLAY' }, { type: 'CHOOSE_MODE', mode: 'country', seed: 42 }];

describe('commandes du globe à chaque changement d’état', () => {
  it('accueil → mode : rien ; 3-2-1 : entrer en partie et voler vers la première question', () => {
    const [toMode, toCountdown] = play(start);
    expect(toMode!.cmds).toEqual([]);
    expect(toCountdown!.cmds).toEqual([{ kind: 'enterGame' }, { kind: 'fly', cca3: toCountdown!.s.question!.cca3, flight: 1 }]);
  });

  it('arrivée pendant le 3-2-1 : rien ; « GO ! » passé : la question s’affiche une fois', () => {
    const steps = play([...start, { type: 'COUNTDOWN_TICK', now: 1_000 }, { type: 'ARRIVED', flight: 1, now: 1_500 },
      { type: 'COUNTDOWN_TICK', now: 2_000 }, { type: 'COUNTDOWN_TICK', now: 3_000 }, { type: 'COUNTDOWN_TICK', now: 4_000 }]);
    expect(steps.slice(2, 6).map((x) => x.cmds)).toEqual([[], [], [], []]);
    expect(steps[6]!.s.screen).toBe('question');
    expect(steps[6]!.cmds).toEqual([{ kind: 'showQuestion' }]);
  });

  it('réponse : une seule commande answer (une seconde réponse pendant la révélation est ignorée) ; puis vol suivant', () => {
    const [, , , , , , q] = play([...start, { type: 'COUNTDOWN_TICK', now: 1_000 }, { type: 'ARRIVED', flight: 1, now: 1_500 },
      { type: 'COUNTDOWN_TICK', now: 2_000 }, { type: 'COUNTDOWN_TICK', now: 3_000 }, { type: 'COUNTDOWN_TICK', now: 4_000 }]);
    const wrong = (q!.s.question!.answer + 1) % 4;
    const steps = play([{ type: 'ANSWER', index: wrong, now: 4_200 }, { type: 'ANSWER', index: q!.s.question!.answer, now: 4_250 },
      { type: 'REVEAL_DONE', now: 5_700 }], q!.s);
    expect(steps[0]!.cmds).toEqual([{ kind: 'answer', result: 'wrong' }]);
    expect(steps[1]!.cmds).toEqual([]);
    expect(steps[2]!.cmds).toEqual([{ kind: 'fly', cca3: steps[2]!.s.question!.cca3, flight: 2 }]);
    const arrived = play([{ type: 'ARRIVED', flight: 2, now: 7_000 }], steps[2]!.s);
    expect(arrived[0]!.cmds).toEqual([{ kind: 'showQuestion' }]);
    const ok = play([{ type: 'ANSWER', index: arrived[0]!.s.question!.answer, now: 7_100 }], arrived[0]!.s);
    expect(ok[0]!.cmds).toEqual([{ kind: 'answer', result: 'correct' }]);
  });

  it('fin du chrono, ou Quitter pendant le 3-2-1 : sortir de la partie (vue d’accueil)', () => {
    const toQ = play([...start, { type: 'COUNTDOWN_TICK', now: 1_000 }, { type: 'ARRIVED', flight: 1, now: 1_500 },
      { type: 'COUNTDOWN_TICK', now: 2_000 }, { type: 'COUNTDOWN_TICK', now: 3_000 }, { type: 'COUNTDOWN_TICK', now: 4_000 }]);
    const q = toQ[6]!.s;
    expect(play([{ type: 'TICK', now: 7_000 }], q)[0]!.cmds).toEqual([{ kind: 'leaveGame' }]);
    const quit = play([...start, { type: 'QUIT' }]);
    expect(quit[2]!.s.screen).toBe('home');
    expect(quit[2]!.cmds).toEqual([{ kind: 'leaveGame' }]);
  });

  it('fin → scores → fin : rien ; Rejouer : entrer en partie et voler', () => {
    const toQ = play([...start, { type: 'COUNTDOWN_TICK', now: 1_000 }, { type: 'ARRIVED', flight: 1, now: 1_500 },
      { type: 'COUNTDOWN_TICK', now: 2_000 }, { type: 'COUNTDOWN_TICK', now: 3_000 }, { type: 'COUNTDOWN_TICK', now: 4_000 },
      { type: 'TICK', now: 7_000 }]);
    const end = toQ[7]!.s;
    expect(end.screen).toBe('end');
    const steps = play([{ type: 'SHOW_SCORES' }, { type: 'BACK' }, { type: 'REPLAY', seed: 3 }], end);
    expect(steps[0]!.cmds).toEqual([]);
    expect(steps[1]!.cmds).toEqual([]);
    expect(steps[2]!.cmds).toEqual([{ kind: 'enterGame' }, { kind: 'fly', cca3: steps[2]!.s.question!.cca3, flight: steps[2]!.s.flight }]);
  });
});
```

`web/src/app/finish.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '../game/prefs';
import { emptyTally, recordAnswer } from '../game/rules';
import { openScoreBook } from '../game/scores';
import { finishGame, playerName } from './finish';

const memory = (): KeyValueStorage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
};
const blocked: KeyValueStorage = { getItem: () => { throw new Error('bloqué'); }, setItem: () => { throw new Error('bloqué'); }, removeItem: () => {} };
const tally = (oks: boolean[]) => oks.reduce((t, ok, i) => recordAnswer(t, `P${i}`, ok), emptyTally());

describe('fin de partie (spec 2A §3 « Fin », section 5)', () => {
  it('première partie : record, rang 1, gardée ; « 2 bonnes réponses sur 3 »', () => {
    const r = finishGame(openScoreBook(memory()), 'country', tally([true, false, true]), 'Lina', 1000);
    expect(r).toMatchObject({ mode: 'country', score: 20, correct: 2, total: 3, record: true, previousBest: null, rank: 1, saved: true });
    expect(r.entry).toEqual({ name: 'Lina', score: 20, at: 1000 });
  });

  it('partie suivante plus faible : pas de record, ancien record affiché, rang 2', () => {
    const book = openScoreBook(memory());
    finishGame(book, 'flag', tally([true, true, true]), 'Lina', 1000);
    const r = finishGame(book, 'flag', tally([true]), 'Malik', 2000);
    expect(r).toMatchObject({ record: false, previousBest: 30, rank: 2, saved: true });
    expect(book.read('flag').map((e) => e.name)).toEqual(['Lina', 'Malik']);
  });

  it('stockage bloqué : la partie est gardée le temps de la visite, `saved` faux', () => {
    const book = openScoreBook(blocked);
    const r = finishGame(book, 'capital', tally([true]), 'Zoé', 1000);
    expect(r.saved).toBe(false);
    expect(book.read('capital')).toEqual([{ name: 'Zoé', score: 10, at: 1000 }]);
  });

  it('nom du joueur : saisi et recoupé, sinon le nom par défaut', () => {
    expect(playerName('', 'Globetrotteur')).toBe('Globetrotteur');
    expect(playerName('   ', 'Globe-trotter')).toBe('Globe-trotter');
    expect(playerName(' Lina  B ', 'Globetrotteur')).toBe('Lina B');
  });
});
```

- [ ] **Step 2 : les lancer**

Run : `cd web && npx vitest run --project unit src/app/globeCommands.test.ts src/app/finish.test.ts`
Expected : FAIL — `./globeCommands` et `./finish` introuvables.

- [ ] **Step 3 : le code**

`web/src/app/globeCommands.ts` :

```ts
import type { GameState, Screen } from '../game/machine';

/**
 * Ce que le globe doit faire à un changement d'état de la machine (contrat 2A-3 : un vol à l'entrée en `countdown` et en
 * `flight` ; contrat 2A-4 : zone libre à l'entrée du 3-2-1, retirée en sortie). Pur : `useGame` exécute la liste.
 * - `enterGame` : rotation d'accueil arrêtée (la zone libre est posée par l'écran de jeu, qui la mesure) ;
 * - `fly` : vol vers le pays ; `ARRIVED { flight }` seulement si le ticket rend `true` ;
 * - `showQuestion` / `answer` : surbrillance du pays, puis vert ou rouge (R3) ;
 * - `leaveGame` : zone libre retirée, surbrillance effacée, vue d'accueil et rotation lente (décision 1 du plan).
 */
export type GlobeCommand =
  | { kind: 'enterGame' }
  | { kind: 'fly'; cca3: string; flight: number }
  | { kind: 'showQuestion' }
  | { kind: 'answer'; result: 'correct' | 'wrong' }
  | { kind: 'leaveGame' };

const IN_GAME: readonly Screen[] = ['countdown', 'flight', 'question', 'reveal'];
const inGame = (s: GameState) => IN_GAME.includes(s.screen);

export function globeCommands(prev: GameState, next: GameState): GlobeCommand[] {
  const out: GlobeCommand[] = [];
  if (!inGame(prev) && inGame(next)) out.push({ kind: 'enterGame' });
  if (next.flight !== prev.flight && next.question && (next.screen === 'countdown' || next.screen === 'flight')) {
    out.push({ kind: 'fly', cca3: next.question.cca3, flight: next.flight });
  }
  if (next.screen === 'question' && prev.screen !== 'question') out.push({ kind: 'showQuestion' });
  if (next.screen === 'reveal' && prev.screen !== 'reveal' && next.question && next.picked !== null) {
    out.push({ kind: 'answer', result: next.picked === next.question.answer ? 'correct' : 'wrong' });
  }
  if (inGame(prev) && !inGame(next)) out.push({ kind: 'leaveGame' });
  return out;
}
```

`web/src/app/finish.ts` :

```ts
import { normalizeName } from '../game/prefs';
import type { Tally } from '../game/rules';
import { insertScore, type ScoreBook, type ScoreEntry } from '../game/scores';
import type { Mode } from '../game/types';

export interface GameResult {
  mode: Mode;
  score: number;
  correct: number;
  /** Manches répondues (la question en cours au zéro n'est pas comptée). */
  total: number;
  record: boolean;
  previousBest: number | null;
  rank: number | null;
  /** Faux : « Ton score ne peut pas être gardé sur cet appareil » (stockage absent, refusé ou plein). */
  saved: boolean;
  /** L'entrée de la partie : l'écran des scores la montre en violet, « · toi ». */
  entry: ScoreEntry;
}

/** La partie finie entre au top 10 de son mode (spec 2A §3 « Fin » et « Scores », section 5). */
export function finishGame(book: ScoreBook, mode: Mode, tally: Tally, name: string, at: number): GameResult {
  const entry: ScoreEntry = { name, score: tally.score, at };
  const r = insertScore(book.read(mode), entry);
  const saved = book.write(mode, r.list);
  return { mode, score: tally.score, correct: tally.correct, total: tally.rounds.length, record: r.record, previousBest: r.previousBest, rank: r.rank, saved, entry };
}

/** Nom affiché et enregistré : celui du joueur, recoupé, sinon le nom par défaut de la langue (« Globetrotteur »). */
export const playerName = (name: string, fallback: string): string => normalizeName(name, fallback);
```

- [ ] **Step 4 : les relancer**

Run : `cd web && npx vitest run --project unit src/app/globeCommands.test.ts src/app/finish.test.ts` — Expected : PASS (9 tests).

- [ ] **Step 5 : suite et commit**

Run : `cd web && npm run check` — Expected : vert.

```bash
git add web/src/app/globeCommands.ts web/src/app/globeCommands.test.ts web/src/app/finish.ts web/src/app/finish.test.ts
git commit -m "jeu : commandes du globe à chaque état et fin de partie (top 10, record, sauvegarde) — spec 2A §2-3"
```

---

### Task 5 : l'écran de partie — HUD, 3-2-1, grille, révélation

**Files:**
- Create: `web/src/ui/Hud.tsx`, `web/src/ui/Countdown.tsx`, `web/src/ui/Answers.tsx`, `web/src/ui/RevealLabel.tsx`, `web/src/ui/GameScreen.tsx`, `web/src/ui/game.css`
- Test: `web/src/ui/game.test.ts`
- Modify: `web/src/globe/credits.tsx` (`CreditPlacement.zIndex`), `web/src/globe/credits.test.ts`

**Interfaces:**
- Consumes: `Clock`, `isRunning`, `remainingMs` (clock) ; `GameState`, `Question` ; `Messages`, `fill`, `plural` ; `isLongLabel` (Task 2) ; `flagSize`, `SHAPED_FLAGS`, `flagRatios.json` (Task 2) ; `GlobeHandle` (`project`, `onFrame`, `setSafeArea`) ; `Haptics` (Task 3).
- Produces: `hudTime(clock: Clock, now: number): { seconds: number; fraction: number }`, `URGENT_S = 10`, `Hud` ; `Countdown` ; `answerStates(q: Question, picked: number | null): AnswerState[]`, `optionLabel(rec, mode, lang)`, `Answers` ; `RevealLabel` ; `GameScreen({ m, lang, state, records, globe, haptics, onAnswer, onQuit })` ; `CreditPlacement.zIndex?: number`.

Valeurs : maquettes `revelation.html` et `drapeaux-sans-tuile.html` en px réels ; `hud.html` et `compte-a-rebours.html` × 1,3 (décision 2).

- [ ] **Step 1 : écrire les tests (qui échouent)**

`web/src/ui/game.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { createClock, pauseClock, startClock } from '../game/clock';
import { fr } from '../i18n/fr';
import { Answers, answerStates, optionLabel } from './Answers';
import { Countdown } from './Countdown';
import { Hud, hudTime } from './Hud';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const records = new Map(countries.map((c) => [c.cca3, c]));
const q = { cca3: 'VCT', options: ['FRA', 'VCT', 'BEL', 'CHE'], answer: 1 };
const noop = () => {};
const answers = (mode: 'flag' | 'country' | 'capital', picked: number | null, hidden = false) => renderToStaticMarkup(createElement(Answers,
  { m: fr, lang: 'fr', mode, question: q, records, picked, hidden, onAnswer: noop, onPress: noop, onRelease: noop }));

describe('écran de partie (D1-D4, D10, D11)', () => {
  it('HUD : secondes arrondies au-dessus, part de la jauge ; pause et 10 dernières secondes', () => {
    const c = startClock(createClock(60_000), 1_000);
    expect(hudTime(c, 19_000)).toEqual({ seconds: 42, fraction: 0.7 });
    expect(hudTime(c, 60_500).seconds).toBe(1);
    const countdown = renderToStaticMarkup(createElement(Hud, { m: fr, lang: 'fr', clock: createClock(60_000, ['flight']), score: 0, plus: false, onQuit: noop }));
    expect(countdown).toContain('hud-sec--pause');
    expect(countdown).toContain('❚❚ 60');
    expect(countdown).toContain('hud-jauge--pause');
    const t = performance.now();
    const late = renderToStaticMarkup(createElement(Hud, { m: fr, lang: 'fr', clock: startClock(createClock(60_000), t - 52_500), score: 190, plus: true, onQuit: noop }));
    expect(late).toContain('hud-sec--urgent');
    expect(late).toContain('★ 190');
    expect(late).toContain('+10');
    const paused = renderToStaticMarkup(createElement(Hud, { m: fr, lang: 'fr', clock: pauseClock(startClock(createClock(60_000), t - 22_000), 'flight', t), score: 0, plus: false, onQuit: noop }));
    expect(paused).toContain('❚❚ 38');
  });

  it('3-2-1 : chiffres géants, puis « GO ! » dans le pavé violet', () => {
    expect(renderToStaticMarkup(createElement(Countdown, { value: 3, m: fr }))).toContain('<span class="decompte-n">3</span>');
    expect(renderToStaticMarkup(createElement(Countdown, { value: 0, m: fr }))).toContain('<span class="decompte-go">GO !</span>');
  });

  it('grille : libellés du mode et de la langue, libellé long en plus petit ; cachée et inerte pendant le vol', () => {
    expect(optionLabel(records.get('FRA')!, 'capital', 'en')).toBe('Paris');
    expect(optionLabel(records.get('BEL')!, 'country', 'fr')).toBe('Belgique');
    const html = answers('country', null);
    expect(html).toContain('Quel est ce pays ?');
    expect(html.match(/class="reponse[ "]/g)).toHaveLength(4);
    expect(html).toContain('reponse reponse--long');            // Saint-Vincent-et-les-Grenadines
    expect(html).not.toContain('disabled');
    const vol = answers('country', null, true);
    expect(vol).toContain('jeu-bas--cache');
    expect(vol.match(/disabled=""/g)).toHaveLength(4);
  });

  it('révélation R3 : bon vert ✓, choisi faux rouge ✗, autres estompés, tous inertes', () => {
    expect(answerStates(q, null)).toEqual(['idle', 'idle', 'idle', 'idle']);
    expect(answerStates(q, 0)).toEqual(['ko', 'ok', 'dim', 'dim']);
    expect(answerStates(q, 1)).toEqual(['dim', 'ok', 'dim', 'dim']);
    const html = answers('country', 0);
    expect(html).toContain('reponse--ko');
    expect(html).toContain('reponse--ok');
    expect(html.match(/reponse--estompe/g)).toHaveLength(2);
    expect(html).toContain('✓');
    expect(html).toContain('✗');
  });

  it('drapeaux P1 : aire égale, Népal en forme, nom montré à la révélation seulement', () => {
    const q2 = { cca3: 'FRA', options: ['NPL', 'QAT', 'FRA', 'CHE'], answer: 2 };
    const render = (picked: number | null) => renderToStaticMarkup(createElement(Answers,
      { m: fr, lang: 'fr', mode: 'flag', question: q2, records, picked, hidden: false, onAnswer: noop, onPress: noop, onRelease: noop }));
    const html = render(null);
    expect(html).toContain('Quel est son drapeau ?');
    expect(html).toContain('src="/data/flags/fra.svg"');
    expect(html).toContain('width:108px;height:72px');
    expect(html).toContain('class="forme"');
    expect(html).not.toContain('France');
    expect(render(0)).toContain('<span class="reponse-nom">France</span>');
  });
});
```

Dans `web/src/globe/credits.test.ts`, ajouter (avec `import { createElement } from 'react';`, `import { renderToStaticMarkup } from 'react-dom/server';` et `ImageryCredit` importé de `./credits`) :

```ts
  it('le crédit peut passer au-dessus des calques de l’interface (z-index), sans rien perdre de son texte', () => {
    const html = renderToStaticMarkup(createElement(ImageryCredit, { placement: { zIndex: 20 } }));
    expect(html).toContain('z-index:20');
    expect(html).toContain('https://cloudless.eox.at');
  });
```

- [ ] **Step 2 : les lancer**

Run : `cd web && npx vitest run --project unit src/ui/game.test.ts src/globe/credits.test.ts`
Expected : FAIL — `./Answers`, `./Countdown`, `./Hud` introuvables ; `credits.test.ts` : `zIndex` refusé par `tsc` (pas par Vitest) et `z-index:20` absent.

- [ ] **Step 3 : le code**

`web/src/globe/credits.tsx` : `CreditPlacement` gagne `zIndex?: number` (« au-dessus des calques de l'interface : voile et grille de la question, D2 »). Rien d'autre ne change (le `...placement` du style le pose déjà).

`web/src/ui/Hud.tsx` :

```tsx
import { useEffect, useState, type Ref } from 'react';
import { isRunning, remainingMs, type Clock } from '../game/clock';
import type { Lang } from '../game/types';
import { fill, plural, type Messages } from '../i18n';

/** 10 dernières secondes : jauge et chiffres rouges qui clignotent (D10), seulement quand le chrono tourne. */
export const URGENT_S = 10;

/** Secondes affichées (arrondies au-dessus : « 1 » jusqu'au zéro) et part restante de la jauge. */
export function hudTime(clock: Clock, now: number): { seconds: number; fraction: number } {
  const ms = remainingMs(clock, Math.max(now, clock.runningSince ?? now));
  return { seconds: Math.ceil(ms / 1000), fraction: clock.durationMs > 0 ? ms / clock.durationMs : 0 };
}

/** L'heure de la page à chaque image, tant que le chrono tourne (la jauge se vide en continu). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!active) return;
    let id = requestAnimationFrame(function frame(t) { setNow(t); id = requestAnimationFrame(frame); });
    return () => cancelAnimationFrame(id);
  }, [active]);
  return now;
}

interface Props { ref?: Ref<HTMLDivElement>; m: Messages; lang: Lang; clock: Clock; score: number; plus: boolean; onQuit(): void }

/** HUD H2 (D10) : ✕ Quitter, secondes, score ; jauge pleine largeur ; pause = hachures et « ❚❚ » ; « +10 » à la révélation. */
export function Hud({ ref, m, lang, clock, score, plus, onQuit }: Props) {
  const running = isRunning(clock);
  const { seconds, fraction } = hudTime(clock, useNow(running));
  const mod = running ? (seconds <= URGENT_S ? 'urgent' : '') : 'pause';
  return (
    <div ref={ref} className="hud">
      <div className="hud-l1">
        <button type="button" className="hud-quitter" aria-label={m.hud.quit} onClick={onQuit}>✕</button>
        <span className={`hud-sec${mod ? ` hud-sec--${mod}` : ''}`} role="timer"
          aria-label={running ? fill(plural(lang, seconds, m.hud.secondsLeft), { seconds }) : m.hud.paused}>
          {running ? seconds : `❚❚ ${seconds}`}
        </span>
        <div className="hud-score" aria-label={`${m.hud.score} ${score}`}>
          <span>★ {score}</span>
          {plus && <span className="hud-plus" aria-hidden="true">+10</span>}
        </div>
      </div>
      <div className={`hud-jauge${mod ? ` hud-jauge--${mod}` : ''}`} aria-hidden="true"><i style={{ width: `${(fraction * 100).toFixed(2)}%` }} /></div>
    </div>
  );
}
```

`web/src/ui/Countdown.tsx` :

```tsx
import type { Messages } from '../i18n';

/** 3-2-1 C1 (D11) : un chiffre géant par seconde, puis « GO ! » dans le pavé violet ; la clé relance l'animation. */
export function Countdown({ value, m }: { value: number; m: Messages }) {
  return (
    <div className="decompte" aria-live="assertive">
      {value > 0 ? <span key={value} className="decompte-n">{value}</span> : <span key="go" className="decompte-go">{m.countdown.go}</span>}
    </div>
  );
}
```

`web/src/ui/Answers.tsx` :

```tsx
import type { CSSProperties, Ref } from 'react';
import ratios from '../data/flagRatios.json';
import type { CountryRecord } from '../data/types';
import type { Lang, Mode, Question } from '../game/types';
import type { Messages } from '../i18n';
import { isLongLabel } from './answerLabel';
import { flagSize, SHAPED_FLAGS } from './flagSize';

export type AnswerState = 'idle' | 'ok' | 'ko' | 'dim';
const CLASS: Record<AnswerState, string> = { idle: '', ok: 'ok', ko: 'ko', dim: 'estompe' };

/** R3 : pendant la question tout est « idle » ; à la révélation, le bon en vert, le choix faux en rouge, les autres estompés. */
export function answerStates(q: Question, picked: number | null): AnswerState[] {
  return q.options.map((_, i) => (picked === null ? 'idle' : i === q.answer ? 'ok' : i === picked ? 'ko' : 'dim'));
}

/** Libellé d'une réponse : la capitale en mode Capitale, le nom du pays sinon (le mode Drapeau le montre à la révélation). */
export const optionLabel = (rec: CountryRecord, mode: Mode, lang: Lang): string => (mode === 'capital' ? rec.capital[lang] : rec.name[lang]);

interface Props {
  ref?: Ref<HTMLDivElement>;
  m: Messages; lang: Lang; mode: Mode; question: Question; records: ReadonlyMap<string, CountryRecord>;
  /** Réponse choisie pendant la révélation, sinon `null`. */
  picked: number | null;
  /** 3-2-1 et vol : question et grille gardent leur place (la zone libre se mesure) mais restent cachées et inertes. */
  hidden: boolean;
  onAnswer(index: number): void; onPress(): void; onRelease(): void;
}

function Badge({ state }: { state: AnswerState }) {
  if (state === 'ok') return <span className="reponse-badge reponse-badge--v" aria-hidden="true">✓</span>;
  if (state === 'ko') return <span className="reponse-badge reponse-badge--x" aria-hidden="true">✗</span>;
  return null;
}

/** La question juste au-dessus de la grille 2×2 (D1), boutons violets inclinés (D2) ou drapeaux autocollants (D3). */
export function Answers({ ref, m, lang, mode, question, records, picked, hidden, onAnswer, onPress, onRelease }: Props) {
  const states = answerStates(question, picked);
  const recs = question.options.map((c) => records.get(c)!);
  const locked = picked !== null || hidden;
  const press = { onPointerDown: onPress, onPointerUp: onRelease };
  return (
    <div ref={ref} className={`jeu-bas${hidden ? ' jeu-bas--cache' : ''}`}>
      <h2 className="jeu-question">{m.prompts[mode]}</h2>
      {mode === 'flag' ? (
        <div className="reponses reponses--drapeaux">
          {recs.map((r, i) => {
            const s = flagSize((ratios as Record<string, number>)[r.cca3] ?? 1.5);
            const w = Math.round(s.width * 10) / 10, h = Math.round(s.height * 10) / 10;
            const st = states[i]!;
            return (
              <button key={r.cca3} type="button" disabled={locked} aria-label={`${m.modes.flag} ${i + 1}`}
                className={`reponse-drapeau${st !== 'idle' ? ` reponse-drapeau--${CLASS[st]}` : ''}`}
                style={{ '--w': `${w}px`, '--h': `${h}px` } as CSSProperties} {...press} onClick={() => onAnswer(i)}>
                <img src={`/data/${r.flag}`} alt="" draggable={false} style={{ width: w, height: h }} className={SHAPED_FLAGS.has(r.cca3) ? 'forme' : undefined} />
                <span className="reponse-touche" aria-hidden="true">{i + 1}</span>
                <Badge state={st} />
                {(st === 'ok' || st === 'ko') && <span className="reponse-nom">{r.name[lang]}</span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="reponses">
          {recs.map((r, i) => {
            const label = optionLabel(r, mode, lang);
            const st = states[i]!;
            return (
              <button key={r.cca3} type="button" disabled={locked} {...press} onClick={() => onAnswer(i)}
                className={`reponse${isLongLabel(label) ? ' reponse--long' : ''}${st !== 'idle' ? ` reponse--${CLASS[st]}` : ''}`}>
                <span className="reponse-touche" aria-hidden="true">{i + 1}</span>
                <span>{label}</span>
                <Badge state={st} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

`web/src/ui/RevealLabel.tsx` :

```tsx
import { useEffect, useRef } from 'react';
import type { CountryRecord } from '../data/types';
import type { Lang } from '../game/types';
import type { GlobeHandle } from '../globe/GlobeView';

/**
 * R3 : l'étiquette autocollant « Pays · capitale » posée sur le pays, sa pointe sur la balise (`beacon` : le pôle
 * d'inaccessibilité, qui montre aussi les micro-États) ; recalée à chaque image du globe, cachée derrière l'horizon.
 */
export function RevealLabel({ globe, rec, lang }: { globe: GlobeHandle | null; rec: CountryRecord; lang: Lang }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!globe) return;
    const place = () => {
      const p = globe.project(rec.beacon);
      const d = el.current;
      if (!d) return;
      d.style.visibility = p?.visible ? 'visible' : 'hidden';
      if (p) d.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, calc(-100% - 16px)) rotate(-3deg)`;
    };
    place();
    return globe.onFrame(place);
  }, [globe, rec]);
  return <div ref={el} className="etiquette" aria-hidden="true" style={{ visibility: 'hidden' }}>{rec.name[lang]} · <small>{rec.capital[lang]}</small></div>;
}
```

`web/src/ui/GameScreen.tsx` :

```tsx
import { useLayoutEffect, useRef } from 'react';
import type { CountryRecord } from '../data/types';
import type { GameState } from '../game/machine';
import type { Lang } from '../game/types';
import type { GlobeHandle } from '../globe/GlobeView';
import { fill, type Messages } from '../i18n';
import { Answers, optionLabel } from './Answers';
import { Countdown } from './Countdown';
import type { Haptics } from './haptics';
import { Hud } from './Hud';
import { RevealLabel } from './RevealLabel';
import './game.css';

interface Props {
  m: Messages; lang: Lang; state: GameState; records: ReadonlyMap<string, CountryRecord>; globe: GlobeHandle | null; haptics: Haptics;
  onAnswer(index: number): void; onQuit(): void;
}

/** Marge sous le HUD avant la zone libre (px). */
const HUD_GAP = 8;

/**
 * Une partie (3-2-1, vol, question, révélation) sur le globe plein écran : HUD en haut, question et grille en bas sur le
 * voile (D1). La zone libre entre les deux (contrat 2A-4) est mesurée et donnée au globe dès le 3-2-1, puis à chaque
 * changement de taille : le pays s'y cadre et s'y centre.
 */
export function GameScreen({ m, lang, state, records, globe, haptics, onAnswer, onQuit }: Props) {
  const hud = useRef<HTMLDivElement>(null);
  const bas = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!globe) return;
    const measure = () => {
      const h = hud.current?.getBoundingClientRect(), b = bas.current?.getBoundingClientRect();
      if (h && b) globe.setSafeArea({ top: h.bottom + HUD_GAP, bottom: innerHeight - b.top });
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of [hud.current, bas.current]) if (el) ro.observe(el);
    addEventListener('resize', measure);
    return () => { ro.disconnect(); removeEventListener('resize', measure); };
  }, [globe, state.mode]);

  const q = state.question, mode = state.mode;
  const rec = q ? records.get(q.cca3) : undefined;
  const revealing = state.screen === 'reveal' && !!q && state.picked !== null;
  const ok = revealing && state.picked === q!.answer;
  const answer = q && mode ? records.get(q.options[q.answer]!) : undefined;
  return (
    <div className={`jeu${mode === 'flag' ? ' jeu--drapeau' : ''}`}>
      <div className="jeu-voile" aria-hidden="true" />
      <Hud ref={hud} m={m} lang={lang} clock={state.clock} score={state.tally.score} plus={ok} onQuit={onQuit} />
      {state.screen === 'countdown' && <Countdown value={state.countdown} m={m} />}
      {q && mode && (
        <Answers ref={bas} m={m} lang={lang} mode={mode} question={q} records={records} picked={revealing ? state.picked : null}
          hidden={state.screen === 'countdown' || state.screen === 'flight'} onAnswer={onAnswer}
          onPress={() => haptics.play('press')} onRelease={() => haptics.play('release')} />
      )}
      {revealing && rec && <RevealLabel globe={globe} rec={rec} lang={lang} />}
      <p className="sr" aria-live="polite">
        {revealing && answer && mode ? fill(ok ? m.reveal.correct : m.reveal.wrong, { answer: optionLabel(answer, mode, lang) }) : ''}
      </p>
    </div>
  );
}
```

`web/src/ui/game.css` :

```css
/* Écrans de partie (spec 2A §3 ; maquettes revelation.html et drapeaux-sans-tuile.html en px réels 390 × 844 ; hud.html et
   compte-a-rebours.html dessinées sur 300 px : × 1,3, décision 2 du plan 2A-5). */
.jeu { position: absolute; inset: 0; pointer-events: none; font-family: var(--cartoon); }
.jeu > * { pointer-events: auto; }
.jeu-voile { position: absolute; left: 0; right: 0; bottom: 0; height: 300px; pointer-events: none; background: linear-gradient(to bottom, rgba(22, 23, 58, 0), rgba(22, 23, 58, .94) 34%); }
.jeu--drapeau .jeu-voile { height: 380px; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

/* HUD H2 (D10) */
.hud { position: absolute; top: calc(54px + env(safe-area-inset-top, 0px)); left: 16px; right: 16px; }
.hud-l1 { display: flex; align-items: center; gap: 13px; }
.hud-quitter { flex: none; width: 42px; height: 42px; padding: 0; border-radius: 50%; background: var(--nuit); color: var(--jaune); border: 2px solid #000; box-shadow: 3px 3px 0 #000; display: grid; place-items: center; font: 16px var(--cartoon); cursor: pointer; }
.hud-sec { min-width: 57px; color: var(--jaune); font-size: 26px; text-shadow: 4px 3px 1px #000; font-variant-numeric: tabular-nums; }
.hud-sec--pause { color: rgba(247, 220, 111, .75); font-size: 18px; }
.hud-sec--urgent { color: #ff8a80; }
.hud-score { position: relative; margin-left: auto; background: var(--nuit); color: var(--jaune); border: 2px solid #000; box-shadow: 4px 4px 0 #000; padding: 4px 13px; font-size: 18px; transform: skewX(-15deg); white-space: nowrap; }
.hud-score > span:first-child { display: inline-block; transform: skewX(15deg); }
.hud-plus { position: absolute; right: 4px; top: 36px; color: #2fbf4a; font-size: 22px; text-shadow: 3px 2px 0 #000; transform: skewX(15deg); animation: hud-plus .9s ease-out both; }
@keyframes hud-plus { from { opacity: 0; translate: 0 8px; scale: .6; } 25% { opacity: 1; translate: 0 0; scale: 1.15; } to { opacity: 1; scale: 1; } }
.hud-jauge { position: relative; margin-top: 13px; height: 14px; background: rgba(22, 23, 58, .85); border: 2px solid #000; border-radius: 8px; box-shadow: 3px 3px 0 #000; overflow: hidden; }
.hud-jauge > i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--jaune); border-right: 2px solid #000; }
.hud-jauge--pause > i { background: repeating-linear-gradient(-45deg, rgba(247, 220, 111, .55) 0 8px, rgba(247, 220, 111, .3) 8px 16px); }
.hud-jauge--urgent > i { background: #e8413a; animation: hud-clign 1s steps(2) infinite; }
@keyframes hud-clign { 50% { opacity: .55; } }

/* 3-2-1 C1 (D11) : chaque chiffre surgit, tient, puis s'envole en grossissant ; « GO ! » dans le pavé violet. */
.decompte { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
.decompte > * { grid-area: 1 / 1; animation: decompte 1s linear both; }
.decompte-n { font-size: 195px; line-height: 1; color: var(--jaune); text-shadow: -12px 8px 3px rgb(11, 13, 15); -webkit-text-stroke: 4px #000; }
.decompte-go { font-size: 83px; color: #fff; background: var(--violet); border: 4px solid #000; box-shadow: 10px 10px 0 #000; padding: 8px 34px 13px; animation-name: decompte-go; }
@keyframes decompte { 0% { opacity: 0; transform: scale(.3); } 18% { opacity: 1; transform: scale(1.18); } 35% { transform: scale(1); } 84% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.7); } }
@keyframes decompte-go { 0% { opacity: 0; transform: scale(.3) rotate(-8deg); } 18% { opacity: 1; transform: scale(1.15) rotate(-4deg); } 35% { transform: scale(1) rotate(-4deg); } 80% { opacity: 1; transform: scale(1) rotate(-4deg); } 100% { opacity: 0; transform: scale(1.4) rotate(-4deg); } }

/* Question et grille (D1, D2), sous le voile ; le crédit EOX garde sa ligne en dessous (padding bas). */
.jeu-bas { position: absolute; left: 16px; right: 16px; bottom: 0; padding-bottom: calc(34px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 12px; }
.jeu-bas--cache > * { visibility: hidden; }
.jeu-question { margin: 0; text-align: center; color: var(--jaune); font: 19px var(--cartoon); text-shadow: 4px 2px 1px #000; }
.reponses { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; }
.reponse { position: relative; min-height: 56px; padding: 4px 10px; background: var(--violet); color: #fff; border: 2px solid #000; box-shadow: 6px 6px 0 #000; transform: skewX(-15deg); display: grid; place-items: center; font: 15px/1.15 var(--cartoon); text-align: center; cursor: pointer; transition: translate .06s, box-shadow .06s; }
.reponse > span { display: block; transform: skewX(15deg); }
.reponse--long { font-size: 12px; }
.reponse:active:not(:disabled) { translate: 4px 4px; box-shadow: 2px 2px 0 #000; }
.reponse:focus-visible { outline: 3px solid var(--jaune); outline-offset: 4px; }
.reponse:disabled { cursor: default; }
.reponse--ok { background: #2fbf4a; }
.reponse--ko { background: #e8413a; animation: secousse .4s; }
.reponse--estompe { opacity: .35; }
.reponse-badge { position: absolute; right: -10px; top: -14px; width: 30px; height: 30px; border-radius: 50%; border: 2.5px solid #000; display: grid; place-items: center; color: #fff; font: 700 17px system-ui, sans-serif; box-shadow: 2px 2px 0 #000; }
.reponse > .reponse-badge { transform: skewX(15deg); }
.reponse-badge--v { background: #2fbf4a; }
.reponse-badge--x { background: #e8413a; }
.reponse > .reponse-touche, .reponse-drapeau > .reponse-touche { display: none; }
@keyframes secousse { 20% { translate: -6px 0; } 40% { translate: 6px 0; } 60% { translate: -4px 0; } 80% { translate: 3px 0; } }

/* Drapeaux P1 (D3) : la case est un bouton invisible ; décor « autocollant » ; jamais teinté. */
.reponses--drapeaux { gap: 10px 16px; }
.reponse-drapeau { position: relative; height: 112px; padding: 0; background: none; border: 0; display: grid; place-items: center; cursor: pointer; }
.reponse-drapeau img { display: block; border-radius: 4px; box-shadow: 0 0 0 3px #fff8e7, 0 0 0 5.5px #000, 6px 6px 0 5.5px #000; transition: translate .06s, box-shadow .06s; }
.reponse-drapeau img.forme { border-radius: 0; box-shadow: none;
  filter: drop-shadow(2px 0 0 #fff8e7) drop-shadow(-2px 0 0 #fff8e7) drop-shadow(0 2px 0 #fff8e7) drop-shadow(0 -2px 0 #fff8e7)
    drop-shadow(1.5px 0 0 #000) drop-shadow(-1.5px 0 0 #000) drop-shadow(0 1.5px 0 #000) drop-shadow(0 -1.5px 0 #000) drop-shadow(5px 5px 0 #000); }
.reponse-drapeau:active:not(:disabled) img { translate: 4px 4px; }
.reponse-drapeau:active:not(:disabled) img:not(.forme) { box-shadow: 0 0 0 3px #fff8e7, 0 0 0 5.5px #000, 2px 2px 0 5.5px #000; }
.reponse-drapeau:focus-visible { outline: none; }
.reponse-drapeau:focus-visible img { outline: 3px solid var(--jaune); outline-offset: 8px; }
.reponse-drapeau:disabled { cursor: default; }
.reponse-drapeau--ok img:not(.forme) { box-shadow: 0 0 0 3px #fff8e7, 0 0 0 7px #2fbf4a, 0 0 0 9.5px #000, 6px 6px 0 9.5px #000; }
.reponse-drapeau--ko { animation: secousse .4s; }
.reponse-drapeau--estompe img { opacity: .35; }
.reponse-drapeau .reponse-badge { right: auto; left: calc(50% + var(--w) / 2 - 14px); top: calc(50% - var(--h) / 2 - 16px); }
.reponse-nom { position: absolute; bottom: -6px; left: 0; right: 0; text-align: center; font: 12px var(--cartoon); color: #fff; text-shadow: 2px 1px 1px #000; }

/* Étiquette R3 (D4) : autocollant crème, pointe vers le pays. */
.etiquette { position: absolute; left: 0; top: 0; white-space: nowrap; background: #fff8e7; color: var(--nuit); border: 3px solid #000; box-shadow: 5px 5px 0 #000; border-radius: 10px; padding: 6px 14px; font: 19px var(--cartoon); pointer-events: none; }
.etiquette::after { content: ''; position: absolute; left: 50%; bottom: -15px; transform: translateX(-50%); border: 10px solid transparent; border-top: 12px solid #000; border-bottom: 0; }
.etiquette small { font-size: 15px; color: var(--violet); }

@media (prefers-reduced-motion: reduce) {
  .decompte > *, .hud-plus, .hud-jauge--urgent > i, .reponse--ko, .reponse-drapeau--ko { animation: none; }
}
```

- [ ] **Step 4 : les relancer**

Run : `cd web && npx vitest run --project unit src/ui/game.test.ts src/globe/credits.test.ts` — Expected : PASS (6 tests).

- [ ] **Step 5 : suite et commit**

Run : `cd web && npm run check` — Expected : `tsc` sans erreur, tous verts. (Les écrans ne sont pas encore montés : aucune image ne change.)

```bash
git add web/src/ui/Hud.tsx web/src/ui/Countdown.tsx web/src/ui/Answers.tsx web/src/ui/RevealLabel.tsx web/src/ui/GameScreen.tsx web/src/ui/game.css web/src/ui/game.test.ts web/src/globe/credits.tsx web/src/globe/credits.test.ts
git commit -m "jeu : écran de partie (HUD H2, 3-2-1 C1, grille A et drapeaux P1, révélation R3) — spec 2A §3 (D1-D4, D10, D11)"
```

---

### Task 6 : choix du mode, fin de partie, scores

**Files:**
- Create: `web/src/ui/ModeScreen.tsx`, `web/src/ui/EndScreen.tsx`, `web/src/ui/ScoresScreen.tsx`, `web/src/ui/screens.css`
- Test: `web/src/ui/screens.test.ts`

**Interfaces:**
- Consumes: `MODES`, `Mode`, `Lang` ; `ScoreBook` ; `Round` (rules) ; `GameResult` (Task 4) ; `Messages`, `fill`, `plural`.
- Produces: `bestScores(book: ScoreBook): Record<Mode, number | null>` ; `ModeScreen({ m, name, best, onChoose, onBack })` ; `fillBold(template, vars): ReactNode[]` ; `EndScreen({ m, lang, name, result, rounds, records, onReplay, onChangeMode, onScores })` ; `ScoresScreen({ m, initialMode, book, me, onBack, onReplay })` ; classes communes `.ecran`, `.ecran-retour`, `.ecran-titre`, `.bouton-violet`, `.bouton-nuit` (réutilisées par les Tasks 8 et 9).

- [ ] **Step 1 : écrire les tests (qui échouent)**

`web/src/ui/screens.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GameResult } from '../app/finish';
import type { CountryRecord } from '../data/types';
import type { KeyValueStorage } from '../game/prefs';
import { openScoreBook } from '../game/scores';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import { EndScreen } from './EndScreen';
import { bestScores, ModeScreen } from './ModeScreen';
import { ScoresScreen } from './ScoresScreen';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const records = new Map(countries.map((c) => [c.cca3, c]));
const memory = (): KeyValueStorage => { const m = new Map<string, string>(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } }; };
const noop = () => {};
const result = (p: Partial<GameResult>): GameResult => ({ mode: 'country', score: 190, correct: 19, total: 24, record: true, previousBest: 160, rank: 3, saved: true, entry: { name: 'Globetrotteur', score: 190, at: 3 }, ...p });

describe('écrans hors partie (D9, D12, D13)', () => {
  it('choix du mode A : trois boutons, étoiles 1 à 3, record en pastille, « Nouveau » si jamais joué', () => {
    const book = openScoreBook(memory());
    book.write('flag', [{ name: 'Lina', score: 18, at: 1 }]);
    book.write('capital', [{ name: 'Lina', score: 0, at: 2 }]);
    expect(bestScores(book)).toEqual({ flag: 18, country: null, capital: 0 });
    const html = renderToStaticMarkup(createElement(ModeScreen, { m: fr, name: 'Globetrotteur', best: bestScores(book), onChoose: noop, onBack: noop }));
    expect(html).toContain('Choisis ton mode');
    expect(html).toContain('Joueur : <b>Globetrotteur</b>');
    expect(html.match(/class="mode-bouton"/g)).toHaveLength(3);
    expect(html).toContain('<small>Record</small> 18');
    expect(html).toContain('record record--nouveau');
    expect(html).toContain('★<span class="etoiles-off">★★</span>');
  });

  it('fin F1 : score, « 19 bonnes réponses sur 24 », ancien record, tampon, drapeaux (erreurs grisées)', () => {
    const rounds = [{ cca3: 'FRA', ok: true }, { cca3: 'EST', ok: false }];
    const html = renderToStaticMarkup(createElement(EndScreen, { m: fr, lang: 'fr', name: 'Globetrotteur', result: result({}), rounds, records, onReplay: noop, onChangeMode: noop, onScores: noop }));
    expect(html).toContain('Temps écoulé !');
    expect(html).toContain('Mode Pays · Globetrotteur');
    expect(html).toContain('<div class="fin-score">190</div>');
    expect(html).toContain('<b>19</b> bonnes réponses sur <b>24</b>');
    expect(html).toContain('Ancien record : 160');
    expect(html).toContain('Nouveau record !');
    expect(html.match(/class="fin-escale[ "]/g)).toHaveLength(2);
    expect(html).toContain('fin-escale ko');
    expect(html).not.toContain('Ton score ne peut pas');
    const lost = renderToStaticMarkup(createElement(EndScreen, { m: en, lang: 'en', name: 'Globetrotter', result: result({ record: false, previousBest: null, saved: false, score: 10, correct: 1, total: 1 }), rounds: [], records, onReplay: noop, onChangeMode: noop, onScores: noop }));
    expect(lost).not.toContain('fin-tampon');
    expect(lost).toContain(en.end.notSaved);
    expect(lost).toContain('<b>1</b>');
  });

  it('scores S2 : onglet du mode, 1ᵉʳ en jaune, la partie du joueur en violet « · toi », liste vide', () => {
    const book = openScoreBook(memory());
    book.write('country', [{ name: 'Lina', score: 240, at: 1 }, { name: 'Globetrotteur', score: 190, at: 3 }]);
    const html = renderToStaticMarkup(createElement(ScoresScreen, { m: fr, initialMode: 'country', book, me: result({}), onBack: noop, onReplay: noop }));
    expect(html).toContain('Top scores');
    expect(html).toContain('aria-selected="true" class="onglet"><span>Pays</span>');
    expect(html).toContain('scores-ligne scores-ligne--premier');
    expect(html).toContain('scores-ligne scores-ligne--toi');
    expect(html).toContain('Globetrotteur · toi');
    const empty = renderToStaticMarkup(createElement(ScoresScreen, { m: fr, initialMode: 'flag', book, me: null, onBack: noop, onReplay: noop }));
    expect(empty).toContain('Pas encore de score dans ce mode');
  });
});
```

- [ ] **Step 2 : les lancer**

Run : `cd web && npx vitest run --project unit src/ui/screens.test.ts`
Expected : FAIL — `./EndScreen`, `./ModeScreen`, `./ScoresScreen` introuvables.

- [ ] **Step 3 : le code**

`web/src/ui/ModeScreen.tsx` :

```tsx
import { MODES, type Mode } from '../game/types';
import type { ScoreBook } from '../game/scores';
import type { Messages } from '../i18n';
import './screens.css';

/** Étoiles de difficulté (D9) : Drapeau 1, Pays 2, Capitale 3. */
const STARS: Record<Mode, number> = { flag: 1, country: 2, capital: 3 };

/** Meilleur score local de chaque mode ; `null` : jamais joué (« Nouveau »). */
export const bestScores = (book: ScoreBook): Record<Mode, number | null> =>
  Object.fromEntries(MODES.map((mode) => [mode, book.read(mode)[0]?.score ?? null])) as Record<Mode, number | null>;

interface Props { m: Messages; name: string; best: Record<Mode, number | null>; onChoose(mode: Mode): void; onBack(): void }

/** Choix du mode A (D9) : les boutons inclinés de « Jouer », empilés ; décor de l'accueil. */
export function ModeScreen({ m, name, best, onChoose, onBack }: Props) {
  return (
    <div className="ecran mode">
      <button type="button" className="ecran-retour" onClick={onBack}><span>{m.mode.back}</span></button>
      <p className="mode-joueur">{m.mode.player} <b>{name}</b></p>
      <h1 className="ecran-titre">{m.mode.choose}</h1>
      <div className="mode-liste">
        {MODES.map((mode) => (
          <button key={mode} type="button" className="mode-bouton" onClick={() => onChoose(mode)}>
            <span className="mode-nom">
              <span>{m.modes[mode]}</span>
              <span className="etoiles" aria-hidden="true">{'★'.repeat(STARS[mode])}<span className="etoiles-off">{'★'.repeat(3 - STARS[mode])}</span></span>
            </span>
            {best[mode] === null
              ? <span className="record record--nouveau">{m.mode.new}</span>
              : <span className="record"><small>{m.mode.record}</small> {best[mode]}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
```

`web/src/ui/EndScreen.tsx` :

```tsx
import type { ReactNode } from 'react';
import type { GameResult } from '../app/finish';
import type { CountryRecord } from '../data/types';
import type { Round } from '../game/rules';
import type { Lang } from '../game/types';
import { fill, plural, type Messages } from '../i18n';
import './screens.css';

/** `fill`, les valeurs en gras (« <b>19</b> bonnes réponses sur <b>24</b> », maquette F1). */
export function fillBold(template: string, vars: Record<string, string | number>): ReactNode[] {
  return template.split(/(\{\w+\})/).map((part, i) => {
    const k = /^\{(\w+)\}$/.exec(part)?.[1];
    if (!k) return part;
    if (!(k in vars)) throw new Error(`fillBold : valeur manquante pour {${k}}`);
    return <b key={i}>{vars[k]}</b>;
  });
}

interface Props {
  m: Messages; lang: Lang; name: string; result: GameResult; rounds: Round[]; records: ReadonlyMap<string, CountryRecord>;
  onReplay(): void; onChangeMode(): void; onScores(): void;
}

/** Fin F1 (D12) : carte crème en haut (score, bonnes réponses, ancien record, tampon, drapeaux de la partie), globe en bas. */
export function EndScreen({ m, lang, name, result, rounds, records, onReplay, onChangeMode, onScores }: Props) {
  return (
    <div className="ecran fin">
      <div className="fin-haut">
        <div>
          <h1 className="fin-titre">{m.end.timeUp}</h1>
          <p className="fin-mode">{fill(m.end.modeLine, { mode: m.modes[result.mode], name })}</p>
        </div>
        <div className="fin-carte">
          {result.record && <span className="fin-tampon">{m.end.newRecord}</span>}
          <div className="fin-score">{result.score}</div>
          <div className="fin-points">{plural(lang, result.score, m.end.points)}</div>
          <p className="fin-bonnes">{fillBold(plural(lang, result.correct, m.end.correctOf), { correct: result.correct, total: result.total })}</p>
          {result.previousBest !== null && <p className="fin-ancien">{fill(m.end.previousRecord, { score: result.previousBest })}</p>}
          <div className="fin-escales">
            {rounds.map((r, i) => {
              const rec = records.get(r.cca3);
              return <span key={i} className={`fin-escale${r.ok ? '' : ' ko'}`} title={rec?.name[lang]} style={{ backgroundImage: rec ? `url(/data/${rec.flag})` : undefined }} />;
            })}
          </div>
          {!result.saved && <p className="fin-perdu">{m.end.notSaved}</p>}
        </div>
        <div className="fin-boutons">
          <button type="button" className="bouton-violet fin-rejouer" onClick={onReplay}><span>{m.end.replay}</span></button>
          <div className="fin-rang2">
            <button type="button" className="bouton-nuit" onClick={onChangeMode}><span>{m.end.changeMode}</span></button>
            <button type="button" className="bouton-nuit" onClick={onScores}><span>{m.end.scores}</span></button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

`web/src/ui/ScoresScreen.tsx` :

```tsx
import { useState } from 'react';
import type { GameResult } from '../app/finish';
import type { ScoreBook } from '../game/scores';
import { MODES, type Mode } from '../game/types';
import type { Messages } from '../i18n';
import './screens.css';

interface Props { m: Messages; initialMode: Mode; book: ScoreBook; me: GameResult | null; onBack(): void; onReplay(mode: Mode): void }

/** Scores S2 (D13) : top 10 local du mode en bandes inclinées, 1ᵉʳ en jaune, la partie du joueur en violet « · toi ». */
export function ScoresScreen({ m, initialMode, book, me, onBack, onReplay }: Props) {
  const [tab, setTab] = useState<Mode>(initialMode);
  const list = book.read(tab);
  return (
    <div className="ecran scores">
      <button type="button" className="ecran-retour" onClick={onBack}><span>{m.scores.back}</span></button>
      <h1 className="ecran-titre">{m.scores.title}</h1>
      <div className="scores-corps">
        <div className="onglets" role="tablist">
          {MODES.map((mode) => (
            <button key={mode} type="button" role="tab" aria-selected={tab === mode} className="onglet" onClick={() => setTab(mode)}><span>{m.modes[mode]}</span></button>
          ))}
        </div>
        {list.length === 0 ? <p className="scores-vide">{m.scores.empty}</p> : (
          <ol className="scores-liste">
            {list.map((e, i) => {
              const toi = !!me && me.mode === tab && me.entry.at === e.at && me.entry.name === e.name;
              return (
                <li key={`${e.at}-${i}`} className={`scores-ligne${toi ? ' scores-ligne--toi' : i === 0 ? ' scores-ligne--premier' : ''}`}>
                  <span className="scores-rang">{i + 1}</span>
                  <span className="scores-nom">{toi ? `${e.name} ${m.scores.you}` : e.name}</span>
                  <span className="scores-points">{e.score}</span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <button type="button" className="bouton-violet scores-rejouer" onClick={() => onReplay(tab)}><span>{m.scores.replay}</span></button>
    </div>
  );
}
```

`web/src/ui/screens.css` :

```css
/* Écrans hors partie, sur le décor de l'accueil (globe qui se lève en bas) : choix du mode A (D9), fin F1 (D12), scores S2
   (D13), À propos (D14), erreurs et « Tourne ton téléphone » (D16) ; valeurs des maquettes, en px réels (390 × 844). */
.ecran { position: absolute; inset: 0; pointer-events: none; font-family: var(--cartoon); color: #fff8e7; }
.ecran > * { pointer-events: auto; }
.ecran button { font-family: var(--cartoon); }
.ecran-retour { position: absolute; top: calc(58px + env(safe-area-inset-top, 0px)); left: 18px; background: var(--nuit); color: var(--jaune); border: 2px solid #000; box-shadow: 3px 3px 0 #000; transform: skewX(-15deg); padding: 6px 12px; font-size: 14px; cursor: pointer; }
.ecran-retour > span { display: inline-block; transform: skewX(15deg); }
.ecran-titre { position: absolute; left: 0; right: 0; margin: 0; text-align: center; color: var(--jaune); font: 30px/1.15 var(--cartoon); text-shadow: -4px 3px 2px rgb(11, 13, 15); pointer-events: none; }
.bouton-violet { display: inline-flex; align-items: center; justify-content: center; gap: 14px; background: var(--violet); color: #fff; border: 2px solid #000; box-shadow: 6px 6px 0 #000; transform: skewX(-15deg); cursor: pointer; }
.bouton-violet > * { display: inline-block; transform: skewX(15deg); }
.bouton-nuit { background: var(--nuit); color: var(--jaune); border: 2px solid #000; box-shadow: 4px 4px 0 #000; transform: skewX(-15deg); padding: 8px 14px; font-size: 14px; white-space: nowrap; cursor: pointer; }
.bouton-nuit > span { display: inline-block; transform: skewX(15deg); }
.ecran :is(button, a):focus-visible { outline: 3px solid var(--jaune); outline-offset: 4px; }

/* Choix du mode A */
.mode-joueur { position: absolute; top: calc(62px + env(safe-area-inset-top, 0px)); right: 18px; margin: 0; font: 12px/1.2 system-ui, sans-serif; color: rgba(247, 220, 111, .8); }
.mode-joueur b { color: var(--jaune); }
.mode .ecran-titre { top: calc(112px + env(safe-area-inset-top, 0px)); }
.mode-liste { position: absolute; left: 30px; right: 30px; top: calc(178px + env(safe-area-inset-top, 0px)); display: flex; flex-direction: column; gap: 20px; }
.mode-bouton { display: flex; align-items: center; justify-content: space-between; width: 100%; background: var(--violet); color: #fff; border: 2px solid #000; box-shadow: 6px 6px 0 #000; transform: skewX(-15deg); padding: 12px 16px 12px 20px; font-size: 24px; text-align: left; cursor: pointer; }
.mode-bouton > * { transform: skewX(15deg); }
.mode-nom { display: flex; flex-direction: column; gap: 3px; }
.etoiles { color: var(--jaune); font-size: 11px; letter-spacing: 2px; -webkit-text-stroke: .8px #000; }
.etoiles-off { color: rgba(255, 255, 255, .18); -webkit-text-stroke: .8px rgba(0, 0, 0, .5); }
.record { display: inline-flex; align-items: center; gap: 5px; background: var(--jaune); color: var(--nuit); border: 2px solid #000; border-radius: 999px; padding: 2px 9px 3px; font-size: 13px; box-shadow: 2px 2px 0 #000; white-space: nowrap; }
.record small { font: 600 10px/1 system-ui, sans-serif; text-transform: uppercase; letter-spacing: .04em; }
.record--nouveau { background: var(--nuit); color: rgba(247, 220, 111, .75); }

/* Fin F1 */
.fin-haut { position: absolute; top: calc(70px + env(safe-area-inset-top, 0px)); left: 28px; right: 28px; display: flex; flex-direction: column; gap: 22px; }
.fin-titre { margin: 0; color: var(--jaune); font: 32px/1.1 var(--cartoon); text-align: center; text-shadow: -4px 3px 2px rgb(11, 13, 15); }
.fin-mode { margin: 8px 0 0; text-align: center; font: 600 12px/1 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: rgba(247, 220, 111, .8); }
.fin-carte { position: relative; background: #fff8e7; color: var(--nuit); border: 3px solid #000; border-radius: 16px; box-shadow: 6px 6px 0 #000; padding: 16px 18px 14px; text-align: center; }
.fin-score { font-size: 58px; line-height: 1; color: var(--violet); text-shadow: 3px 3px 0 #000; -webkit-text-stroke: 1.5px #000; }
.fin-points { font: 700 12px/1 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; color: #4b4b63; margin-top: 4px; }
.fin-bonnes { font: 15px/1.3 system-ui, sans-serif; margin: 10px 0 0; }
.fin-bonnes b { font-family: var(--cartoon); font-weight: normal; }
.fin-ancien, .fin-perdu { font: 12px/1.3 system-ui, sans-serif; color: #6e6e85; margin: 2px 0 0; }
.fin-perdu { margin-top: 10px; }
.fin-tampon { position: absolute; top: -18px; right: -14px; background: var(--jaune); color: var(--nuit); border: 2.5px solid #000; box-shadow: 3px 3px 0 #000; padding: 4px 10px 5px; font-size: 13px; transform: rotate(8deg); white-space: nowrap; animation: tampon .6s cubic-bezier(.3, 1.8, .5, 1) both .3s; }
@keyframes tampon { from { transform: rotate(8deg) scale(2.2); opacity: 0; } to { transform: rotate(8deg) scale(1); opacity: 1; } }
.fin-escales { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; margin-top: 12px; }
.fin-escale { position: relative; width: 26px; height: 18px; border: 1.5px solid #000; border-radius: 3px; background: center / cover no-repeat; }
.fin-escale.ko { filter: grayscale(1) opacity(.45); }
.fin-escale.ko::after { content: '✗'; position: absolute; right: -6px; top: -8px; width: 13px; height: 13px; border-radius: 50%; background: #e8413a; color: #fff; border: 1.5px solid #000; font: 700 8px/11px system-ui, sans-serif; text-align: center; }
.fin-boutons { display: flex; flex-direction: column; align-items: stretch; gap: 16px; }
.fin-rejouer { align-self: center; padding: 10px 28px; font-size: 26px; }
.fin-rang2 { display: flex; justify-content: center; gap: 16px; }

/* Scores S2 */
.scores .ecran-titre { top: calc(100px + env(safe-area-inset-top, 0px)); }
.scores-corps { position: absolute; top: calc(152px + env(safe-area-inset-top, 0px)); left: 20px; right: 20px; }
.onglets { display: flex; justify-content: center; gap: 10px; margin-bottom: 14px; }
.onglet { background: var(--nuit); color: rgba(247, 220, 111, .75); border: 2px solid #000; box-shadow: 3px 3px 0 #000; transform: skewX(-15deg); padding: 5px 12px; font-size: 13px; cursor: pointer; }
.onglet[aria-selected="true"] { background: var(--jaune); color: var(--nuit); }
.onglet > span { display: inline-block; transform: skewX(15deg); }
.scores-liste { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 7px; }
.scores-ligne { display: grid; grid-template-columns: 30px 1fr auto; align-items: center; gap: 8px; background: var(--nuit); color: #fff8e7; border: 2px solid #000; box-shadow: 3px 3px 0 #000; transform: skewX(-12deg); padding: 4px 14px; font-size: 13px; }
.scores-ligne > * { transform: skewX(12deg); }
.scores-rang, .scores-points { color: var(--jaune); }
.scores-nom { font: 600 14px/1.2 system-ui, sans-serif; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scores-ligne--premier { background: var(--jaune); color: var(--nuit); }
.scores-ligne--premier .scores-rang, .scores-ligne--premier .scores-points { color: var(--nuit); }
.scores-ligne--toi { background: var(--violet); margin-left: -6px; margin-right: 6px; }
.scores-vide { margin: 24px 0 0; text-align: center; font: 14px/1.4 system-ui, sans-serif; color: rgba(255, 248, 231, .85); }
.scores-rejouer { position: absolute; left: 50%; bottom: calc(96px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%) skewX(-15deg); padding: 9px 30px; font-size: 22px; }

@media (prefers-reduced-motion: reduce) { .fin-tampon { animation: none; } }
```

- [ ] **Step 4 : les relancer**

Run : `cd web && npx vitest run --project unit src/ui/screens.test.ts` — Expected : PASS (3 tests).

- [ ] **Step 5 : suite et commit**

Run : `cd web && npm run check` — Expected : vert.

```bash
git add web/src/ui/ModeScreen.tsx web/src/ui/EndScreen.tsx web/src/ui/ScoresScreen.tsx web/src/ui/screens.css web/src/ui/screens.test.ts
git commit -m "jeu : choix du mode A, fin F1, scores S2 — spec 2A §3 (D9, D12, D13)"
```

---

### Task 7 : le jeu branché — `useGame`, `App`, accueil, premiers e2e

**Files:**
- Create: `web/src/app/useGame.ts`
- Modify: `web/src/app/App.tsx`, `web/src/ui/Home.tsx`, `web/src/ui/home.css`
- Create: `web/e2e/game-helpers.ts`, `web/e2e/game.spec.ts`
- Modify (si besoin) : `web/e2e/intro.spec.ts`, `web/e2e/pwa.spec.ts` (le lien « Jouer » vers `/demo.html` devient un bouton)

**Interfaces:**
- Consumes: tout ce qui précède ; `GlobeHandle` (`flyTo`, `showQuestion`, `answer`, `clear`, `home`, `setIdleSpin`, `setSafeArea`) ; `loadCountries` ; `openScoreBook`.
- Produces: `useGame(o: GameOptions): { state: GameState; result: GameResult | null; records: ReadonlyMap<string, CountryRecord>; dispatch(e: GameEvent): void; answer(i: number): void }` ; `window.__game = { state, result }` (crochets) ; `Home` gagne `canPlay`, `onPlay`, `onScores`, `onAbout`.

- [ ] **Step 1 : écrire les e2e (qui échouent)**

`web/e2e/game-helpers.ts` :

```ts
import { expect, type Page } from '@playwright/test';

export const credit = (page: Page) => page.getByRole('contentinfo', { name: 'Crédits de l’imagerie' });
export const gameState = (page: Page) => page.evaluate(() => window.__game!.state);

/** Accueil direct (manifeste des vidéos refusé : l'intro s'efface), globe prêt, « Jouer » actif. */
export async function openHome(page: Page, query = '') {
  await page.route('**/video/videos.json', (r) => r.abort());
  await page.goto(`/?webgl${query}`);
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  await expect(page.getByRole('button', { name: /^(Jouer|Play)/ })).toBeEnabled({ timeout: 180_000 });
}

/** De l'accueil au 3-2-1 dans le mode dont le bouton porte ce texte. */
export async function startGame(page: Page, mode: RegExp) {
  await page.getByRole('button', { name: /^(Jouer|Play)/ }).click();
  await expect(page.locator('.mode-bouton')).toHaveCount(3);
  await page.locator('.mode-bouton', { hasText: mode }).click();
}

/** Attend la question suivante (ou la fin), répond juste (`ok`) ou faux et attend la révélation ; `false` : partie finie. */
export async function answer(page: Page, ok: boolean): Promise<boolean> {
  await page.waitForFunction(() => ['question', 'end'].includes(window.__game?.state.screen ?? ''), null, { timeout: 120_000 });
  const s = await gameState(page);
  if (s.screen !== 'question') return false;
  const i = ok ? s.question!.answer : (s.question!.answer + 1) % 4;
  // le chrono peut atteindre zéro entre la lecture de l'état et le clic : la grille disparaît, la partie est finie
  try { await page.locator('.reponse, .reponse-drapeau').nth(i).click({ timeout: 10_000 }); } catch (e) {
    if ((await gameState(page)).screen === 'question') throw e;
    return false;
  }
  await page.waitForFunction(() => window.__game?.state.screen !== 'question', null, { timeout: 30_000 });
  return true;
}
```

`web/e2e/game.spec.ts` :

```ts
import { expect, test } from '@playwright/test';
import { answer, credit, gameState, openHome, startGame } from './game-helpers';

/**
 * Le jeu de bout en bout (spec 2A §2-3, §11) : parcours, Quitter, double tape, onglet caché, stockage bloqué. Parties
 * courtes et rejouables par les crochets des e2e (`?partie=`, `?graine=`, `window.__game` ; plan 2A-5, décision 5).
 */
test.slow(true, 'SwiftShader : vols et globe lents');
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'fr-FR' });

test('partie complète en mode Pays, téléphone, français : 3-2-1, questions, révélation, fin, scores', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await openHome(page, '&partie=8000&graine=42');   // 8 s nettes : deux réponses scriptées, puis la boucle
  await startGame(page, /Pays/);
  await expect(page.locator('.decompte-n')).toHaveText('3');
  await expect(page.locator('.hud-sec--pause')).toContainText('❚❚');
  await expect(credit(page)).toBeVisible();
  expect(await answer(page, true)).toBe(true);
  await expect(page.locator('.reponse--ok')).toHaveCount(1);
  await expect(page.locator('.hud-plus')).toBeVisible();
  await expect(page.locator('p.sr')).toContainText('Bonne réponse');
  await expect(page.locator('.etiquette')).toBeVisible();
  expect(await answer(page, false)).toBe(true);
  await expect(page.locator('.reponse--ko')).toHaveCount(1);
  await expect(page.locator('p.sr')).toContainText('Raté');
  for (let i = 0; i < 40 && (await answer(page, i % 2 === 0)); i++);
  await expect(page.getByRole('heading', { name: 'Temps écoulé !' })).toBeVisible({ timeout: 60_000 });
  const s = await gameState(page);
  await expect(page.locator('.fin-score')).toHaveText(String(s.tally.score));
  await expect(page.locator('.fin-tampon')).toHaveText('Nouveau record !');
  await expect(page.locator('.fin-escale')).toHaveCount(s.tally.rounds.length);
  await page.getByRole('button', { name: 'Scores' }).click();
  await expect(page.locator('.scores-ligne--toi')).toContainText('· toi');
  await expect(page.getByRole('tab', { name: 'Pays' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '‹ Retour' }).click();
  await page.getByRole('button', { name: 'Changer de mode' }).click();
  await expect(page.locator('.mode-bouton')).toHaveCount(3);
  await page.getByRole('button', { name: '‹ Retour' }).click();
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible();
  expect(errors).toEqual([]);
});

test('quitter pendant le 3-2-1 : retour à l’accueil, le vol abandonné n’amène aucune question', async ({ page }) => {
  await openHome(page, '&graine=7');
  await startGame(page, /Drapeau/);
  await expect(page.locator('.decompte-n')).toBeVisible();
  await page.getByRole('button', { name: 'Quitter' }).click();
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible();
  await page.waitForTimeout(5_000);
  await expect(page.locator('.jeu')).toHaveCount(0);
  expect((await gameState(page)).screen).toBe('home');
});

test('double tape : une seule manche comptée, une seule réponse choisie', async ({ page }) => {
  await openHome(page, '&graine=11');
  await startGame(page, /Capitale/);
  await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
  await page.evaluate(() => { const b = document.querySelectorAll<HTMLButtonElement>('.reponse'); b[0]!.click(); b[1]!.click(); });
  await page.waitForFunction(() => window.__game?.state.screen === 'reveal');
  const s = await gameState(page);
  expect(s.tally.rounds).toHaveLength(1);
  expect(s.picked).toBe(0);
  await expect(page.locator('.reponse--ok, .reponse--ko')).toHaveCount(s.question!.answer === 0 ? 1 : 2);
});

test('onglet caché pendant un vol : chrono figé, puis la manche suivante arrive', async ({ page }) => {
  await openHome(page, '&graine=5');
  await startGame(page, /Pays/);
  await answer(page, true);
  await page.waitForFunction(() => window.__game?.state.screen === 'flight', null, { timeout: 30_000 });
  const hide = (h: boolean) => page.evaluate((v) => {
    Object.defineProperty(document, 'hidden', { value: v, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, h);
  await hide(true);
  // l'état passe par un rendu de React avant d'arriver dans window.__game
  await page.waitForFunction(() => window.__game?.state.clock.reasons.includes('hidden') === true);
  const before = await gameState(page);
  await page.waitForTimeout(2_000);
  expect((await gameState(page)).clock.usedMs).toBe(before.clock.usedMs);
  await hide(false);
  await page.waitForFunction(() => window.__game?.state.clock.reasons.includes('hidden') === false);
  await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
});

test('stockage bloqué : la fin le dit, les scores gardent la partie le temps de la visite', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('bloqué', 'SecurityError'); }; });
  await openHome(page, '&partie=1500&graine=3');
  await startGame(page, /Pays/);
  while (await answer(page, true));
  await expect(page.getByText('Ton score ne peut pas être gardé sur cet appareil')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Scores' }).click();
  await expect(page.locator('.scores-ligne--toi')).toBeVisible();
});
```

- [ ] **Step 2 : les lancer**

Run : `cd web && npm run e2e:local -- e2e/game.spec.ts`
Expected : FAIL — « Jouer » est encore un lien vers `/demo.html` (`getByRole('button', { name: /^(Jouer|Play)/ })` ne trouve rien) ; `window.__game` n'existe pas.

- [ ] **Step 3 : le code**

`web/src/app/useGame.ts` :

```ts
import { useEffect, useMemo, useReducer, useRef, useState, type RefObject } from 'react';
import type { CountryRecord } from '../data/types';
import { createGame, initialState, REVEAL_MS, type GameEvent, type GameState } from '../game/machine';
import type { ScoreBook } from '../game/scores';
import type { Lang } from '../game/types';
import type { GlobeHandle } from '../globe/GlobeView';
import type { Haptics } from '../ui/haptics';
import { finishGame, type GameResult } from './finish';
import { globeCommands } from './globeCommands';

declare global {
  interface Window {
    /** Crochet des e2e (drapeau `countrizz:e2e` ou dev) : l'état du jeu et le résultat de la dernière partie. */
    __game?: { state: GameState; result: GameResult | null };
  }
}

export interface GameOptions {
  countries: CountryRecord[];
  lang: Lang;
  globe: RefObject<GlobeHandle | null>;
  haptics: Haptics;
  book: ScoreBook;
  /** Nom affiché et enregistré (le nom par défaut de la langue s'il est vide). */
  name: string;
  /** Téléphone en paysage : chrono en pause (D5, D16). */
  rotated: boolean;
  /** Durée nette d'une partie (crochet `?partie=` ; 60 s sinon). */
  gameMs?: number;
  /** Rotation de l'accueil, rendue au globe en sortie de partie. */
  homeSpin: number;
  hooks: boolean;
}

/**
 * Le jeu branché (contrat 2A-3 de l'appelant) : la machine pure, ses minuteries (3-2-1 à la seconde, `TICK` pendant la
 * question, révélation de 1,5 s), l'onglet caché et le téléphone tourné (pauses), le globe (`globeCommands`, ticket de vol :
 * `ARRIVED` seulement sur `true`), l'haptique et l'enregistrement du score à l'entrée en fin (une fois par partie).
 */
export function useGame(o: GameOptions) {
  const reduce = useMemo(() => createGame(o.countries, o.gameMs), [o.countries, o.gameMs]);
  const [state, dispatch] = useReducer(reduce, o.lang, initialState);
  const records = useMemo(() => new Map(o.countries.map((c) => [c.cca3, c])), [o.countries]);
  const [result, setResult] = useState<{ flight: number; value: GameResult } | null>(null);
  const opts = useRef(o);
  opts.current = o;
  const prev = useRef(state);
  const now = () => performance.now();

  // langue : la machine ne la change qu'à l'accueil
  useEffect(() => { dispatch({ type: 'SET_LANG', lang: o.lang }); }, [o.lang]);

  // le globe suit chaque changement d'écran ou de vol
  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    const g = opts.current.globe.current;
    if (!g) return;
    for (const c of globeCommands(before, state)) {
      if (c.kind === 'enterGame') g.setIdleSpin(0);
      else if (c.kind === 'fly') {
        const rec = records.get(c.cca3);
        if (rec) void g.flyTo(rec).arrived.then((ok) => { if (ok) dispatch({ type: 'ARRIVED', flight: c.flight, now: now() }); });
      } else if (c.kind === 'showQuestion') g.showQuestion();
      else if (c.kind === 'answer') { g.answer(c.result); opts.current.haptics.play(c.result); }
      else { g.setSafeArea(null); g.clear(); g.home(); g.setIdleSpin(opts.current.homeSpin); }
    }
  }, [state, records]);

  // 3-2-1 : un pas par seconde ; une vibration par chiffre, plus forte à « GO ! »
  useEffect(() => {
    if (state.screen !== 'countdown') return;
    opts.current.haptics.play(state.countdown > 0 ? 'countdown' : 'go');
    const t = setTimeout(() => dispatch({ type: 'COUNTDOWN_TICK', now: now() }), 1000);
    return () => clearTimeout(t);
  }, [state.screen, state.countdown, state.flight]);

  // question : le chrono peut atteindre zéro
  useEffect(() => {
    if (state.screen !== 'question') return;
    const t = setInterval(() => dispatch({ type: 'TICK', now: now() }), 200);
    return () => clearInterval(t);
  }, [state.screen]);

  // révélation : 1,5 s, puis la manche suivante
  useEffect(() => {
    if (state.screen !== 'reveal') return;
    const t = setTimeout(() => dispatch({ type: 'REVEAL_DONE', now: now() }), REVEAL_MS);
    return () => clearTimeout(t);
  }, [state.screen, state.asked.length]);

  // onglet caché : chrono en pause
  useEffect(() => {
    const on = () => dispatch({ type: document.hidden ? 'PAUSE' : 'RESUME', reason: 'hidden', now: now() });
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);

  // téléphone tourné : chrono en pause
  useEffect(() => { dispatch({ type: o.rotated ? 'PAUSE' : 'RESUME', reason: 'rotate', now: now() }); }, [o.rotated]);

  // fin : la partie entre au top 10, une fois (le numéro du vol la désigne)
  useEffect(() => {
    if (state.screen !== 'end' || !state.mode || result?.flight === state.flight) return;
    const value = finishGame(opts.current.book, state.mode, state.tally, opts.current.name, Date.now());
    setResult({ flight: state.flight, value });
    if (value.record) opts.current.haptics.play('record');
  }, [state.screen, state.mode, state.flight, state.tally, result]);

  const current = result?.value ?? null;
  useEffect(() => { if (o.hooks) window.__game = { state, result: current }; }, [o.hooks, state, current]);

  return {
    state,
    /** Résultat de la partie qui vient de finir (`null` tant qu'il n'est pas calculé) ; ailleurs, la dernière partie de la visite. */
    result: state.screen === 'end' ? (result?.flight === state.flight ? current : null) : current,
    records,
    dispatch: dispatch as (e: GameEvent) => void,
    answer: (index: number) => dispatch({ type: 'ANSWER', index, now: now() }),
  };
}
```

`web/src/ui/Home.tsx` : `Props` gagne

```ts
  /** « Jouer » actif : intro finie, globe prêt, pays chargés. */
  canPlay: boolean;
  onPlay(): void;
  onScores(): void;
  onAbout(): void;
```

La phrase du commentaire « « Jouer » ouvre la démo des vols jusqu'aux écrans du jeu (plan 2A-5). » devient « « Jouer » ouvre le choix du mode ; Scores et À propos leurs écrans (plan 2A-5). ». Le lien « Jouer » et la rangée secondaire deviennent :

```tsx
        <button type="button" className="accueil-jouer" disabled={!canPlay} onClick={onPlay}>
          <span>{m.home.play}</span>
          <svg viewBox="0 0 66 43" aria-hidden="true"><path fill="#fff" d="M40 0l26 21.5L40 43H30l26-21.5L30 0z" /><path fill="#fff" opacity=".8" d="M20 0l26 21.5L20 43H10l26-21.5L10 0z" /><path fill="#f7dc6f" d="M0 0l26 21.5L0 43h0l16-21.5L0 0z" /></svg>
        </button>
        <div className="accueil-rang2">
          <button type="button" className="accueil-sec" onClick={onScores}><span>{m.home.scores}</span></button>
          <button type="button" className="accueil-sec" onClick={onAbout}><span>{m.home.about}</span></button>
        </div>
```

(la signature déstructure `canPlay, onPlay, onScores, onAbout`). `web/src/ui/home.css` : dans `.accueil-jouer`, `text-decoration: none;` devient `font-family: var(--cartoon); cursor: pointer;` ; ajouter après la règle `.accueil-jouer > *` : `.accueil-jouer:disabled { cursor: progress; opacity: .7; }` ; dans `.accueil-sec`, `cursor: default; opacity: .8;` devient `cursor: pointer;` ; supprimer la règle `.accueil-sec small { … }` (plus de pastille « Bientôt »).

`web/src/app/App.tsx` : imports ajoutés

```ts
import { loadCountries } from '../data/countries';
import type { CountryRecord } from '../data/types';
import { openScoreBook } from '../game/scores';
import { EndScreen } from '../ui/EndScreen';
import { GameScreen } from '../ui/GameScreen';
import { browserEngine, createHaptics, vibrationsOn } from '../ui/haptics';
import { bestScores, ModeScreen } from '../ui/ModeScreen';
import { ScoresScreen } from '../ui/ScoresScreen';
import { playerName } from './finish';
import { e2eOverrides, hooksEnabled, newSeed } from './hooks';
import { useGame } from './useGame';
```

Dans `App()`, après `const m = messages[lang];` :

```tsx
  // les pays (noms, capitales, drapeaux, balises) : la machine tire ses manches dedans
  const [countries, setCountries] = useState<CountryRecord[]>([]);
  useEffect(() => { void loadCountries('/').then(setCountries, () => {}); }, []);
  const hooks = useMemo(() => hooksEnabled(import.meta.env.DEV, storage), []);
  const overrides = useMemo(() => (hooks ? e2eOverrides(location.search) : {}), [hooks]);
  const [haptics] = useState(() => createHaptics(browserEngine(), vibrationsOn(readPref(storage, PREF_KEYS.vibrations))));
  const [book] = useState(() => openScoreBook(storage));
  const shownName = playerName(name, m.home.defaultName);
  const game = useGame({ countries, lang, globe, haptics, book, name: shownName, rotated: false, gameMs: overrides.gameMs, homeSpin: HOME_SPIN_DEG_PER_S, hooks });
  const s = game.state;
  const inGame = s.screen === 'countdown' || s.screen === 'flight' || s.screen === 'question' || s.screen === 'reveal';
  const canPlay = phase === 'accueil' && globeReady && countries.length > 0;
  const seed = () => newSeed(overrides.seed);
```

(`useMemo` s'ajoute à l'import de `react`.) Le `GlobeView` reçoit `credit={{ zIndex: 20 }}` (le crédit passe au-dessus du voile et de la grille, D2). Le rendu de `Home` devient `{homeShown && s.screen === 'home' && (<Home … canPlay={canPlay} onPlay={() => game.dispatch({ type: 'PLAY' })} onScores={() => game.dispatch({ type: 'SHOW_SCORES' })} onAbout={() => {}} />)}` (À propos : Task 8), suivi de :

```tsx
      {s.screen === 'mode' && (
        <ModeScreen m={m} name={shownName} best={bestScores(book)} onBack={() => game.dispatch({ type: 'BACK' })}
          onChoose={(mode) => game.dispatch({ type: 'CHOOSE_MODE', mode, seed: seed() })} />
      )}
      {inGame && (
        <GameScreen m={m} lang={lang} state={s} records={game.records} globe={globe.current} haptics={haptics}
          onAnswer={game.answer} onQuit={() => game.dispatch({ type: 'QUIT' })} />
      )}
      {s.screen === 'end' && game.result && (
        <EndScreen m={m} lang={lang} name={shownName} result={game.result} rounds={s.tally.rounds} records={game.records}
          onReplay={() => game.dispatch({ type: 'REPLAY', seed: seed() })} onChangeMode={() => game.dispatch({ type: 'CHANGE_MODE' })}
          onScores={() => game.dispatch({ type: 'SHOW_SCORES' })} />
      )}
      {s.screen === 'scores' && (
        <ScoresScreen m={m} initialMode={s.mode ?? 'flag'} book={book} me={game.result} onBack={() => game.dispatch({ type: 'BACK' })}
          onReplay={(mode) => game.dispatch({ type: 'REPLAY', seed: seed(), mode })} />
      )}
```

Le commentaire de tête de `App` gagne la phrase : « « Jouer » mène au jeu : `useGame` relie la machine (2A-3) au globe (2A-4) et l'écran suit `state.screen`. »

Lire **en entier** `web/e2e/intro.spec.ts` et `web/e2e/pwa.spec.ts` : toute attente du lien `getByRole('link', { name: /Jouer|Play/ })` vers `/demo.html` devient `await expect(page.getByRole('button', { name: /^(Jouer|Play)/ })).toBeVisible();` (la démo reste servie à `/demo.html` pour ses propres e2e).

- [ ] **Step 4 : les relancer**

Run : `cd web && npm run e2e:local -- e2e/game.spec.ts e2e/intro.spec.ts e2e/pwa.spec.ts`
Expected : PASS (les 5 tests de `game.spec.ts`, et les deux autres fichiers inchangés en nombre).

- [ ] **Step 5 : suite et commit**

Run : `cd web && npm run check` — Expected : vert.

```bash
git add web/src/app/useGame.ts web/src/app/App.tsx web/src/ui/Home.tsx web/src/ui/home.css web/e2e/game-helpers.ts web/e2e/game.spec.ts web/e2e/intro.spec.ts web/e2e/pwa.spec.ts
git commit -m "jeu : le jeu branché (useGame, accueil → mode → partie → fin → scores) et ses e2e — spec 2A §2-3, §11"
```

---

### Task 8 : À propos, mentions et licences, partage

**Files:**
- Create: `web/src/ui/share.ts`, `web/src/ui/share.test.ts`
- Create: `web/src/ui/AboutScreen.tsx`, `web/src/ui/LegalScreen.tsx`
- Modify: `web/src/ui/screens.css`, `web/src/app/App.tsx`
- Modify: `web/e2e/game.spec.ts`

**Interfaces:**
- Consumes: `useInstall`, `promptInstall` (pwa/install) ; `Haptics` ; `eoxAttribution` (globe/credits) ; `PREF_KEYS.vibrations`, `writePref`.
- Produces: `SHARE_URL = 'https://countrizz.fr'` ; `type ShareOutcome = 'shared' | 'copied' | 'link' | 'cancelled'` ; `interface ShareEnv { share?(d: ShareData): Promise<void>; copy?(text: string): Promise<void> }` ; `shareGame(env, title, text): Promise<ShareOutcome>` ; `browserShareEnv(): ShareEnv` ; `AboutScreen({ m, haptics, onVibrations, onBack, onLegal })` ; `LegalScreen({ m, onBack })`.

- [ ] **Step 1 : écrire les tests (qui échouent)**

`web/src/ui/share.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { SHARE_URL, shareGame } from './share';

const abort = () => Promise.reject(new DOMException('annulé', 'AbortError'));
const fail = () => Promise.reject(new Error('refusé'));

describe('« Partager le jeu » (spec 2A §8)', () => {
  it('partage natif du téléphone avec le lien countrizz.fr', async () => {
    const seen: ShareData[] = [];
    expect(await shareGame({ share: async (d) => { seen.push(d); } }, 'Countrizz', 'Envoie Countrizz')).toBe('shared');
    expect(seen).toEqual([{ title: 'Countrizz', text: 'Envoie Countrizz', url: SHARE_URL }]);
    expect(SHARE_URL).toBe('https://countrizz.fr');
  });

  it('partage fermé par le joueur : rien d’autre', async () => {
    let copied = false;
    expect(await shareGame({ share: abort, copy: async () => { copied = true; } }, 't', 'x')).toBe('cancelled');
    expect(copied).toBe(false);
  });

  it('sans partage natif (ou s’il échoue) : copie du lien ; si la copie échoue : le lien affiché', async () => {
    const copies: string[] = [];
    expect(await shareGame({ copy: async (t) => { copies.push(t); } }, 't', 'x')).toBe('copied');
    expect(await shareGame({ share: fail, copy: async (t) => { copies.push(t); } }, 't', 'x')).toBe('copied');
    expect(copies).toEqual([SHARE_URL, SHARE_URL]);
    expect(await shareGame({ copy: fail }, 't', 'x')).toBe('link');
    expect(await shareGame({}, 't', 'x')).toBe('link');
  });
});
```

Dans `web/e2e/game.spec.ts`, ajouter :

```ts
test('À propos : partager (lien copié), GitHub, vibrations mémorisées, mentions et licences', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openHome(page);
  await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
  await page.getByRole('button', { name: 'À propos' }).click();
  await expect(page.getByRole('heading', { name: 'À propos' })).toBeVisible();
  await page.getByRole('button', { name: 'Partager le jeu' }).click();
  await expect(page.getByText('Lien copié !')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://countrizz.fr');
  await expect(page.getByRole('link', { name: 'github.com/Pablohassan' })).toHaveAttribute('href', 'https://github.com/Pablohassan');
  const vib = page.getByRole('switch', { name: 'Vibrations' });
  await expect(vib).toBeChecked();
  await vib.uncheck();
  expect(await page.evaluate(() => localStorage.getItem('countrizz:vibrations'))).toBe('0');
  await page.getByRole('button', { name: 'Mentions et licences' }).click();
  const panneau = page.locator('.mentions-panneau');   // le crédit permanent du globe porte le même texte
  await expect(panneau.getByText('EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH')).toBeVisible();
  await expect(panneau.getByText('ODbL 1.0')).toBeVisible();
  await page.getByRole('button', { name: '‹ Retour' }).click();
  await page.getByRole('button', { name: '‹ Retour' }).click();
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible();
});
```

- [ ] **Step 2 : les lancer**

Run : `cd web && npx vitest run --project unit src/ui/share.test.ts && npm run e2e:local -- e2e/game.spec.ts -g "À propos"`
Expected : FAIL — `./share` introuvable ; e2e : rien ne s'ouvre sur « À propos ».

- [ ] **Step 3 : le code**

`web/src/ui/share.ts` :

```ts
/** « Partager le jeu » (spec 2A §8, D14) : le partage du téléphone, sinon la copie du lien, sinon le lien affiché. */
export const SHARE_URL = 'https://countrizz.fr';

export type ShareOutcome = 'shared' | 'copied' | 'link' | 'cancelled';
export interface ShareEnv { share?(d: ShareData): Promise<void>; copy?(text: string): Promise<void> }

export async function shareGame(env: ShareEnv, title: string, text: string): Promise<ShareOutcome> {
  if (env.share) {
    try { await env.share({ title, text, url: SHARE_URL }); return 'shared'; } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  if (env.copy) { try { await env.copy(SHARE_URL); return 'copied'; } catch { /* le lien sera affiché */ } }
  return 'link';
}

export function browserShareEnv(): ShareEnv {
  return {
    share: typeof navigator.share === 'function' ? (d) => navigator.share(d) : undefined,
    copy: typeof navigator.clipboard?.writeText === 'function' ? (t) => navigator.clipboard.writeText(t) : undefined,
  };
}
```

`web/src/ui/AboutScreen.tsx` :

```tsx
import { useState } from 'react';
import type { Messages } from '../i18n';
import { promptInstall, useInstall } from '../pwa/install';
import type { Haptics } from './haptics';
import { browserShareEnv, SHARE_URL, shareGame, type ShareOutcome } from './share';
import './screens.css';

interface Props { m: Messages; haptics: Haptics; onVibrations(on: boolean): void; onBack(): void; onLegal(): void }

/**
 * À propos (D14) : « Installer l'appli » (invite du navigateur ; astuce iPhone/iPad ; masqué une fois installée),
 * « Partager le jeu », le lien GitHub, le réglage « Vibrations » (§7) et « Mentions et licences ».
 */
export function AboutScreen({ m, haptics, onVibrations, onBack, onLegal }: Props) {
  const install = useInstall();
  const [shared, setShared] = useState<ShareOutcome | null>(null);
  const [vibrations, setVibrations] = useState(haptics.enabled);
  const canInstall = !install.standalone && (install.canPrompt || install.ios);
  return (
    <div className="ecran apropos">
      <button type="button" className="ecran-retour" onClick={onBack}><span>{m.about.back}</span></button>
      <h1 className="ecran-titre">{m.about.title}</h1>
      <div className="apropos-bloc">
        {canInstall && (
          <>
            <button type="button" className="bouton-violet apropos-cta" onClick={() => { if (install.canPrompt) void promptInstall(); }}><span>{m.about.install}</span></button>
            <p className="apropos-plus">{m.about.installText}</p>
            {install.ios && <p className="apropos-ios">{m.about.iosTip}</p>}
          </>
        )}
        <button type="button" className="bouton-violet apropos-cta apropos-cta--partage"
          onClick={async () => setShared(await shareGame(browserShareEnv(), 'Countrizz', m.about.shareText))}><span>{m.about.share}</span></button>
        <p className="apropos-plus" aria-live="polite">{shared === 'copied' ? m.about.linkCopied : shared === 'link' ? SHARE_URL : m.about.shareText}</p>
        <a className="apropos-github" href="https://github.com/Pablohassan" target="_blank" rel="noreferrer">github.com/Pablohassan</a>
        <label className="apropos-vibrations">
          <input type="checkbox" role="switch" checked={vibrations}
            onChange={(e) => { setVibrations(e.target.checked); haptics.setEnabled(e.target.checked); onVibrations(e.target.checked); }} />
          {m.about.vibrations}
        </label>
      </div>
      <button type="button" className="apropos-mentions" onClick={onLegal}>{m.about.legal}</button>
    </div>
  );
}
```

`web/src/ui/LegalScreen.tsx` :

```tsx
import { useEffect, useState } from 'react';
import { eoxAttribution } from '../globe/credits';
import type { Messages } from '../i18n';
import './screens.css';

/** « Mentions et licences » (spec 2A §12, décision 8 du plan) : les attributions exigées, en liste brute. */
export function LegalScreen({ m, onBack }: { m: Messages; onBack(): void }) {
  const [files, setFiles] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void Promise.all(['/data/credits.json', '/textures/credits.json'].map((u) => fetch(u).then((r) => r.text())))
      .then((t) => { if (alive) setFiles(t); }, () => {});
    return () => { alive = false; };
  }, []);
  return (
    <div className="ecran mentions">
      <button type="button" className="ecran-retour" onClick={onBack}><span>{m.about.back}</span></button>
      <h1 className="ecran-titre">{m.about.legal}</h1>
      <div className="mentions-panneau">
        <p>{eoxAttribution()}</p>
        {files.map((f, i) => <pre key={i}>{f}</pre>)}
      </div>
    </div>
  );
}
```

`web/src/ui/screens.css`, à la fin (avant le bloc `@media (prefers-reduced-motion…)`) :

```css
/* À propos (D14) et mentions */
.apropos .ecran-titre, .mentions .ecran-titre { top: calc(100px + env(safe-area-inset-top, 0px)); }
.apropos-bloc { position: absolute; top: calc(180px + env(safe-area-inset-top, 0px)); left: 26px; right: 26px; display: flex; flex-direction: column; align-items: center; gap: 24px; }
.apropos-cta { padding: 11px 24px; font-size: 22px; }
.apropos-cta--partage { background: var(--jaune); color: var(--nuit); font-size: 20px; }
.apropos-plus { margin: -10px 0 0; font: 13px/1.4 system-ui, sans-serif; color: rgba(255, 248, 231, .85); text-align: center; }
.apropos-ios { width: 100%; box-sizing: border-box; margin: 0; background: rgba(22, 23, 58, .92); border: 2px dashed rgba(247, 220, 111, .6); border-radius: 12px; padding: 10px 14px; font: 13px/1.45 system-ui, sans-serif; color: #fff8e7; text-align: center; }
.apropos-github { display: inline-flex; align-items: center; gap: 8px; font: 600 14px/1 system-ui, sans-serif; color: #fff8e7; text-decoration: underline; text-underline-offset: 3px; }
.apropos-vibrations { display: flex; align-items: center; gap: 10px; font: 14px/1.2 system-ui, sans-serif; color: #fff8e7; }
.apropos-vibrations input { width: 20px; height: 20px; accent-color: var(--violet); }
.apropos-mentions { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(70px + env(safe-area-inset-bottom, 0px)); background: none; border: 0; font: 12px/1 system-ui, sans-serif; color: rgba(247, 220, 111, .75); text-decoration: underline; cursor: pointer; }
.mentions-panneau { position: absolute; top: calc(150px + env(safe-area-inset-top, 0px)); left: 18px; right: 18px; bottom: calc(96px + env(safe-area-inset-bottom, 0px)); overflow: auto; background: rgba(22, 23, 58, .95); border: 3px solid var(--jaune); border-radius: 12px; box-shadow: 5px 5px 0 #000; padding: 14px 16px; font: 12.5px/1.45 system-ui, sans-serif; color: #fff8e7; }
.mentions-panneau pre { margin: 12px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font: 11px/1.4 ui-monospace, Menlo, monospace; }
```

`web/src/app/App.tsx` : un calque `const [overlay, setOverlay] = useState<'about' | 'legal' | null>(null);` ; `Home` n'est rendu que si `!overlay`, avec `onAbout={() => setOverlay('about')}` ; puis

```tsx
      {s.screen === 'home' && overlay === 'about' && (
        <AboutScreen m={m} haptics={haptics} onBack={() => setOverlay(null)} onLegal={() => setOverlay('legal')}
          onVibrations={(on) => writePref(storage, PREF_KEYS.vibrations, on ? '1' : '0')} />
      )}
      {s.screen === 'home' && overlay === 'legal' && <LegalScreen m={m} onBack={() => setOverlay('about')} />}
```

(imports `AboutScreen`, `LegalScreen`).

- [ ] **Step 4 : les relancer**

Run : `cd web && npx vitest run --project unit src/ui/share.test.ts && npm run e2e:local -- e2e/game.spec.ts -g "À propos"`
Expected : PASS.

- [ ] **Step 5 : suite et commit**

Run : `cd web && npm run check` — Expected : vert.

```bash
git add web/src/ui/share.ts web/src/ui/share.test.ts web/src/ui/AboutScreen.tsx web/src/ui/LegalScreen.tsx web/src/ui/screens.css web/src/app/App.tsx web/e2e/game.spec.ts
git commit -m "jeu : À propos (installer, partager, GitHub, vibrations) et mentions et licences — spec 2A §3 (D14), §8, §12"
```

---

### Task 9 : écrans d'erreur et « Tourne ton téléphone »

**Files:**
- Create: `web/src/ui/rotate.ts`, `web/src/ui/rotate.test.ts`
- Create: `web/src/ui/GlobeError.tsx`, `web/src/ui/RotateScreen.tsx`
- Modify: `web/src/ui/screens.css`, `web/src/app/App.tsx`
- Modify: `web/e2e/game.spec.ts`, `web/e2e/unsupported.spec.ts`

**Interfaces:**
- Consumes: `GlobeError` (`reason: 'unsupported' | 'load' | 'lost'`) et `retry()` du globe (2A-4) ; `Messages['errors']`, `Messages['rotate']`.
- Produces: `isPhoneLandscape(v: { coarse: boolean; width: number; height: number }): boolean` ; `useRotated(): boolean` ; `GlobeErrorScreen({ m, kind: 'load' | 'unsupported', onRetry })` ; `RotateScreen({ m, inGame })`.

- [ ] **Step 1 : écrire les tests (qui échouent)**

`web/src/ui/rotate.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { isPhoneLandscape } from './rotate';

describe('« Tourne ton téléphone » (D5, D16)', () => {
  it('téléphone tactile en paysage seulement', () => {
    expect(isPhoneLandscape({ coarse: true, width: 844, height: 390 })).toBe(true);
    expect(isPhoneLandscape({ coarse: true, width: 640, height: 360 })).toBe(true);
    expect(isPhoneLandscape({ coarse: true, width: 390, height: 844 })).toBe(false);   // portrait
    expect(isPhoneLandscape({ coarse: true, width: 1180, height: 820 })).toBe(false);  // tablette en paysage : on joue
    expect(isPhoneLandscape({ coarse: false, width: 844, height: 390 })).toBe(false);  // fenêtre de bureau basse
  });
});
```

Dans `web/e2e/game.spec.ts`, ajouter :

```ts
test('globe en échec : « Oups ! », Réessayer remonte le globe ; une partie en cours est quittée', async ({ page }) => {
  let block = true;
  await page.route('**/data/borders.json', (r) => (block ? r.abort() : r.continue()));
  await page.route('**/video/videos.json', (r) => r.abort());
  await page.goto('/?webgl');
  await expect(page.getByRole('heading', { name: 'Oups !' })).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText('Le globe n’a pas pu se charger')).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Jouer|Play)/ })).toBeDisabled();
  block = false;
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByRole('heading', { name: 'Oups !' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Jouer|Play)/ })).toBeEnabled({ timeout: 180_000 });
});

test('perte du GPU recréée : la partie continue ; recréation ratée : partie quittée et « Oups ! »', async ({ page }) => {
  await openHome(page, '&graine=9');
  await startGame(page, /Pays/);
  await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
  await page.evaluate(() => window.__globe!.simulateDeviceLost());
  await page.waitForFunction(() => (window.__globe?.generation ?? 0) > 0, null, { timeout: 60_000 });
  expect((await gameState(page)).screen).not.toBe('home');
  await page.evaluate(() => { window.__globe!.failNextRenderer = true; window.__globe!.simulateDeviceLost(); });
  await expect(page.getByRole('heading', { name: 'Oups !' })).toBeVisible({ timeout: 60_000 });
  expect((await gameState(page)).screen).toBe('home');
});

test.describe('téléphone en paysage', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  test('« Tourne ton téléphone » ; en partie, le chrono s’arrête et repart en portrait', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHome(page, '&graine=4');
    await startGame(page, /Pays/);
    await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole('heading', { name: 'Tourne ton téléphone' })).toBeVisible();
    await expect(page.getByText('❚❚ Partie en pause')).toBeVisible();
    expect((await gameState(page)).clock.reasons).toContain('rotate');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Tourne ton téléphone' })).toHaveCount(0);
    expect((await gameState(page)).clock.reasons).not.toContain('rotate');
  });
});
```

Dans `web/e2e/unsupported.spec.ts`, ajouter (même `test.use` que le fichier) :

```ts
test('accueil sans WebGL ni WebGPU : « Oh non ! », sans bouton', async ({ page }) => {
  await page.route('**/video/videos.json', (r) => r.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Oh non !' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Ton navigateur ne peut pas afficher le globe')).toBeVisible();
  await expect(page.locator('.erreur button')).toHaveCount(0);
});
```

- [ ] **Step 2 : les lancer**

Run : `cd web && npx vitest run --project unit src/ui/rotate.test.ts && npm run e2e:local -- e2e/game.spec.ts -g "échec|GPU|paysage" && npm run e2e:local -- e2e/unsupported.spec.ts`
Expected : FAIL — `./rotate` introuvable ; e2e : pas de « Oups ! » (la carte intégrée du globe dit « Réessayer » sans ce titre), pas d'écran « Tourne ton téléphone », pas de « Oh non ! » à l'accueil.

- [ ] **Step 3 : le code**

`web/src/ui/rotate.ts` :

```ts
import { useEffect, useState } from 'react';

/** Téléphone en paysage (décision 7 du plan) : pointeur grossier, plus large que haut, moins de 500 px de haut. */
export const isPhoneLandscape = (v: { coarse: boolean; width: number; height: number }): boolean =>
  v.coarse && v.width > v.height && v.height < 500;

const read = () => isPhoneLandscape({ coarse: matchMedia('(pointer: coarse)').matches, width: innerWidth, height: innerHeight });

/** Suit la rotation (et le redimensionnement) de l'écran. */
export function useRotated(): boolean {
  const [rotated, setRotated] = useState(read);
  useEffect(() => {
    const on = () => setRotated(read());
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  return rotated;
}
```

`web/src/ui/GlobeError.tsx` :

```tsx
import type { Messages } from '../i18n';
import './screens.css';

/**
 * Erreurs D16 : chargement raté ou recréation ratée après une perte du GPU (globe grisé, bulle, « Réessayer ») ;
 * navigateur incompatible (bulle sans bouton : réessayer ne changerait rien).
 */
export function GlobeErrorScreen({ m, kind, onRetry }: { m: Messages; kind: 'load' | 'unsupported'; onRetry(): void }) {
  const e = m.errors;
  const load = kind === 'load';
  return (
    <div className={`ecran erreur erreur--${kind}`}>
      <h1 className="ecran-titre">{load ? e.oops : e.ohNo}</h1>
      <div className="erreur-bloc">
        <p className="bulle"><b>{load ? e.loadTitle : e.unsupportedTitle}</b>{load ? e.loadText : e.unsupportedHint}</p>
        {load && <button type="button" className="bouton-violet erreur-cta" onClick={onRetry}><span>{e.retry}</span></button>}
        <p className="erreur-petit">{load ? e.loadHint : e.unsupportedText}</p>
      </div>
    </div>
  );
}
```

`web/src/ui/RotateScreen.tsx` :

```tsx
import type { Messages } from '../i18n';
import './screens.css';

/** « Tourne ton téléphone » (D5, D16) : téléphone jaune qui pivote ; « ❚❚ Partie en pause » pendant une partie. */
export function RotateScreen({ m, inGame }: { m: Messages; inGame: boolean }) {
  return (
    <div className="tourne" role="alertdialog" aria-labelledby="tourne-titre">
      <div className="tourne-tel" aria-hidden="true" />
      <div>
        <h1 id="tourne-titre" className="tourne-titre">{m.rotate.title}</h1>
        <p>{m.rotate.text}</p>
        {inGame && <span className="tourne-pause">❚❚ {m.rotate.paused}</span>}
      </div>
    </div>
  );
}
```

`web/src/ui/screens.css`, à la fin (le bloc `@media (prefers-reduced-motion…)` final reçoit `.tourne-tel { animation: none; transform: none; }`) :

```css
/* Erreurs (D16) */
.erreur .ecran-titre { top: calc(110px + env(safe-area-inset-top, 0px)); font-size: 34px; }
.erreur--load { backdrop-filter: grayscale(.85) brightness(.55); -webkit-backdrop-filter: grayscale(.85) brightness(.55); }
.erreur--unsupported { background: var(--nuit); }
.erreur-bloc { position: absolute; top: calc(200px + env(safe-area-inset-top, 0px)); left: 30px; right: 30px; display: flex; flex-direction: column; align-items: center; gap: 26px; }
.bulle { margin: 0; background: #fff8e7; color: var(--nuit); border: 3px solid #000; border-radius: 16px; box-shadow: 6px 6px 0 #000; padding: 18px 18px 16px; text-align: center; font: 15px/1.45 system-ui, sans-serif; }
.bulle b { display: block; margin-bottom: 8px; font: 22px/1.15 var(--cartoon); color: var(--violet); }
.erreur-cta { padding: 9px 26px; font-size: 20px; }
.erreur-petit { margin: 0; font: 12px/1.4 system-ui, sans-serif; color: rgba(247, 220, 111, .7); text-align: center; }

/* « Tourne ton téléphone » (D16) */
.tourne { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; gap: 44px; background: radial-gradient(circle at 50% 50%, #262864, var(--nuit) 70%); font-family: var(--cartoon); color: #fff8e7; }
.tourne-tel { position: relative; width: 70px; height: 120px; border: 5px solid var(--jaune); border-radius: 14px; box-shadow: 4px 4px 0 #000; animation: pivote 2.4s ease-in-out infinite; }
.tourne-tel::after { content: ''; position: absolute; left: 50%; bottom: 6px; width: 16px; height: 4px; margin-left: -8px; border-radius: 2px; background: var(--jaune); }
@keyframes pivote { 0%, 20% { transform: rotate(-90deg); } 55%, 100% { transform: rotate(0deg); } }
.tourne-titre { margin: 0; color: var(--jaune); font: 34px/1.1 var(--cartoon); text-shadow: -4px 3px 2px rgb(11, 13, 15); }
.tourne p { margin: 10px 0 0; font: 15px/1.4 system-ui, sans-serif; color: rgba(255, 248, 231, .85); }
.tourne-pause { display: inline-flex; gap: 6px; align-items: center; margin-top: 16px; background: var(--jaune); color: var(--nuit); border: 2px solid #000; box-shadow: 3px 3px 0 #000; padding: 4px 10px; font-size: 13px; }
```

`web/src/app/App.tsx` :
- `const [globeError, setGlobeError] = useState<'load' | 'unsupported' | null>(null);` ; `const rotated = useRotated();` (passé à `useGame` à la place de `false`) ;
- le chargement des pays devient `const loadAll = () => { void loadCountries('/').then(setCountries, () => setGlobeError('load')); };` appelé dans `useEffect(loadAll, [])` ;
- `GlobeView` : `errorUi={false}` ; `onReady` ajoute `setGlobeError(null)` ; `onError={(e) => { setGlobeReady(true); setGlobeError(e.reason === 'unsupported' ? 'unsupported' : 'load'); }}` (le fondu part toujours, commentaire inchangé) ;
- une erreur pendant une partie la quitte (décision 6) : `useEffect(() => { if (globeError && inGame) game.dispatch({ type: 'QUIT' }); }, [globeError, inGame]);` ;
- `canPlay` ajoute `&& !globeError` ;
- en fin de rendu :

```tsx
      {globeError && phase === 'accueil' && (
        <GlobeErrorScreen m={m} kind={globeError} onRetry={() => { setGlobeError(null); if (!countries.length) loadAll(); globe.current?.retry(); }} />
      )}
      {rotated && <RotateScreen m={m} inGame={inGame} />}
```

(imports `GlobeErrorScreen`, `RotateScreen`, `useRotated`).

- [ ] **Step 4 : les relancer**

Run : `cd web && npx vitest run --project unit src/ui/rotate.test.ts && npm run e2e:local -- e2e/game.spec.ts e2e/unsupported.spec.ts e2e/intro.spec.ts e2e/load-failure.spec.ts`
Expected : PASS. `intro.spec.ts` et `load-failure.spec.ts` contrôlent la carte d'erreur intégrée : s'ils cherchent un texte qui a changé sur la page d'accueil (titre « Oups ! » en plus), adapter l'attente à l'écran D16 et le noter au rapport ; `load-failure.spec.ts` vise `/demo.html` (carte intégrée, inchangée).

- [ ] **Step 5 : suite et commit**

Run : `cd web && npm run check` — Expected : vert.

```bash
git add web/src/ui/rotate.ts web/src/ui/rotate.test.ts web/src/ui/GlobeError.tsx web/src/ui/RotateScreen.tsx web/src/ui/screens.css web/src/app/App.tsx web/e2e/game.spec.ts web/e2e/unsupported.spec.ts
git commit -m "jeu : écrans d'erreur D16 et « Tourne ton téléphone » (chrono en pause) — spec 2A §3, §10"
```

---

### Task 10 : bureau et clavier (L1), mouvement réduit, crédit jamais recouvert, petit écran

**Files:**
- Create: `web/src/ui/keys.ts`, `web/src/ui/keys.test.ts`
- Modify: `web/src/app/useGame.ts` (touches 1-4), `web/src/ui/game.css` (bureau, touches, petit écran)
- Modify: `web/e2e/game.spec.ts`

**Interfaces:**
- Produces: `answerIndexFromKey(e: { key: string; code?: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): number | null`.

- [ ] **Step 1 : écrire les tests (qui échouent)**

`web/src/ui/keys.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { answerIndexFromKey } from './keys';

describe('touches 1 à 4 (L1)', () => {
  it('rangée du haut (AZERTY compris : le code de la touche fait foi) et pavé numérique', () => {
    expect(answerIndexFromKey({ key: '1', code: 'Digit1' })).toBe(0);
    expect(answerIndexFromKey({ key: '&', code: 'Digit1' })).toBe(0);   // AZERTY sans majuscule
    expect(answerIndexFromKey({ key: '"', code: 'Digit3' })).toBe(2);
    expect(answerIndexFromKey({ key: '4', code: 'Numpad4' })).toBe(3);
    expect(answerIndexFromKey({ key: '2' })).toBe(1);                    // sans code (navigateur ancien)
  });

  it('rien pour les autres touches ni avec un modificateur', () => {
    expect(answerIndexFromKey({ key: '5', code: 'Digit5' })).toBeNull();
    expect(answerIndexFromKey({ key: 'a', code: 'KeyA' })).toBeNull();
    expect(answerIndexFromKey({ key: '1', code: 'Digit1', ctrlKey: true })).toBeNull();
    expect(answerIndexFromKey({ key: '1', code: 'Digit1', metaKey: true })).toBeNull();
    expect(answerIndexFromKey({ key: '1', code: 'Digit1', altKey: true })).toBeNull();
  });
});
```

Dans `web/e2e/game.spec.ts`, ajouter (et `import { type Page } from '@playwright/test';` à l'import existant) :

```ts
/** Le crédit EOX n'est recouvert par rien (spec §11) : trois points de sa ligne rendent le crédit lui-même. */
async function creditFree(page: Page, where: string) {
  const b = (await credit(page).boundingBox())!;
  const free = await page.evaluate(({ x, y, w, h }) => [[x + 3, y + h / 2], [x + w / 2, y + h / 2], [x + w - 3, y + h / 2]]
    .every(([px, py]) => !!document.elementFromPoint(px!, py!)?.closest('footer[role="contentinfo"]')), { x: b.x, y: b.y, w: b.width, h: b.height });
  expect(free, where).toBe(true);
}

test('crédit EOX jamais recouvert : accueil, mode, 3-2-1, question, révélation, fin, scores, À propos', async ({ page }) => {
  await openHome(page, '&partie=1500&graine=8');
  await creditFree(page, 'accueil');
  await page.getByRole('button', { name: /^(Jouer|Play)/ }).click();
  await creditFree(page, 'mode');
  await page.locator('.mode-bouton', { hasText: /Pays/ }).click();
  await expect(page.locator('.decompte-n')).toBeVisible();
  await creditFree(page, '3-2-1');
  await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
  await creditFree(page, 'question');
  await answer(page, true);
  await creditFree(page, 'révélation');
  await expect(page.getByRole('heading', { name: 'Temps écoulé !' })).toBeVisible({ timeout: 120_000 });
  await creditFree(page, 'fin');
  await page.getByRole('button', { name: 'Scores' }).click();
  await creditFree(page, 'scores');
  await page.getByRole('button', { name: '‹ Retour' }).click();
  await page.getByRole('button', { name: 'Changer de mode' }).click();
  await page.getByRole('button', { name: '‹ Retour' }).click();
  await page.getByRole('button', { name: 'À propos' }).click();
  await creditFree(page, 'À propos');
});

test('360 × 640 : rien ne déborde, la grille reste au-dessus du crédit', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openHome(page, '&graine=21');
  await startGame(page, /Pays/);
  await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const grille = (await page.locator('.reponses').boundingBox())!;
  const c = (await credit(page).boundingBox())!;
  expect(grille.y + grille.height).toBeLessThanOrEqual(c.y);
});

test.describe('bureau, anglais, clavier', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false });
  test('touches 1-4 rappelées sur les boutons ; on répond au clavier', async ({ page }) => {
    await openHome(page, '&graine=13');
    await page.getByRole('button', { name: 'EN' }).click();
    await startGame(page, /Country/);
    await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
    await expect(page.getByRole('heading', { name: 'Which country is this?' })).toBeVisible();
    await expect(page.locator('.reponse-touche').first()).toBeVisible();
    const s = await gameState(page);
    await page.keyboard.press(`Digit${s.question!.answer + 1}`);
    await page.waitForFunction(() => window.__game?.state.screen === 'reveal');
    await expect(page.locator('.reponse--ok')).toHaveCount(1);
    await expect(page.locator('p.sr')).toContainText('Right:');
  });

  test('partie complète en anglais, au clavier, mode Capital', async ({ page }) => {
    await openHome(page, '&partie=1500&graine=17');
    await page.getByRole('button', { name: 'EN' }).click();
    await startGame(page, /Capital/);
    for (;;) {
      await page.waitForFunction(() => ['question', 'end'].includes(window.__game?.state.screen ?? ''), null, { timeout: 120_000 });
      const s = await gameState(page);
      if (s.screen === 'end') break;
      await page.keyboard.press(`Digit${s.question!.answer + 1}`);
      await page.waitForFunction(() => window.__game?.state.screen !== 'question', null, { timeout: 30_000 });
    }
    await expect(page.getByRole('heading', { name: 'Time’s up!' })).toBeVisible();
  });
});

for (const [mode, label] of [['drapeau', /Drapeau/], ['capitale', /Capitale/]] as const) {
  test(`partie complète en mode ${mode} (téléphone, français)`, async ({ page }) => {
    await openHome(page, `&partie=1500&graine=${mode.length}`);
    await startGame(page, label);
    while (await answer(page, true));
    await expect(page.getByRole('heading', { name: 'Temps écoulé !' })).toBeVisible({ timeout: 120_000 });
  });
}

test.describe('haptique, par espion', () => {
  test.use({ isMobile: true, hasTouch: true });
  test('3-2-1, appui, mauvaise réponse : les motifs du prototype', async ({ page }) => {
    await page.addInitScript(() => {
      const seen: number[][] = [];
      (window as unknown as { __vib: number[][] }).__vib = seen;
      Object.defineProperty(navigator, 'vibrate', { value: (p: number[]) => { seen.push([...p]); return true; }, configurable: true });
    });
    await openHome(page, '&graine=6');
    await startGame(page, /Pays/);
    await answer(page, false);
    const vib = await page.evaluate(() => (window as unknown as { __vib: number[][] }).__vib);
    expect(vib.slice(0, 4)).toEqual([[18], [18], [18], [45]]);
    expect(vib).toContainEqual([9]);
    expect(vib).toContainEqual([70, 25, 8, 2, 8, 2, 8, 2, 8, 25, 140]);
  });
});

test.describe('mouvement réduit', () => {
  test.use({ reducedMotion: 'reduce' });
  test('3-2-1 et tampon « Nouveau record ! » immobiles', async ({ page }) => {
    await openHome(page, '&partie=1500&graine=2');
    await startGame(page, /Pays/);
    await expect(page.locator('.decompte-n')).toBeVisible();
    expect(await page.locator('.decompte-n').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    await answer(page, true);
    await expect(page.locator('.fin-tampon')).toBeVisible({ timeout: 120_000 });
    expect(await page.locator('.fin-tampon').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  });
});
```

- [ ] **Step 2 : les lancer**

Run : `cd web && npx vitest run --project unit src/ui/keys.test.ts && npm run e2e:local -- e2e/game.spec.ts -g "crédit|360|clavier|anglais|réduit|haptique|mode drapeau|mode capitale"`
Expected : FAIL — `./keys` introuvable ; e2e « clavier » : `.reponse-touche` caché et la touche sans effet ; « 360 × 640 » : la grille descend sous le haut du crédit (trois lignes à 360 px). Les autres (crédit, mouvement réduit, haptique, parties dans les trois modes) peuvent déjà passer : le noter au rapport (ils figent un comportement que les Tasks 3-9 ont déjà donné ; spec §11 : « parcours complet FR et EN, téléphone et bureau, pour chacun des trois modes », « haptique par espion injecté »).

- [ ] **Step 3 : le code**

`web/src/ui/keys.ts` :

```ts
/** L1 : au bureau, les touches 1 à 4 (rangée du haut — le code de la touche, AZERTY compris — ou pavé numérique). */
export function answerIndexFromKey(e: { key: string; code?: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean }): number | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code ?? '')?.[1] ?? (/^[1-4]$/.test(e.key) ? e.key : null);
  return digit ? Number(digit) - 1 : null;
}
```

`web/src/app/useGame.ts` : import `answerIndexFromKey` de `../ui/keys`, et après l'effet « question » :

```ts
  // L1 : au clavier, une réponse par touche 1 à 4 (une touche tenue ne répond qu'une fois)
  useEffect(() => {
    if (state.screen !== 'question') return;
    const on = (e: KeyboardEvent) => {
      const i = answerIndexFromKey(e);
      if (i === null || e.repeat) return;
      e.preventDefault();
      dispatch({ type: 'ANSWER', index: i, now: now() });
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [state.screen]);
```

`web/src/ui/game.css`, avant le bloc `@media (prefers-reduced-motion…)` :

```css
/* Touches 1 à 4 rappelées sur les boutons (L1), là où il y a un clavier et une souris. */
.reponse-touche { position: absolute; left: 10px; top: 50%; width: 24px; height: 24px; border-radius: 6px; background: var(--jaune); color: var(--nuit); border: 2px solid #000; place-items: center; font: 13px var(--cartoon); }
.reponse > .reponse-touche { transform: translateY(-50%) skewX(15deg); }
.reponse-drapeau > .reponse-touche { top: 6px; left: 6px; }
@media (hover: hover) and (pointer: fine) {
  .reponse > .reponse-touche, .reponse-drapeau > .reponse-touche { display: grid; }
}
/* L1 (D5) : au bureau, la même grille en bas, plus large et plus grande (maquette paysage.html, 1440 × 900). */
@media (min-width: 700px) and (min-height: 500px) {
  .hud { top: 28px; left: 32px; right: 32px; }
  .jeu-voile { height: 330px; }
  .jeu-bas { left: 50%; right: auto; width: min(660px, calc(100% - 64px)); translate: -50% 0; padding-bottom: 40px; }
  .jeu-question { font-size: 24px; }
  .reponses { gap: 16px 22px; }
  .reponse { min-height: 64px; font-size: 18px; }
  .reponse--long { font-size: 15px; }
}
/* Petits écrans : le crédit passe sur trois lignes, la grille remonte d'autant. */
@media (max-width: 380px) {
  .jeu-bas { padding-bottom: calc(46px + env(safe-area-inset-bottom, 0px)); }
}
```

- [ ] **Step 4 : les relancer**

Run : `cd web && npx vitest run --project unit src/ui/keys.test.ts && npm run e2e:local -- e2e/game.spec.ts`
Expected : PASS (tout `game.spec.ts`).

- [ ] **Step 5 : suite et commit**

Run : `cd web && npm run check` — Expected : vert.

```bash
git add web/src/ui/keys.ts web/src/ui/keys.test.ts web/src/app/useGame.ts web/src/ui/game.css web/e2e/game.spec.ts
git commit -m "jeu : bureau et clavier (L1), petit écran, crédit jamais recouvert, mouvement réduit — spec 2A §3 (D5), §11"
```

---

### Task 11 : références visuelles des nouveaux écrans, et regard de l'utilisateur

**Files:**
- Create: `web/e2e/game-visual.spec.ts`, `web/e2e/game-visual.spec.ts-snapshots/*-darwin.png` (générées)

**Interfaces:**
- Consumes: `openHome`, `startGame`, `answer` (`game-helpers.ts`).

- [ ] **Step 1 : écrire les références (qui échouent : aucune image encore)**

`web/e2e/game-visual.spec.ts` :

```ts
import { expect, test, type Page } from '@playwright/test';
import { answer, openHome } from './game-helpers';

/**
 * Références visuelles des écrans du jeu (spec 2A §11), l'interface seule (décision 9 du plan 2A-5) : le globe masqué (il a ses
 * propres références), les secondes et la jauge du chrono masquées (elles bougent). Tirages fixés par `?graine=`.
 */
test.slow(true, 'SwiftShader : vols et globe lents');
test.use({ locale: 'fr-FR' });

const hideGlobe = (page: Page) => page.addStyleTag({ content: 'canvas { visibility: hidden !important; }' });
const shot = (page: Page, name: string) => expect(page).toHaveScreenshot(`jeu-${name}.png`,
  { mask: [page.locator('.hud-sec, .hud-jauge > i')], animations: 'disabled', maxDiffPixelRatio: 0.002 });

const CADRAGES = [['telephone', { width: 390, height: 844 }], ['bureau', { width: 1440, height: 900 }]] as const;

for (const [cadrage, viewport] of CADRAGES) {
  test.describe(cadrage, () => {
    test.use({ viewport });

    test(`mode et questions (${cadrage})`, async ({ page }) => {
      await openHome(page, '&graine=42');
      await hideGlobe(page);
      await page.getByRole('button', { name: /^(Jouer|Play)/ }).click();
      await shot(page, `mode-${cadrage}`);
      await page.locator('.mode-bouton', { hasText: /Drapeau/ }).click();
      await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
      await shot(page, `question-drapeau-${cadrage}`);
      await page.getByRole('button', { name: 'Quitter' }).click();
      await page.getByRole('button', { name: /^(Jouer|Play)/ }).click();
      await page.locator('.mode-bouton', { hasText: /Pays/ }).click();
      await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
      await shot(page, `question-pays-${cadrage}`);
    });

    test(`fin, scores, À propos (${cadrage})`, async ({ page }) => {
      await openHome(page, '&partie=1500&graine=42');
      await hideGlobe(page);
      await page.getByRole('button', { name: /^(Jouer|Play)/ }).click();
      await page.locator('.mode-bouton', { hasText: /Capitale/ }).click();
      await answer(page, true);   // une manche répondue, puis le chrono finit sur la suivante : fin à 10 points, toujours la même
      await expect(page.getByRole('heading', { name: 'Temps écoulé !' })).toBeVisible({ timeout: 120_000 });
      await shot(page, `fin-${cadrage}`);
      await page.getByRole('button', { name: 'Scores' }).click();
      await shot(page, `scores-${cadrage}`);
      await page.getByRole('button', { name: '‹ Retour' }).click();
      await page.getByRole('button', { name: 'Changer de mode' }).click();
      await page.getByRole('button', { name: '‹ Retour' }).click();
      await page.getByRole('button', { name: 'À propos' }).click();
      await shot(page, `apropos-${cadrage}`);
    });
  });
}

test('erreur de chargement (téléphone)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/data/borders.json', (r) => r.abort());
  await page.route('**/video/videos.json', (r) => r.abort());
  await page.goto('/?webgl');
  await expect(page.getByRole('heading', { name: 'Oups !' })).toBeVisible({ timeout: 180_000 });
  await hideGlobe(page);
  await shot(page, 'erreur-telephone');
});

test.describe('téléphone en paysage', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  test('« Tourne ton téléphone »', async ({ page }) => {
    await page.route('**/video/videos.json', (r) => r.abort());
    await page.goto('/?webgl');
    await expect(page.getByRole('heading', { name: 'Tourne ton téléphone' })).toBeVisible({ timeout: 60_000 });
    await shot(page, 'tourne');
  });
});
```

- [ ] **Step 2 : les lancer**

Run : `cd web && npm run e2e:local -- e2e/game-visual.spec.ts`
Expected : FAIL — « A snapshot doesn't exist … writing actual » pour chaque `jeu-*.png` (11 images).

- [ ] **Step 3 : regarder, corriger, puis écrire les références**

Ouvrir (Read) chaque image écrite dans `web/test-results/**/jeu-*-actual.png` et la comparer à sa maquette (`docs/superpowers/brainstorm/2026-10-03-phase2a-interface/ecrans/` : `mode.html` A, `question-modes.html`, `drapeaux-sans-tuile.html` P1, `fin.html` F1, `scores.html` S2, `a-propos-chargement.html`, `derniers-ecrans.html`). Un écart de mise en page (texte coupé, débordement, bouton qui chevauche, couleur fausse) se corrige dans `game.css` / `screens.css`, test d'abord si une logique change, et se note au rapport. Puis Run : `cd web && npm run e2e:local -- e2e/game-visual.spec.ts --update-snapshots`. Expected : 11 fichiers `jeu-*-darwin.png` écrits dans `web/e2e/game-visual.spec.ts-snapshots/`.

- [ ] **Step 4 : les relancer**

Run : `cd web && npm run e2e:local -- e2e/game-visual.spec.ts` deux fois de suite. Expected : PASS les deux fois (références stables).

- [ ] **Step 5 : commit, puis le regard de l'utilisateur**

```bash
git add web/e2e/game-visual.spec.ts web/e2e/game-visual.spec.ts-snapshots
git commit -m "jeu : références visuelles des écrans du jeu (interface seule) — spec 2A §11"
```

Le contrôleur assemble les images (téléphone et bureau), plus une capture **avec le globe** de la question et de la révélation (mêmes parcours sans `hideGlobe`, `page.screenshot`), dans la page de suivi de l'utilisateur, et attend son avis : il ne voit que cette page. Ses retours se traitent comme des corrections de cette tâche (CSS, puis `--update-snapshots`, puis Step 4).

---

### Task 12 : suite complète, passation, image 1.8, e2e sur le site

**Files:**
- Modify: `docs/HANDOFF.md` (une ligne datée en tête de la reprise), `deploy/k8s/countrizz.yaml` (étiquette `1.7` → `1.8`)

**Interfaces:**
- Consumes: toute la branche ; `deploy/scripts/build-image.sh` (lit l'étiquette dans `deploy/k8s/countrizz.yaml`, refuse une étiquette déjà publiée, puis build, `stage-image.mjs`, `docker buildx … --push`) ; `web/e2e/deployed.ts` (préparation des e2e sur le site).
- Produces: l'image `pablohassan/countrizz-web:1.8` et son déploiement (chacun sur GO de l'utilisateur) ; la passation.

- [ ] **Step 1 : suite du Mac, en local.** Run : `cd web && npm run check && npm run test:data && npm run e2e:local`. Expected : `tsc` sans erreur ; Vitest `Tests <U> passed (<U>)` ; `test:data` `<D> passed` ; Playwright `<E> passed`, `3 skipped` (les trois de `pwa.spec.ts`, sans service worker en dev), aucun échec ; `staleFrames` à 0. Garder `<U>`, `<D>`, `<E>`.

- [ ] **Step 2 : build de production sous le nginx de l'image, budget.** Run, depuis la racine du dépôt, le port 5176 libre (`lsof -iTCP:5176 -sTCP:LISTEN` ne rend rien) :

```bash
(cd web && npm run build)
docker run -d --rm --name countrizz-e2e -p 127.0.0.1:5176:8080 -v "$PWD/deploy/web/nginx.conf:/etc/nginx/conf.d/default.conf:ro" -v "$PWD/web/dist:/usr/share/nginx/html:ro" nginxinc/nginx-unprivileged:1.30.5-alpine@sha256:15c994d10d6d78658721c3bcafff14cb281fba2a4bdf9d5ba92c416a472516e3
(cd web && E2E_BASE_URL=http://127.0.0.1:5176 npx playwright test e2e/intro.spec.ts e2e/pwa.spec.ts e2e/game.spec.ts)
(cd web && BUDGET_BASE_URL=http://127.0.0.1:5176 npm run budget)
docker stop countrizz-e2e
```

Expected : aucun échec ; budget `6 passed` et ses lignes `total <TS> octets (budget 12000000)` (standard) et `total <TH> octets` (haute). Un total standard au-dessus du plafond : arrêt, avec le chiffre, devant l'utilisateur (ne pas relever le plafond). Garder `<TS>`, `<TH>`.

- [ ] **Step 3 : revue finale** par un relecteur neuf sur toute la branche depuis le commit qui précède la Task 1 (skill du mode d'exécution choisi), avec la section Review Focus de ce plan et les décisions 1 à 11 ; corrections test d'abord ; si une correction touche le code, refaire les Steps 1 et 2. Garder son issue en une phrase, `<REVUE>`.

- [ ] **Step 4 : passation.** Dans `docs/HANDOFF.md`, juste après la ligne qui commence par `> **Récupérer le travail.**`, insérer (chaque `<…>` remplacé ; `<JJ/MM>` = `date +%d/%m`) :

```markdown
> **<JJ/MM> — plan 2A-5 fait : les écrans du jeu** (`docs/superpowers/plans/2026-10-13-countrizz-phase2a-5-ecrans-du-jeu.md`). Countrizz se joue de bout en bout : accueil → choix du mode (A) → 3-2-1 (C1, premier vol pendant le décompte) → manches (HUD H2, grille A, drapeaux P1 à aire égale, révélation R3 avec étiquette « Pays · capitale ») → fin (F1) → scores (S2) ; À propos (installer, partager, GitHub, vibrations, mentions et licences) ; erreurs D16 et « Tourne ton téléphone » ; haptique (motifs du prototype, `web/src/ui/haptics.ts`) ; bureau au clavier (L1). Logique pure : `web/src/app/globeCommands.ts`, `finish.ts`, `hooks.ts`, `web/src/ui/{flagSize,answerLabel,keys,rotate,share}.ts` ; branchement : `web/src/app/useGame.ts`. Crochets e2e : `?partie=`, `?graine=`, `window.__game` (drapeau `countrizz:e2e`). Suite du Mac : `check` <U> passed, `test:data` <D> passed, `e2e:local` <E> passed ; budget sous le nginx de l'image : standard <TS> octets, haute <TH>. Revue finale (agent neuf) : <REVUE>. Image `countrizz-web:1.8` à construire et déployer sur GO. **Suite : plan 2A-6 (accueil complet avec l'avion A2, écran de chargement Terre cartoon, PWA hors ligne).**
```

Run : `node -e 'require("fs").readFileSync("docs/HANDOFF.md","utf8").split("\n").slice(5,10).forEach((l,i)=>console.log(i+6,l.slice(0,90)))'`. Expected : la ligne qui suit `> **Récupérer le travail.** …` commence par `> **<la date> — plan 2A-5 fait : les écrans du jeu**`, sans gabarit `<…>`.

- [ ] **Step 5 : l'étiquette en ligne, puis 1.8.** Run (lectures seules) :

```bash
ssh pablo1@192.168.1.171 "kubectl -n countrizz get deploy countrizz-web -o jsonpath='{.spec.template.spec.containers[0].image}'"; echo
for t in 1.7 1.8; do docker buildx imagetools inspect pablohassan/countrizz-web:$t >/dev/null 2>&1 && echo "$t publiée" || echo "$t absente"; done
```

Expected : `pablohassan/countrizz-web:1.7`, `1.7 publiée`, `1.8 absente`. Autre chose : arrêt, demander à l'utilisateur. Puis dans `deploy/k8s/countrizz.yaml`, `image: pablohassan/countrizz-web:1.7` devient `image: pablohassan/countrizz-web:1.8`. Run : `node -e 'const t=require("fs").readFileSync("deploy/k8s/countrizz.yaml","utf8");console.log(t.match(/image: (pablohassan\/countrizz-web:\S+)/)[1])'`. Expected : `pablohassan/countrizz-web:1.8`. Commit :

```bash
git add docs/HANDOFF.md deploy/k8s/countrizz.yaml
git commit -m "déploiement : countrizz-web 1.8 (écrans du jeu, 2A-5) — passation"
```

- [ ] **Step 6 : GO de l'utilisateur, puis l'image.** Lui demander, et attendre un « oui » explicite : « Je construis l'image arm64 `pablohassan/countrizz-web:1.8` sur ce Mac et je la pousse sur Docker Hub (publique) par `deploy/scripts/build-image.sh`. Elle met le jeu complet en ligne. GO ? » Puis Run : `deploy/scripts/build-image.sh`. Expected : le build Vite, `Patchs image vérifiés : 394 fichiers conformes à imagery.json.`, la poussée de buildx, et en dernière ligne `pablohassan/countrizz-web:1.8` ; code 0. Refus ou échec : arrêt et rapport.

- [ ] **Step 7 : nouveau GO, puis le déploiement.** Lui demander : « J'applique `deploy/k8s/countrizz.yaml` sur le cluster depuis rpi1 (`kubectl apply`, étiquette 1.8) et j'attends le déploiement. GO ? » Puis Run :

```bash
ssh pablo1@192.168.1.171 'kubectl apply -f -' < deploy/k8s/countrizz.yaml
ssh pablo1@192.168.1.171 'kubectl -n countrizz rollout status deploy/countrizz-web --timeout=300s'
ssh pablo1@192.168.1.171 "kubectl -n countrizz get deploy countrizz-web -o jsonpath='{.spec.template.spec.containers[0].image}'"; echo
```

Expected : `deployment.apps/countrizz-web configured` ; `deployment "countrizz-web" successfully rolled out` ; `pablohassan/countrizz-web:1.8`. Retour arrière si le site casse : remettre `1.7` dans `countrizz.yaml` et réappliquer, sur GO.

- [ ] **Step 8 : sur le site.** Run : `cd web && npm run e2e && npm run budget`. Expected : la préparation passe ; `<E_SITE> passed`, aucun échec ni test sauté ; budget `6 passed`. Un échec : superpowers:systematic-debugging ; rien n'est changé en ligne sans GO. Puis, dans la ligne du Step 4 de `docs/HANDOFF.md`, `Image \`countrizz-web:1.8\` à construire et déployer sur GO.` devient `**\`countrizz-web:1.8\` en ligne** (<JJ/MM>, GO de l'utilisateur) : sur countrizz.fr, e2e <E_SITE> passed, budget 6 passed.` Commit :

```bash
git add docs/HANDOFF.md
git commit -m "passation : countrizz-web 1.8 en ligne (le jeu complet), e2e et budget sur countrizz.fr — spec 2A §9, §11"
```

- [ ] **Step 9 : sur de vrais téléphones (l'utilisateur).** Lui demander de jouer une partie sur countrizz.fr depuis un iPhone (Safari) et un Android : rendu du dégradé des lettres et de la bille du titre (vérifié seulement dans Chromium), « Tourne ton téléphone », vibrations (spec §13.1 : le réglage fin des motifs se fait alors, au doigt, dans `web/src/ui/haptics.ts`).
