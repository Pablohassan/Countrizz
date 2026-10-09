# Countrizz — Phase 2A, plan 3 : moteur du jeu et catalogues de langue · plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** la logique complète d'une partie de Countrizz (tirage, chrono net, score, enchaînement des écrans, scores locaux) et les textes de l'interface en français et en anglais, en TypeScript pur, testés sans navigateur, prêts à être branchés à l'interface (plan 2A-5).

**Architecture:** approche A du spec (§1) : `web/src/game/` contient des fonctions pures, et un réducteur `reduce(état, événement) → état` porte l'enchaînement des écrans. Le temps (`now`) et la graine arrivent dans les événements. Les effets (vols du globe, minuteries, stockage) restent à l'appelant. `web/src/i18n/` contient deux catalogues du même type (`fr.ts`, `en.ts`), la détection de langue et le remplissage des gabarits. Aucun écran ne change dans ce plan, donc il n'y a rien à déployer.

**Tech Stack:** TypeScript 5.9, Vitest 5 (projet `unit`, tests à côté des sources comme `src/camera/*.test.ts`), aucun paquet nouveau.

**Spec:** `docs/superpowers/specs/2026-10-05-countrizz-phase2a-design.md` §1 (architecture), §2 (parcours), §3 (textes des écrans), §10 (erreurs), §11 (tests) ; règles d'origine : `docs/superpowers/specs/2026-10-02-countrizz-refonte-design.md` §6.1-6.2 ; textes exacts : maquettes validées de `docs/superpowers/brainstorm/2026-10-03-phase2a-interface/ecrans/` (relevés le 09/10) ; tests : `…/section-5-tests-erreurs.md`.

## Global Constraints

- **Aucun nouveau paquet** pour le jeu (spec §1).
- **Chrono net de 60 s** : en pause pendant le vol, la révélation, onglet caché et « Tourne ton téléphone ». À zéro, la question en cours n'est pas comptée (spec §2).
- **Le premier vol part pendant le 3-2-1** : la première question arrive juste après « GO ! » (spec §2, D17).
- **+10 par bonne réponse, 0 sinon.** Tirage : aucun pays deux fois, jamais deux réponses identiques dans la langue jouée, difficulté progressive (monde → même région après 3 bonnes d'affilée → sous-région ou voisins après 6) (spec §2).
- « Quitter » sans confirmation. Pas de son (spec §2).
- Révélation : **1,5 s** (spec §3).
- Scores : **top 10 local par mode**, à égalité le plus ancien d'abord, « Nouveau record ! » ; stockage indisponible → scores gardés le temps de la visite, « Ton score ne peut pas être gardé sur cet appareil » (spec §10, section 5).
- Langue : celle du navigateur, puis le choix mémorisé ; `fr.ts` et `en.ts` du même type ; aucune chaîne vide (spec §1, section 5).
- Nom du joueur : **12 caractères au plus** (spec §3, accueil).
- Modes : **Drapeau / Pays / Capitale** (spec §12).
- Tests d'abord ; `npm run check` (types + unitaires) depuis `web/`.

## Décisions de ce plan (à valider avec lui)

1. **Graine et temps dans les événements.** Le réducteur ne lit ni `Date.now()` ni `Math.random()`. Une même suite d'événements produit toujours la même partie.
2. **Générateur `mulberry32`** (32 bits). Son état est stocké dans l'état du jeu pour que le réducteur reste pur.
3. **Le niveau de difficulté suit la série de bonnes réponses en cours.** Une erreur ramène au niveau « monde ». S'il n'y a pas assez de mauvaises réponses distinctes au niveau voulu, on élargit d'un cran (voisins → région → monde).
4. **Drapeaux presque identiques jamais proposés ensemble** en mode Drapeau : Indonésie / Monaco, Roumanie / Tchad. Deux libellés identiques ne le sont jamais, quel que soit le mode.
5. **« Nouveau record ! »** quand le meilleur score du mode est strictement battu. La toute première partie d'un mode compte aussi comme record si son score dépasse 0.
6. **Langue d'un navigateur ni français ni anglais : l'anglais.**
7. **Les listes `capitals.fr` / `capitals.en` ne servent pas au moteur.** Le jeu est à choix multiples et les mauvaises réponses sont les capitales de jeu (`capital`) d'autres pays. L'écart FR/EN relevé par la revue du plan 2A-2 n'a donc aucun effet ici.
8. **Textes EN** : ce sont mes traductions des maquettes françaises, à relire par l'utilisateur. Quelques libellés absents des maquettes sont ajoutés en FR comme en EN : accessibilité du HUD et de la révélation (`hud.secondsLeft`, `hud.paused`, `reveal.correct`, `reveal.wrong`), scores vides (`scores.empty`), sélecteur de langue (`home.language`).

## Review Focus

1. **Pauses qui se chevauchent** : l'onglet est caché pendant un vol, puis le vol se termine pendant que l'onglet est toujours caché. Le chrono doit rester arrêté jusqu'à la fin des deux causes, et repartir sans perdre ni gagner de temps (test en Task 3).
2. **Événements en double ou à contretemps** : double appui sur une réponse, arrivée signalée deux fois, fin de révélation reçue deux fois, réponse pendant un vol. Ils sont ignorés, sans compter de points en double (test en Task 5).
3. **Scores enregistrés abîmés ou étrangers** : JSON invalide, mauvaise forme, plus de 10 entrées, nom trop long. La lecture rend une liste propre et ne plante jamais ; un stockage qui refuse l'écriture bascule en mémoire (test en Task 6).
4. **Nom saisi avec émoji, espaces ou plus de 12 caractères** : il est coupé par caractère visible, sans couper un émoji en deux ; s'il est vide, on prend le nom par défaut de la langue (test en Task 6).
5. **Langues du navigateur variées** (`fr-CA`, `EN-us`, `de`, liste vide) et choix mémorisé invalide : la langue retenue est la bonne, et une valeur inconnue en stockage est ignorée (test en Task 7).

---

### Task 1: Types et générateur pseudo-aléatoire

**Files:**
- Create: `web/src/game/types.ts`
- Create: `web/src/game/rng.ts`
- Test: `web/src/game/rng.test.ts`

**Interfaces:**
- Produces :
  - `type Mode = 'flag' | 'country' | 'capital'`, `const MODES: readonly Mode[]`, `type Lang = 'fr' | 'en'`
  - `type DrawCountry = Pick<CountryRecord, 'cca3' | 'region' | 'subregion' | 'neighbors' | 'name' | 'capital' | 'flag'>`
  - `interface Question { cca3: string; options: string[]; answer: number }` (quatre codes cca3 ; `options[answer] === cca3`)
  - `interface Rng { next(): number; readonly state: number }`, `createRng(seed: number): Rng`

- [ ] **Step 1: Écrire le test (qui échoue)**

`web/src/game/rng.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

const take = (seed: number, n: number) => { const r = createRng(seed); return Array.from({ length: n }, () => r.next()); };

describe('createRng (mulberry32)', () => {
  it('même graine, même suite', () => {
    expect(take(42, 50)).toEqual(take(42, 50));
  });
  it('graines différentes, suites différentes', () => {
    expect(take(42, 5)).not.toEqual(take(43, 5));
  });
  it('valeurs dans [0, 1)', () => {
    for (const v of take(7, 10_000)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('l\'état exposé permet de reprendre exactement la suite (réducteur pur)', () => {
    const a = createRng(1234);
    a.next(); a.next(); a.next();
    const b = createRng(a.state);
    expect([b.next(), b.next()]).toEqual([a.next(), a.next()]);
  });
});
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `cd web && npx vitest run --project unit src/game/rng.test.ts`
Expected: FAIL (`Cannot find module './rng'`).

- [ ] **Step 3: Implémenter**

`web/src/game/types.ts` :

```ts
import type { CountryRecord } from '../data/types';

/** Les trois modes du jeu (spec 2A §12) : Drapeau, Pays, Capitale. */
export type Mode = 'flag' | 'country' | 'capital';
export const MODES: readonly Mode[] = ['flag', 'country', 'capital'];

export type Lang = 'fr' | 'en';

/** Ce dont le tirage a besoin d'un pays. */
export type DrawCountry = Pick<CountryRecord, 'cca3' | 'region' | 'subregion' | 'neighbors' | 'name' | 'capital' | 'flag'>;

/** Une manche : le pays demandé et quatre réponses (codes cca3) ; `options[answer]` est le pays demandé. */
export interface Question { cca3: string; options: string[]; answer: number }
```

`web/src/game/rng.ts` :

```ts
/** Générateur pseudo-aléatoire mulberry32 : même graine, même suite ; l'état est exposé pour qu'un réducteur reste pur. */
export interface Rng { next(): number; readonly state: number }

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    get state() { return s; },
  };
}
```

- [ ] **Step 4: Vérifier qu'il passe**

Run: `cd web && npx vitest run --project unit src/game/rng.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/game/types.ts web/src/game/rng.ts web/src/game/rng.test.ts
git commit -m "jeu : types et générateur pseudo-aléatoire à graine (mulberry32)"
```

---

### Task 2: Tirage des manches

**Files:**
- Create: `web/src/game/draw.ts`
- Test: `web/src/game/draw.test.ts`

**Interfaces:**
- Consumes : `DrawCountry`, `Mode`, `Lang`, `Question`, `Rng`, `createRng` (Task 1).
- Produces :
  - `DIFFICULTY = { regionAfter: 3, nearAfter: 6 }`
  - `FLAG_LOOKALIKES: readonly (readonly [string, string])[]`
  - `type Level = 'world' | 'region' | 'near'`, `levelFor(streak: number): Level`
  - `labelOf(c: DrawCountry, mode: Mode, lang: Lang): string`
  - `drawQuestion(all: DrawCountry[], asked: ReadonlySet<string>, streak: number, mode: Mode, lang: Lang, rng: Rng): Question | null` (`null` quand plus aucun pays ne reste à demander)

- [ ] **Step 1: Écrire les tests (qui échouent)**

`web/src/game/draw.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { DIFFICULTY, drawQuestion, FLAG_LOOKALIKES, labelOf, levelFor } from './draw';
import { createRng } from './rng';
import { MODES, type DrawCountry, type Lang, type Mode, type Question } from './types';

const all = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const by = new Map(all.map((c) => [c.cca3, c]));
const near = (t: DrawCountry, c: DrawCountry) => c.subregion === t.subregion || t.neighbors.includes(c.cca3);

/** Une partie simulée : bonnes et mauvaises réponses tirées par une graine à part. */
function play(seed: number, rounds: number): { mode: Mode; lang: Lang; qs: { q: Question; streak: number }[] } {
  const meta = createRng(seed ^ 0x9e3779b9);
  const mode = MODES[Math.floor(meta.next() * 3)]!;
  const lang: Lang = meta.next() < 0.5 ? 'fr' : 'en';
  const rng = createRng(seed);
  const asked = new Set<string>();
  const qs: { q: Question; streak: number }[] = [];
  let streak = 0;
  for (let i = 0; i < rounds; i++) {
    const q = drawQuestion(all, asked, streak, mode, lang, rng)!;
    qs.push({ q, streak });
    asked.add(q.cca3);
    streak = meta.next() < 0.75 ? streak + 1 : 0;
  }
  return { mode, lang, qs };
}

describe('niveau de difficulté', () => {
  it('monde, puis région après 3 bonnes d\'affilée, puis voisins après 6', () => {
    expect([0, 2, 3, 5, 6, 20].map(levelFor)).toEqual(['world', 'world', 'region', 'region', 'near', 'near']);
    expect(DIFFICULTY).toEqual({ regionAfter: 3, nearAfter: 6 });
  });
});

describe('drawQuestion', () => {
  it('libellé : drapeau, nom ou capitale dans la langue jouée', () => {
    const fra = by.get('FRA')!;
    expect(labelOf(fra, 'flag', 'fr')).toBe('flags/fra.svg');
    expect(labelOf(by.get('COD')!, 'country', 'fr')).toBe('RD Congo');
    expect(labelOf(by.get('UKR')!, 'capital', 'en')).toBe('Kyiv');
  });

  it('10 000 graines : aucun pays deux fois, quatre réponses distinctes à l\'écran, bonne réponse en place, difficulté tenue', () => {
    for (let seed = 1; seed <= 10_000; seed++) {
      const { mode, lang, qs } = play(seed, 25);
      const seen = new Set<string>();
      for (const { q, streak } of qs) {
        expect(seen.has(q.cca3), `graine ${seed} : ${q.cca3} deux fois`).toBe(false);
        seen.add(q.cca3);
        expect(q.options).toHaveLength(4);
        expect(q.options[q.answer]).toBe(q.cca3);
        const labels = q.options.map((k) => labelOf(by.get(k)!, mode, lang));
        expect(new Set(labels).size, `graine ${seed} : ${labels.join(' | ')}`).toBe(4);
        const target = by.get(q.cca3)!;
        const level = levelFor(streak);
        const others = q.options.filter((k) => k !== q.cca3).map((k) => by.get(k)!);
        // Assez de candidats au niveau voulu (5 = marge pour les drapeaux jumeaux) : tous les distracteurs y sont.
        if (level === 'near' && all.filter((c) => c !== target && near(target, c)).length >= 5) {
          for (const o of others) expect(near(target, o), `graine ${seed} : ${o.cca3} n'est pas proche de ${q.cca3}`).toBe(true);
        }
        if (level === 'region' && all.filter((c) => c !== target && c.region === target.region).length >= 5) {
          for (const o of others) expect(o.region, `graine ${seed}`).toBe(target.region);
        }
      }
    }
  }, 60_000);

  it('même graine, même partie', () => {
    expect(play(77, 30)).toEqual(play(77, 30));
  });

  it('mode Drapeau : jamais deux drapeaux jumeaux ensemble', () => {
    for (let seed = 1; seed <= 2_000; seed++) {
      const rng = createRng(seed);
      for (const target of ['IDN', 'MCO', 'ROU', 'TCD']) {
        const asked = new Set(all.map((c) => c.cca3).filter((k) => k !== target));
        const q = drawQuestion(all, asked, 0, 'flag', 'fr', rng)!; // niveau « monde » : les jumeaux pourraient s'y croiser
        for (const [a, b] of FLAG_LOOKALIKES) expect(q.options.includes(a) && q.options.includes(b), `${a}/${b}`).toBe(false);
      }
    }
  });

  it('plus aucun pays à demander : null', () => {
    expect(drawQuestion(all, new Set(all.map((c) => c.cca3)), 0, 'country', 'fr', createRng(1))).toBeNull();
  });

  it('pays isolé (voisins et sous-région trop petits) : on élargit au lieu d\'échouer', () => {
    const asked = new Set(all.map((c) => c.cca3).filter((k) => k !== 'AUS'));
    const q = drawQuestion(all, asked, 10, 'country', 'fr', createRng(5))!;
    expect(q.cca3).toBe('AUS');
    expect(new Set(q.options).size).toBe(4);
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `cd web && npx vitest run --project unit src/game/draw.test.ts`
Expected: FAIL (`Cannot find module './draw'`).

- [ ] **Step 3: Implémenter**

`web/src/game/draw.ts` :

```ts
import type { Rng } from './rng';
import type { DrawCountry, Lang, Mode, Question } from './types';

/** Seuils de la difficulté progressive (spec 2A §2, refonte §6.1) : série de bonnes réponses en cours. */
export const DIFFICULTY = { regionAfter: 3, nearAfter: 6 } as const;

/** Drapeaux presque identiques : jamais proposés ensemble en mode Drapeau. */
export const FLAG_LOOKALIKES: readonly (readonly [string, string])[] = [['IDN', 'MCO'], ['ROU', 'TCD']];

export type Level = 'world' | 'region' | 'near';

export const levelFor = (streak: number): Level =>
  streak >= DIFFICULTY.nearAfter ? 'near' : streak >= DIFFICULTY.regionAfter ? 'region' : 'world';

/** Ce que le joueur voit d'une réponse : sert à garantir quatre réponses distinctes à l'écran. */
export function labelOf(c: DrawCountry, mode: Mode, lang: Lang): string {
  return mode === 'flag' ? c.flag : mode === 'country' ? c.name[lang] : c.capital[lang];
}

const twins = (a: string, b: string) => FLAG_LOOKALIKES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

function poolAt(target: DrawCountry, all: DrawCountry[], level: Level): DrawCountry[] {
  if (level === 'world') return all;
  if (level === 'region') return all.filter((c) => c.region === target.region);
  return all.filter((c) => c.subregion === target.subregion || target.neighbors.includes(c.cca3));
}

function shuffled<T>(list: readonly T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Prochaine manche : un pays jamais demandé, au hasard ; trois mauvaises réponses prises au niveau de difficulté de la
 * série en cours, élargi d'un cran (voisins → région → monde) tant qu'il en manque ; quatre libellés distincts dans la
 * langue jouée ; en mode Drapeau, jamais deux drapeaux jumeaux. `null` : plus aucun pays à demander.
 */
export function drawQuestion(all: DrawCountry[], asked: ReadonlySet<string>, streak: number, mode: Mode, lang: Lang, rng: Rng): Question | null {
  const fresh = all.filter((c) => !asked.has(c.cca3));
  if (fresh.length === 0) return null;
  const target = fresh[Math.floor(rng.next() * fresh.length)]!;
  const levels: Level[] = ['near', 'region', 'world'];
  const chosen: DrawCountry[] = [];
  const labels = new Set([labelOf(target, mode, lang)]);
  for (const level of levels.slice(levels.indexOf(levelFor(streak)))) {
    for (const c of shuffled(poolAt(target, all, level), rng)) {
      if (chosen.length === 3) break;
      if (c.cca3 === target.cca3 || chosen.includes(c)) continue;
      const label = labelOf(c, mode, lang);
      if (labels.has(label)) continue;
      if (mode === 'flag' && [target, ...chosen].some((o) => twins(o.cca3, c.cca3))) continue;
      chosen.push(c);
      labels.add(label);
    }
    if (chosen.length === 3) break;
  }
  if (chosen.length < 3) throw new Error(`tirage : moins de quatre réponses distinctes possibles pour ${target.cca3}`);
  const answer = Math.floor(rng.next() * 4);
  const options = chosen.map((c) => c.cca3);
  options.splice(answer, 0, target.cca3);
  return { cca3: target.cca3, options, answer };
}
```

- [ ] **Step 4: Vérifier qu'ils passent**

Run: `cd web && npx vitest run --project unit src/game/draw.test.ts`
Expected: PASS (6 tests). Le test des 10 000 graines doit rester sous sa limite de 60 s ; noter sa durée.

- [ ] **Step 5: Commit**

```bash
git add web/src/game/draw.ts web/src/game/draw.test.ts
git commit -m "jeu : tirage des manches (aucun pays deux fois, réponses distinctes, difficulté progressive)"
```

---

### Task 3: Chrono net

**Files:**
- Create: `web/src/game/clock.ts`
- Test: `web/src/game/clock.test.ts`

**Interfaces:**
- Produces :
  - `type PauseReason = 'flight' | 'reveal' | 'hidden' | 'rotate'`
  - `interface Clock { durationMs: number; usedMs: number; runningSince: number | null; started: boolean; reasons: PauseReason[] }`
  - `createClock(durationMs: number, reasons?: PauseReason[]): Clock`
  - `startClock(c: Clock, now: number): Clock`, `pauseClock(c: Clock, reason: PauseReason, now: number): Clock`, `resumeClock(c: Clock, reason: PauseReason, now: number): Clock`
  - `remainingMs(c: Clock, now: number): number`, `isRunning(c: Clock): boolean`

- [ ] **Step 1: Écrire les tests (qui échouent)**

`web/src/game/clock.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createClock, isRunning, pauseClock, remainingMs, resumeClock, startClock } from './clock';

describe('chrono net', () => {
  it('ne tourne pas avant le départ', () => {
    const c = createClock(60_000);
    expect(remainingMs(c, 5_000)).toBe(60_000);
    expect(isRunning(c)).toBe(false);
  });
  it('décompte après le départ, jamais sous zéro', () => {
    const c = startClock(createClock(60_000), 1_000);
    expect(remainingMs(c, 11_000)).toBe(50_000);
    expect(remainingMs(c, 999_000)).toBe(0);
  });
  it('en pause pendant le vol : reprise exacte', () => {
    let c = startClock(createClock(60_000), 0);
    c = pauseClock(c, 'flight', 10_000);
    expect(remainingMs(c, 25_000)).toBe(50_000);
    c = resumeClock(c, 'flight', 25_000);
    expect(remainingMs(c, 30_000)).toBe(45_000);
  });
  it('démarré pendant un vol (premier vol pendant le 3-2-1) : attend la fin du vol', () => {
    let c = createClock(60_000, ['flight']);
    c = startClock(c, 4_000);
    expect(isRunning(c)).toBe(false);
    c = resumeClock(c, 'flight', 6_000);
    expect(remainingMs(c, 16_000)).toBe(50_000);
  });
  it('pauses qui se chevauchent : arrêté tant qu\'une cause reste (onglet caché pendant un vol)', () => {
    let c = startClock(createClock(60_000), 0);
    c = pauseClock(c, 'flight', 10_000);
    c = pauseClock(c, 'hidden', 12_000);
    c = resumeClock(c, 'flight', 14_000);      // le vol finit, l'onglet est encore caché
    expect(isRunning(c)).toBe(false);
    expect(remainingMs(c, 40_000)).toBe(50_000);
    c = resumeClock(c, 'hidden', 40_000);
    expect(remainingMs(c, 41_000)).toBe(49_000);
  });
  it('pause et reprise répétées : sans effet de bord', () => {
    let c = startClock(createClock(60_000), 0);
    c = pauseClock(c, 'reveal', 5_000);
    c = pauseClock(c, 'reveal', 6_000);
    c = resumeClock(c, 'reveal', 7_000);
    c = resumeClock(c, 'reveal', 8_000);
    expect(remainingMs(c, 9_000)).toBe(53_000);
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `cd web && npx vitest run --project unit src/game/clock.test.ts`
Expected: FAIL (`Cannot find module './clock'`).

- [ ] **Step 3: Implémenter**

`web/src/game/clock.ts` :

```ts
/** Causes de pause du chrono net (spec 2A §2) : vol, révélation, onglet caché, « Tourne ton téléphone ». */
export type PauseReason = 'flight' | 'reveal' | 'hidden' | 'rotate';

/** Chrono net : il ne tourne que démarré et sans aucune cause de pause ; `usedMs` = temps déjà consommé. */
export interface Clock {
  durationMs: number;
  usedMs: number;
  runningSince: number | null;
  started: boolean;
  reasons: PauseReason[];
}

export const createClock = (durationMs: number, reasons: PauseReason[] = []): Clock =>
  ({ durationMs, usedMs: 0, runningSince: null, started: false, reasons: [...new Set(reasons)] });

const used = (c: Clock, now: number) => c.usedMs + (c.runningSince === null ? 0 : now - c.runningSince);

export function startClock(c: Clock, now: number): Clock {
  if (c.started) return c;
  return { ...c, started: true, runningSince: c.reasons.length === 0 ? now : null };
}

export function pauseClock(c: Clock, reason: PauseReason, now: number): Clock {
  if (c.reasons.includes(reason)) return c;
  return { ...c, usedMs: used(c, now), runningSince: null, reasons: [...c.reasons, reason] };
}

export function resumeClock(c: Clock, reason: PauseReason, now: number): Clock {
  if (!c.reasons.includes(reason)) return c;
  const reasons = c.reasons.filter((r) => r !== reason);
  return { ...c, reasons, runningSince: c.started && reasons.length === 0 ? now : null };
}

export const remainingMs = (c: Clock, now: number): number => Math.max(0, c.durationMs - used(c, now));
export const isRunning = (c: Clock): boolean => c.runningSince !== null;
```

- [ ] **Step 4: Vérifier qu'ils passent**

Run: `cd web && npx vitest run --project unit src/game/clock.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/game/clock.ts web/src/game/clock.test.ts
git commit -m "jeu : chrono net (pauses cumulées, reprise exacte)"
```

---

### Task 4: Score d'une partie

**Files:**
- Create: `web/src/game/rules.ts`
- Test: `web/src/game/rules.test.ts`

**Interfaces:**
- Produces : `POINTS_PER_ANSWER = 10`, `GAME_MS = 60_000`, `interface Round { cca3: string; ok: boolean }`, `interface Tally { score: number; correct: number; rounds: Round[] }`, `emptyTally(): Tally`, `recordAnswer(t: Tally, cca3: string, ok: boolean): Tally`

- [ ] **Step 1: Écrire le test (qui échoue)**

`web/src/game/rules.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { emptyTally, GAME_MS, POINTS_PER_ANSWER, recordAnswer } from './rules';

describe('score', () => {
  it('+10 par bonne réponse, 0 sinon ; « bonnes / total » ; drapeaux de la partie dans l\'ordre', () => {
    let t = emptyTally();
    t = recordAnswer(t, 'FRA', true);
    t = recordAnswer(t, 'JPN', false);
    t = recordAnswer(t, 'BRA', true);
    expect(t.score).toBe(20);
    expect(t.correct).toBe(2);
    expect(t.rounds).toEqual([{ cca3: 'FRA', ok: true }, { cca3: 'JPN', ok: false }, { cca3: 'BRA', ok: true }]);
  });
  it('constantes du spec', () => {
    expect([POINTS_PER_ANSWER, GAME_MS]).toEqual([10, 60_000]);
  });
});
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `cd web && npx vitest run --project unit src/game/rules.test.ts`
Expected: FAIL (`Cannot find module './rules'`).

- [ ] **Step 3: Implémenter**

`web/src/game/rules.ts` :

```ts
/** +10 par bonne réponse, 0 sinon ; partie de 60 s nettes (spec 2A §2). */
export const POINTS_PER_ANSWER = 10;
export const GAME_MS = 60_000;

/** Une manche répondue : le pays et la réponse (la fin de partie montre les drapeaux, erreurs grisées). */
export interface Round { cca3: string; ok: boolean }
export interface Tally { score: number; correct: number; rounds: Round[] }

export const emptyTally = (): Tally => ({ score: 0, correct: 0, rounds: [] });

export function recordAnswer(t: Tally, cca3: string, ok: boolean): Tally {
  return {
    score: t.score + (ok ? POINTS_PER_ANSWER : 0),
    correct: t.correct + (ok ? 1 : 0),
    rounds: [...t.rounds, { cca3, ok }],
  };
}
```

- [ ] **Step 4: Vérifier qu'il passe**

Run: `cd web && npx vitest run --project unit src/game/rules.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/game/rules.ts web/src/game/rules.test.ts
git commit -m "jeu : score d'une partie (+10, bonnes sur total, manches répondues)"
```

---

### Task 5: Machine d'états

**Files:**
- Create: `web/src/game/machine.ts`
- Test: `web/src/game/machine.test.ts`

**Interfaces:**
- Consumes : `createClock`, `startClock`, `pauseClock`, `resumeClock`, `remainingMs`, `Clock` (Task 3) ; `drawQuestion` (Task 2) ; `createRng` (Task 1) ; `emptyTally`, `recordAnswer`, `GAME_MS`, `Tally` (Task 4).
- Produces :
  - `type Screen = 'home' | 'mode' | 'countdown' | 'flight' | 'question' | 'reveal' | 'end' | 'scores'`
  - `REVEAL_MS = 1500`, `COUNTDOWN_FROM = 3`
  - `interface GameState` (champs ci-dessous), `type GameEvent` (union ci-dessous)
  - `initialState(lang: Lang): GameState`
  - `createGame(countries: DrawCountry[]): (s: GameState, e: GameEvent) => GameState`
- Contrat pour l'appelant (plan 2A-5) : à l'entrée en `countdown` et en `flight`, lancer le vol vers `question.cca3`, puis envoyer `ARRIVED` ; envoyer `COUNTDOWN_TICK` chaque seconde en `countdown` (3, 2, 1, « GO ! », puis départ) ; envoyer `REVEAL_DONE` `REVEAL_MS` après `ANSWER` ; envoyer `TICK` pendant `question` ; envoyer `PAUSE`/`RESUME` à l'onglet caché et au téléphone tourné. Les scores s'enregistrent à l'entrée en `end` (Task 6).

- [ ] **Step 1: Écrire les tests (qui échouent)**

`web/src/game/machine.test.ts` :

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CountryRecord } from '../data/types';
import { remainingMs } from './clock';
import { createGame, initialState, type GameEvent, type GameState } from './machine';

const countries = JSON.parse(readFileSync('public/data/countries.json', 'utf8')) as CountryRecord[];
const reduce = createGame(countries);
const run = (events: GameEvent[], from: GameState = initialState('fr')) => events.reduce(reduce, from);

/** Jusqu'à la première question : premier vol arrivé pendant le décompte. */
const toQuestion: GameEvent[] = [
  { type: 'PLAY' }, { type: 'CHOOSE_MODE', mode: 'country', seed: 42 },
  { type: 'COUNTDOWN_TICK', now: 1_000 }, { type: 'ARRIVED', now: 1_500 },
  { type: 'COUNTDOWN_TICK', now: 2_000 }, { type: 'COUNTDOWN_TICK', now: 3_000 }, { type: 'COUNTDOWN_TICK', now: 4_000 },
];

describe('machine d\'états du jeu', () => {
  it('accueil → mode → 3-2-1 : la première manche est tirée et son vol part pendant le décompte', () => {
    const s = run([{ type: 'PLAY' }, { type: 'CHOOSE_MODE', mode: 'flag', seed: 7 }]);
    expect(s.screen).toBe('countdown');
    expect(s.countdown).toBe(3);
    expect(s.question?.options).toHaveLength(4);
    expect(s.asked).toEqual([s.question!.cca3]);
  });

  it('premier vol arrivé avant « GO ! » : la question arrive juste après, chrono lancé', () => {
    const s = run(toQuestion);
    expect(s.screen).toBe('question');
    expect(remainingMs(s.clock, 14_000)).toBe(50_000);
  });

  it('premier vol plus long que le décompte : écran de vol, chrono en pause jusqu\'à l\'arrivée', () => {
    const s = run([
      { type: 'PLAY' }, { type: 'CHOOSE_MODE', mode: 'country', seed: 42 },
      { type: 'COUNTDOWN_TICK', now: 1_000 }, { type: 'COUNTDOWN_TICK', now: 2_000 },
      { type: 'COUNTDOWN_TICK', now: 3_000 }, { type: 'COUNTDOWN_TICK', now: 4_000 },
    ]);
    expect(s.screen).toBe('flight');
    expect(remainingMs(s.clock, 9_000)).toBe(60_000);
    const q = reduce(s, { type: 'ARRIVED', now: 9_000 });
    expect(q.screen).toBe('question');
    expect(remainingMs(q.clock, 19_000)).toBe(50_000);
  });

  it('bonne réponse : révélation, +10, série +1, chrono en pause ; puis manche suivante en vol', () => {
    const q = run(toQuestion);
    const r = reduce(q, { type: 'ANSWER', index: q.question!.answer, now: 10_000 });
    expect(r.screen).toBe('reveal');
    expect([r.tally.score, r.tally.correct, r.streak, r.picked]).toEqual([10, 1, 1, q.question!.answer]);
    expect(remainingMs(r.clock, 11_500)).toBe(54_000);
    const f = reduce(r, { type: 'REVEAL_DONE', now: 11_500 });
    expect(f.screen).toBe('flight');
    expect(f.asked).toHaveLength(2);
    expect(f.question!.cca3).not.toBe(q.question!.cca3);
    expect(remainingMs(f.clock, 14_000)).toBe(54_000);
  });

  it('mauvaise réponse : 0 point, série remise à zéro', () => {
    const q = run(toQuestion);
    const wrong = (q.question!.answer + 1) % 4;
    const r = reduce({ ...q, streak: 5 }, { type: 'ANSWER', index: wrong, now: 10_000 });
    expect([r.tally.score, r.tally.correct, r.tally.rounds.length, r.streak]).toEqual([0, 0, 1, 0]);
  });

  it('temps écoulé pendant une question : fin, la question en cours n\'est pas comptée', () => {
    const q = run(toQuestion);
    expect(reduce(q, { type: 'TICK', now: 63_999 }).screen).toBe('question');
    const end = reduce(q, { type: 'TICK', now: 64_000 });
    expect(end.screen).toBe('end');
    expect(end.tally.rounds).toHaveLength(0);
  });

  it('onglet caché et téléphone tourné : chrono en pause, reprise exacte', () => {
    let s = run(toQuestion);
    s = reduce(s, { type: 'PAUSE', reason: 'hidden', now: 10_000 });
    s = reduce(s, { type: 'PAUSE', reason: 'rotate', now: 11_000 });
    s = reduce(s, { type: 'RESUME', reason: 'hidden', now: 30_000 });
    expect(reduce(s, { type: 'TICK', now: 70_000 }).screen).toBe('question');
    s = reduce(s, { type: 'RESUME', reason: 'rotate', now: 40_000 });
    expect(remainingMs(s.clock, 41_000)).toBe(53_000);
  });

  it('événements en double ou à contretemps : ignorés', () => {
    const q = run(toQuestion);
    const r = reduce(q, { type: 'ANSWER', index: q.question!.answer, now: 10_000 });
    expect(reduce(r, { type: 'ANSWER', index: q.question!.answer, now: 10_050 })).toBe(r);   // double appui
    const f = reduce(r, { type: 'REVEAL_DONE', now: 11_500 });
    expect(reduce(f, { type: 'REVEAL_DONE', now: 11_600 })).toBe(f);                         // fin de révélation en double
    expect(reduce(f, { type: 'ANSWER', index: 0, now: 11_700 })).toBe(f);                     // réponse pendant un vol
    const a = reduce(f, { type: 'ARRIVED', now: 13_000 });
    expect(reduce(a, { type: 'ARRIVED', now: 13_100 })).toBe(a);                              // arrivée en double
    expect(reduce(q, { type: 'ANSWER', index: 7, now: 10_000 })).toBe(q);                     // index hors grille
  });

  it('Quitter sans confirmation : retour à l\'accueil, langue gardée', () => {
    const s = run([...toQuestion, { type: 'QUIT' }], initialState('en'));
    expect(s.screen).toBe('home');
    expect(s.lang).toBe('en');
  });

  it('fin : Rejouer (nouvelle graine, même mode), Changer de mode, Scores puis Retour à la fin', () => {
    const end = reduce(run(toQuestion), { type: 'TICK', now: 64_000 });
    const again = reduce(end, { type: 'REPLAY', seed: 99 });
    expect([again.screen, again.mode, again.seed, again.tally.rounds.length, again.asked.length]).toEqual(['countdown', 'country', 99, 0, 1]);
    expect(reduce(end, { type: 'CHANGE_MODE' }).screen).toBe('mode');
    const scores = reduce(end, { type: 'SHOW_SCORES' });
    expect(scores.screen).toBe('scores');
    expect(reduce(scores, { type: 'BACK' }).screen).toBe('end');
  });

  it('accueil : langue changeable, Scores puis Retour à l\'accueil ; Retour depuis le choix du mode', () => {
    let s = reduce(initialState('fr'), { type: 'SET_LANG', lang: 'en' });
    expect(s.lang).toBe('en');
    s = reduce(s, { type: 'SHOW_SCORES' });
    expect(reduce(s, { type: 'BACK' }).screen).toBe('home');
    expect(run([{ type: 'PLAY' }, { type: 'BACK' }]).screen).toBe('home');
  });

  it('même graine et mêmes événements : même partie', () => {
    expect(run(toQuestion)).toEqual(run(toQuestion));
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `cd web && npx vitest run --project unit src/game/machine.test.ts`
Expected: FAIL (`Cannot find module './machine'`).

- [ ] **Step 3: Implémenter**

`web/src/game/machine.ts` :

```ts
import { createClock, pauseClock, remainingMs, resumeClock, startClock, type Clock } from './clock';
import { drawQuestion } from './draw';
import { createRng } from './rng';
import { emptyTally, GAME_MS, recordAnswer, type Tally } from './rules';
import type { DrawCountry, Lang, Mode, Question } from './types';

/** Écrans du parcours (spec 2A §2) ; « À propos », erreurs et « Tourne ton téléphone » sont des calques de l'interface. */
export type Screen = 'home' | 'mode' | 'countdown' | 'flight' | 'question' | 'reveal' | 'end' | 'scores';

export const REVEAL_MS = 1500;
export const COUNTDOWN_FROM = 3;

export interface GameState {
  screen: Screen;
  lang: Lang;
  mode: Mode | null;
  seed: number;
  /** État du générateur après le dernier tirage (réducteur pur). */
  rngState: number;
  /** Pays déjà demandés, dans l'ordre. */
  asked: string[];
  question: Question | null;
  /** Bonnes réponses d'affilée en cours (difficulté). */
  streak: number;
  tally: Tally;
  clock: Clock;
  /** 3, 2, 1, puis 0 = « GO ! ». */
  countdown: number;
  /** Le vol de la manche en cours est arrivé. */
  arrived: boolean;
  /** Réponse choisie, pendant la révélation. */
  picked: number | null;
  /** Écran d'où l'on est venu aux scores (accueil ou fin). */
  scoresFrom: 'home' | 'end' | null;
}

export type GameEvent =
  | { type: 'SET_LANG'; lang: Lang }
  | { type: 'PLAY' }
  | { type: 'BACK' }
  | { type: 'SHOW_SCORES' }
  | { type: 'CHOOSE_MODE'; mode: Mode; seed: number }
  | { type: 'COUNTDOWN_TICK'; now: number }
  | { type: 'ARRIVED'; now: number }
  | { type: 'ANSWER'; index: number; now: number }
  | { type: 'REVEAL_DONE'; now: number }
  | { type: 'TICK'; now: number }
  | { type: 'PAUSE'; reason: 'hidden' | 'rotate'; now: number }
  | { type: 'RESUME'; reason: 'hidden' | 'rotate'; now: number }
  | { type: 'QUIT' }
  | { type: 'REPLAY'; seed: number }
  | { type: 'CHANGE_MODE' };

export const initialState = (lang: Lang): GameState => ({
  screen: 'home', lang, mode: null, seed: 0, rngState: 0, asked: [], question: null, streak: 0,
  tally: emptyTally(), clock: createClock(GAME_MS), countdown: COUNTDOWN_FROM, arrived: false, picked: null, scoresFrom: null,
});

const IN_GAME: readonly Screen[] = ['countdown', 'flight', 'question', 'reveal'];

export function createGame(countries: DrawCountry[]): (s: GameState, e: GameEvent) => GameState {
  /** Nouvelle partie : première manche tirée, son vol part pendant le 3-2-1 (chrono pas encore lancé, cause « vol »). */
  function newGame(s: GameState, mode: Mode, seed: number): GameState {
    const rng = createRng(seed);
    const question = drawQuestion(countries, new Set(), 0, mode, s.lang, rng);
    if (!question) throw new Error('jeu : aucun pays à demander');
    return {
      ...s, screen: 'countdown', mode, seed, rngState: rng.state, asked: [question.cca3], question, streak: 0,
      tally: emptyTally(), clock: createClock(GAME_MS, ['flight']), countdown: COUNTDOWN_FROM, arrived: false, picked: null,
    };
  }

  return function reduce(s: GameState, e: GameEvent): GameState {
    switch (e.type) {
      case 'SET_LANG':
        return s.screen === 'home' && s.lang !== e.lang ? { ...s, lang: e.lang } : s;
      case 'PLAY':
        return s.screen === 'home' ? { ...s, screen: 'mode' } : s;
      case 'SHOW_SCORES':
        return s.screen === 'home' || s.screen === 'end' ? { ...s, screen: 'scores', scoresFrom: s.screen } : s;
      case 'BACK':
        if (s.screen === 'mode') return { ...s, screen: 'home' };
        if (s.screen === 'scores') return { ...s, screen: s.scoresFrom ?? 'home', scoresFrom: null };
        return s;
      case 'CHOOSE_MODE':
        return s.screen === 'mode' ? newGame(s, e.mode, e.seed) : s;
      case 'COUNTDOWN_TICK': {
        if (s.screen !== 'countdown') return s;
        if (s.countdown > 0) return { ...s, countdown: s.countdown - 1 };
        return { ...s, clock: startClock(s.clock, e.now), screen: s.arrived ? 'question' : 'flight' };
      }
      case 'ARRIVED':
        if (s.screen === 'countdown' && !s.arrived) return { ...s, arrived: true, clock: resumeClock(s.clock, 'flight', e.now) };
        if (s.screen !== 'flight') return s;
        return { ...s, screen: 'question', arrived: true, clock: resumeClock(s.clock, 'flight', e.now) };
      case 'ANSWER': {
        if (s.screen !== 'question' || !s.question || !Number.isInteger(e.index) || e.index < 0 || e.index > 3) return s;
        const ok = e.index === s.question.answer;
        return {
          ...s, screen: 'reveal', picked: e.index, streak: ok ? s.streak + 1 : 0,
          tally: recordAnswer(s.tally, s.question.cca3, ok), clock: pauseClock(s.clock, 'reveal', e.now),
        };
      }
      case 'REVEAL_DONE': {
        if (s.screen !== 'reveal' || !s.mode) return s;
        const rng = createRng(s.rngState);
        const question = drawQuestion(countries, new Set(s.asked), s.streak, s.mode, s.lang, rng);
        const resumed = resumeClock(s.clock, 'reveal', e.now);
        if (!question) return { ...s, screen: 'end', clock: resumed, picked: null, question: null };
        return {
          ...s, screen: 'flight', rngState: rng.state, asked: [...s.asked, question.cca3], question, arrived: false,
          picked: null, clock: pauseClock(resumed, 'flight', e.now),
        };
      }
      case 'TICK':
        // Le chrono ne tourne que pendant une question : c'est là seulement qu'il peut atteindre zéro.
        if (s.screen !== 'question' || remainingMs(s.clock, e.now) > 0) return s;
        return { ...s, screen: 'end', question: null, picked: null };
      case 'PAUSE':
        return IN_GAME.includes(s.screen) ? { ...s, clock: pauseClock(s.clock, e.reason, e.now) } : s;
      case 'RESUME':
        return IN_GAME.includes(s.screen) ? { ...s, clock: resumeClock(s.clock, e.reason, e.now) } : s;
      case 'QUIT':
        return IN_GAME.includes(s.screen) ? initialState(s.lang) : s;
      case 'REPLAY':
        return s.screen === 'end' && s.mode ? newGame(s, s.mode, e.seed) : s;
      case 'CHANGE_MODE':
        return s.screen === 'end' ? { ...s, screen: 'mode' } : s;
    }
  };
}
```

- [ ] **Step 4: Vérifier qu'ils passent**

Run: `cd web && npx vitest run --project unit src/game/machine.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/game/machine.ts web/src/game/machine.test.ts
git commit -m "jeu : machine d'états (premier vol pendant le 3-2-1, chrono net, fin, Rejouer, Quitter)"
```

---

### Task 6: Scores locaux, nom du joueur et préférences

**Files:**
- Create: `web/src/game/scores.ts`
- Create: `web/src/game/prefs.ts`
- Test: `web/src/game/scores.test.ts`, `web/src/game/prefs.test.ts`

**Interfaces:**
- Consumes : `Mode` (Task 1).
- Produces :
  - `TOP = 10`, `interface ScoreEntry { name: string; score: number; at: number }`
  - `insertScore(list: readonly ScoreEntry[], entry: ScoreEntry): { list: ScoreEntry[]; rank: number | null; record: boolean; previousBest: number | null }`
  - `interface ScoreBook { read(mode: Mode): ScoreEntry[]; write(mode: Mode, list: ScoreEntry[]): void; readonly persistent: boolean }`
  - `openScoreBook(storage: KeyValueStorage | null): ScoreBook`
  - `type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>`
  - `NAME_MAX = 12`, `normalizeName(input: string, fallback: string): string`
  - `PREF_KEYS = { name: 'countrizz:name', lang: 'countrizz:lang', vibrations: 'countrizz:vibrations' }`, `readPref(storage: KeyValueStorage | null, key: string): string | null`, `writePref(storage: KeyValueStorage | null, key: string, value: string): boolean`

- [ ] **Step 1: Écrire les tests (qui échouent)**

`web/src/game/scores.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { insertScore, openScoreBook, TOP, type KeyValueStorage, type ScoreEntry } from './scores';

const e = (name: string, score: number, at: number): ScoreEntry => ({ name, score, at });

function memory(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: (k) => { data.delete(k); } };
}

describe('top 10 par mode', () => {
  it('score décroissant, à égalité le plus ancien d\'abord ; rang de la nouvelle entrée', () => {
    const r = insertScore([e('Lina', 240, 1), e('Tom', 150, 2)], e('Zoé', 150, 3));
    expect(r.list.map((x) => x.name)).toEqual(['Lina', 'Tom', 'Zoé']);
    expect(r.rank).toBe(3);
  });
  it('au plus 10 ; hors du top : rang null', () => {
    const full = Array.from({ length: TOP }, (_, i) => e(`J${i}`, 100 + i, i));
    const r = insertScore(full, e('Bas', 10, 99));
    expect(r.list).toHaveLength(10);
    expect(r.rank).toBeNull();
  });
  it('« Nouveau record ! » : meilleur strictement battu ; égaler ne suffit pas ; première partie > 0 = record', () => {
    expect(insertScore([e('A', 160, 1)], e('B', 190, 2))).toMatchObject({ record: true, previousBest: 160 });
    expect(insertScore([e('A', 160, 1)], e('B', 160, 2)).record).toBe(false);
    expect(insertScore([], e('B', 30, 2))).toMatchObject({ record: true, previousBest: null });
    expect(insertScore([], e('B', 0, 2)).record).toBe(false);
  });
});

describe('carnet de scores sur l\'appareil', () => {
  it('écrit puis relit, un tableau par mode', () => {
    const s = memory();
    const book = openScoreBook(s);
    book.write('flag', [e('Lina', 240, 1)]);
    expect(openScoreBook(s).read('flag')).toEqual([e('Lina', 240, 1)]);
    expect(openScoreBook(s).read('capital')).toEqual([]);
    expect(book.persistent).toBe(true);
  });
  it('données abîmées ou étrangères : liste propre, jamais d\'exception', () => {
    const s = memory();
    s.data.set('countrizz:scores:flag', '{pas du json');
    s.data.set('countrizz:scores:country', JSON.stringify({ a: 1 }));
    s.data.set('countrizz:scores:capital', JSON.stringify([
      e('Ok', 50, 1), { name: 3, score: 'x' }, null, e('Nom bien trop long pour tenir', 40, 2),
      ...Array.from({ length: 12 }, (_, i) => e(`J${i}`, i, 10 + i)),
    ]));
    const book = openScoreBook(s);
    expect(book.read('flag')).toEqual([]);
    expect(book.read('country')).toEqual([]);
    const cap = book.read('capital');
    expect(cap).toHaveLength(10);
    expect(cap[0]).toEqual(e('Ok', 50, 1));
    expect(cap[1]!.name).toBe('Nom bien tro');
  });
  it('stockage indisponible (navigation privée, écriture refusée) : en mémoire le temps de la visite', () => {
    const refusing: KeyValueStorage = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    const book = openScoreBook(refusing);
    expect(book.persistent).toBe(false);
    book.write('flag', [e('A', 10, 1)]);
    expect(book.read('flag')).toEqual([e('A', 10, 1)]);
    const none = openScoreBook(null);
    expect(none.persistent).toBe(false);
    none.write('country', [e('B', 20, 1)]);
    expect(none.read('country')).toEqual([e('B', 20, 1)]);
  });
});
```

`web/src/game/prefs.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { NAME_MAX, normalizeName, PREF_KEYS, readPref, writePref } from './prefs';

describe('nom du joueur', () => {
  it('12 caractères au plus, espaces nettoyés, nom par défaut si vide', () => {
    expect(NAME_MAX).toBe(12);
    expect(normalizeName('  Lina  ', 'Globetrotteur')).toBe('Lina');
    expect(normalizeName('Jean   Pierre', 'X')).toBe('Jean Pierre');
    expect(normalizeName('Maximilienne-Augustine', 'X')).toBe('Maximilienne');
    expect(normalizeName('   ', 'Globetrotteur')).toBe('Globetrotteur');
  });
  it('coupé par caractère visible : un émoji n\'est jamais coupé en deux', () => {
    const name = normalizeName('🌍🌍🌍🌍🌍🌍🌍🌍🌍🌍🌍🌍🌍', 'X');
    expect(Array.from(name)).toHaveLength(12);
    expect(name).toBe('🌍'.repeat(12));
    expect(normalizeName('Zoé👍🏽abcdefghij', 'X')).toBe('Zoé👍🏽abcdefgh');
  });
});

describe('préférences', () => {
  it('lecture et écriture ; stockage absent ou qui lève : null / false, jamais d\'exception', () => {
    const data = new Map<string, string>();
    const s = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
    expect(writePref(s, PREF_KEYS.lang, 'en')).toBe(true);
    expect(readPref(s, PREF_KEYS.lang)).toBe('en');
    const broken = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); }, removeItem: () => {} };
    expect(readPref(broken, PREF_KEYS.name)).toBeNull();
    expect(writePref(broken, PREF_KEYS.name, 'A')).toBe(false);
    expect(readPref(null, PREF_KEYS.name)).toBeNull();
  });
});
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `cd web && npx vitest run --project unit src/game/scores.test.ts src/game/prefs.test.ts`
Expected: FAIL (modules absents).

- [ ] **Step 3: Implémenter**

`web/src/game/prefs.ts` :

```ts
/** Ce qu'il faut d'un `Storage` (localStorage, ou un double en test). */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const PREF_KEYS = { name: 'countrizz:name', lang: 'countrizz:lang', vibrations: 'countrizz:vibrations' } as const;

/** Nom du joueur : 12 caractères au plus (spec 2A §3, accueil). */
export const NAME_MAX = 12;

/** Graphèmes (un émoji avec modificateur compte pour un) : on ne coupe jamais au milieu. */
const graphemes = (s: string): string[] => Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (g) => g.segment);

export function normalizeName(input: string, fallback: string): string {
  const clean = input.replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  return graphemes(clean).slice(0, NAME_MAX).join('').trim();
}

export function readPref(storage: KeyValueStorage | null, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

export function writePref(storage: KeyValueStorage | null, key: string, value: string): boolean {
  if (!storage) return false;
  try { storage.setItem(key, value); return true; } catch { return false; }
}
```

`web/src/game/scores.ts` :

```ts
import { NAME_MAX, type KeyValueStorage } from './prefs';
import type { Mode } from './types';

export type { KeyValueStorage } from './prefs';

export const TOP = 10;
export interface ScoreEntry { name: string; score: number; at: number }

/** Top 10 du mode : score décroissant, à égalité le plus ancien d'abord (spec 2A §10, section 5). */
const order = (a: ScoreEntry, b: ScoreEntry) => b.score - a.score || a.at - b.at;

/**
 * Ajoute la partie au top 10. « Nouveau record ! » : le meilleur score du mode est strictement battu (une première partie
 * à plus de 0 point en est un). `rank` : place dans le top 10, ou null.
 */
export function insertScore(list: readonly ScoreEntry[], entry: ScoreEntry) {
  const previousBest = list.length > 0 ? Math.max(...list.map((x) => x.score)) : null;
  const top = [...list, entry].sort(order).slice(0, TOP);
  const i = top.indexOf(entry);
  return { list: top, rank: i < 0 ? null : i + 1, record: entry.score > (previousBest ?? 0), previousBest };
}

export interface ScoreBook {
  read(mode: Mode): ScoreEntry[];
  write(mode: Mode, list: ScoreEntry[]): void;
  /** false : les scores ne survivront pas à la visite (« Ton score ne peut pas être gardé sur cet appareil »). */
  readonly persistent: boolean;
}

const key = (mode: Mode) => `countrizz:scores:${mode}`;

/** Garde ce qui ressemble à une entrée ; nom recoupé ; top 10 trié. Rien d'étranger ne plante l'écran des scores. */
function sanitize(raw: unknown): ScoreEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is ScoreEntry => !!x && typeof x === 'object' && typeof x.name === 'string'
      && Number.isFinite(x.score) && Number.isFinite(x.at))
    .map((x) => ({ name: Array.from(x.name).slice(0, NAME_MAX).join(''), score: x.score, at: x.at }))
    .sort(order)
    .slice(0, TOP);
}

function probe(storage: KeyValueStorage | null): boolean {
  if (!storage) return false;
  try { storage.setItem('countrizz:probe', '1'); storage.removeItem('countrizz:probe'); return true; } catch { return false; }
}

export function openScoreBook(storage: KeyValueStorage | null): ScoreBook {
  const persistent = probe(storage);
  const memory = new Map<Mode, ScoreEntry[]>();
  return {
    persistent,
    read(mode) {
      if (!persistent) return memory.get(mode) ?? [];
      try { return sanitize(JSON.parse(storage!.getItem(key(mode)) ?? '[]')); } catch { return []; }
    },
    write(mode, list) {
      if (!persistent) { memory.set(mode, list); return; }
      try { storage!.setItem(key(mode), JSON.stringify(list)); } catch { memory.set(mode, list); }
    },
  };
}
```

Note : dans `sanitize`, le nom est recoupé par point de code (`Array.from`) et non par graphème. C'est un garde-fou contre les données étrangères ; les noms écrits par le jeu passent déjà par `normalizeName`.

- [ ] **Step 4: Vérifier qu'ils passent**

Run: `cd web && npx vitest run --project unit src/game/scores.test.ts src/game/prefs.test.ts`
Expected: PASS (6 + 3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/game/scores.ts web/src/game/prefs.ts web/src/game/scores.test.ts web/src/game/prefs.test.ts
git commit -m "jeu : scores locaux (top 10, record, stockage indisponible), nom du joueur et préférences"
```

---

### Task 7: Catalogues de langue FR / EN

**Files:**
- Create: `web/src/i18n/types.ts`
- Create: `web/src/i18n/fr.ts`
- Create: `web/src/i18n/en.ts`
- Create: `web/src/i18n/index.ts`
- Test: `web/src/i18n/i18n.test.ts`

**Interfaces:**
- Consumes : `Lang`, `Mode` (Task 1).
- Produces : `interface Messages` (ci-dessous), `fr: Messages`, `en: Messages`, `messages: Record<Lang, Messages>`, `detectLang(stored: string | null, browser: readonly string[]): Lang`, `fill(template: string, vars: Record<string, string | number>): string`

Textes FR relevés le 09/10 dans les maquettes validées (`question-modes`, `hud`, `compte-a-rebours`, `mode`, `fin`, `scores`, `accueil`, `a-propos-chargement`, `derniers-ecrans`, `revelation`), avec « Crédits » → « À propos » (D17) et le message de stockage de la section 5.

- [ ] **Step 1: Écrire le test (qui échoue)**

`web/src/i18n/i18n.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { detectLang, fill, messages } from './index';

type Tree = { [k: string]: string | Tree };
const leaves = (t: Tree, path = ''): [string, string][] =>
  Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [[`${path}${k}`, v] as [string, string]] : leaves(v, `${path}${k}.`)));
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('catalogues', () => {
  const fr = leaves(messages.fr as unknown as Tree);
  const en = leaves(messages.en as unknown as Tree);
  it('mêmes clés en français et en anglais', () => {
    expect(en.map(([k]) => k)).toEqual(fr.map(([k]) => k));
  });
  it('aucune chaîne vide', () => {
    for (const [k, v] of [...fr, ...en]) expect(v.trim(), k).not.toBe('');
  });
  it('mêmes emplacements {…} dans les deux langues', () => {
    const enMap = new Map(en);
    for (const [k, v] of fr) expect(holes(enMap.get(k)!), k).toEqual(holes(v));
  });
  it('textes des maquettes validées', () => {
    expect(messages.fr.prompts).toEqual({ flag: 'Quel est son drapeau ?', country: 'Quel est ce pays ?', capital: 'Quelle est sa capitale ?' });
    expect(messages.fr.modes).toEqual({ flag: 'Drapeau', country: 'Pays', capital: 'Capitale' });
    expect(messages.fr.home.about).toBe('À propos');
    expect(fill(messages.fr.end.correctOf, { correct: 19, total: 24 })).toBe('19 bonnes réponses sur 24');
  });
});

describe('fill', () => {
  it('remplit les emplacements, refuse un emplacement sans valeur', () => {
    expect(fill('Mode {mode} · {name}', { mode: 'Pays', name: 'Lina' })).toBe('Mode Pays · Lina');
    expect(() => fill('Ancien record : {score}', {})).toThrow(/score/);
  });
});

describe('detectLang', () => {
  it('le choix mémorisé d\'abord, s\'il est valide', () => {
    expect(detectLang('en', ['fr-FR'])).toBe('en');
    expect(detectLang('de', ['fr-FR'])).toBe('fr');
  });
  it('puis la langue du navigateur, variantes régionales et casse comprises', () => {
    expect(detectLang(null, ['fr-CA', 'en'])).toBe('fr');
    expect(detectLang(null, ['EN-us'])).toBe('en');
    expect(detectLang(null, ['de-DE', 'fr'])).toBe('fr');
  });
  it('ni français ni anglais, ou rien : anglais', () => {
    expect(detectLang(null, ['de-DE', 'es'])).toBe('en');
    expect(detectLang(null, [])).toBe('en');
  });
});
```

- [ ] **Step 2: Vérifier qu'il échoue**

Run: `cd web && npx vitest run --project unit src/i18n/i18n.test.ts`
Expected: FAIL (`Cannot find module './index'`).

- [ ] **Step 3: Implémenter**

`web/src/i18n/types.ts` :

```ts
import type { Mode } from '../game/types';

/** Tous les textes de l'interface ; `{nom}` = emplacement rempli par `fill`. Même type pour chaque langue (spec 2A §1). */
export interface Messages {
  modes: Record<Mode, string>;
  prompts: Record<Mode, string>;
  home: { yourName: string; defaultName: string; play: string; scores: string; about: string; language: string };
  mode: { back: string; player: string; choose: string; record: string; new: string };
  countdown: { go: string };
  hud: { quit: string; score: string; secondsLeft: string; paused: string };
  reveal: { label: string; correct: string; wrong: string };
  end: { timeUp: string; modeLine: string; newRecord: string; points: string; correctOf: string; previousRecord: string; replay: string; changeMode: string; scores: string; notSaved: string };
  scores: { title: string; you: string; replay: string; back: string; empty: string };
  about: { title: string; back: string; install: string; installText: string; iosTip: string; share: string; shareText: string; linkCopied: string; legal: string; vibrations: string };
  loading: { text: string };
  errors: { oops: string; loadTitle: string; loadText: string; retry: string; loadHint: string; ohNo: string; unsupportedTitle: string; unsupportedText: string };
  rotate: { title: string; text: string; paused: string };
}
```

`web/src/i18n/fr.ts` :

```ts
import type { Messages } from './types';

export const fr: Messages = {
  modes: { flag: 'Drapeau', country: 'Pays', capital: 'Capitale' },
  prompts: { flag: 'Quel est son drapeau ?', country: 'Quel est ce pays ?', capital: 'Quelle est sa capitale ?' },
  home: { yourName: 'Ton nom :', defaultName: 'Globetrotteur', play: 'Jouer', scores: 'Scores', about: 'À propos', language: 'Langue' },
  mode: { back: '‹ Retour', player: 'Joueur :', choose: 'Choisis ton mode', record: 'Record', new: 'Nouveau' },
  countdown: { go: 'GO !' },
  hud: { quit: 'Quitter', score: 'Score', secondsLeft: '{seconds} secondes restantes', paused: 'Partie en pause' },
  reveal: { label: '{country} · {capital}', correct: 'Bonne réponse : {answer}', wrong: 'Raté : c’était {answer}' },
  end: {
    timeUp: 'Temps écoulé !', modeLine: 'Mode {mode} · {name}', newRecord: 'Nouveau record !', points: 'points',
    correctOf: '{correct} bonnes réponses sur {total}', previousRecord: 'Ancien record : {score}', replay: 'Rejouer',
    changeMode: 'Changer de mode', scores: 'Scores', notSaved: 'Ton score ne peut pas être gardé sur cet appareil',
  },
  scores: { title: 'Top scores', you: '· toi', replay: 'Rejouer', back: '‹ Retour', empty: 'Pas encore de score dans ce mode' },
  about: {
    title: 'À propos', back: '‹ Retour', install: 'Installer l’appli',
    installText: 'Countrizz sur ton écran d’accueil, jouable même sans réseau.',
    iosTip: 'Sur iPhone et iPad : touche Partager ⬆︎ puis « Sur l’écran d’accueil ».',
    share: 'Partager le jeu', shareText: 'Envoie Countrizz à tes amis et à ta famille.', linkCopied: 'Lien copié !',
    legal: 'Mentions et licences', vibrations: 'Vibrations',
  },
  loading: { text: 'Préparation du globe…' },
  errors: {
    oops: 'Oups !', loadTitle: 'Le globe n’a pas pu se charger', loadText: 'Vérifie ta connexion, puis réessaie.', retry: 'Réessayer',
    loadHint: 'Si le problème continue, recharge la page.',
    ohNo: 'Oh non !', unsupportedTitle: 'Ton navigateur ne peut pas afficher le globe',
    unsupportedText: 'Le globe 3D est le cœur du jeu : il n’y a pas de version sans lui.',
  },
  rotate: { title: 'Tourne ton téléphone', text: 'Countrizz se joue en portrait.', paused: 'Partie en pause' },
};
```

`web/src/i18n/en.ts` :

```ts
import type { Messages } from './types';

export const en: Messages = {
  modes: { flag: 'Flag', country: 'Country', capital: 'Capital' },
  prompts: { flag: 'Which is its flag?', country: 'Which country is this?', capital: 'What is its capital?' },
  home: { yourName: 'Your name:', defaultName: 'Globetrotter', play: 'Play', scores: 'Scores', about: 'About', language: 'Language' },
  mode: { back: '‹ Back', player: 'Player:', choose: 'Pick your mode', record: 'Best', new: 'New' },
  countdown: { go: 'GO!' },
  hud: { quit: 'Quit', score: 'Score', secondsLeft: '{seconds} seconds left', paused: 'Game paused' },
  reveal: { label: '{country} · {capital}', correct: 'Right: {answer}', wrong: 'Missed: it was {answer}' },
  end: {
    timeUp: 'Time’s up!', modeLine: '{mode} mode · {name}', newRecord: 'New record!', points: 'points',
    correctOf: '{correct} right answers out of {total}', previousRecord: 'Previous best: {score}', replay: 'Play again',
    changeMode: 'Change mode', scores: 'Scores', notSaved: 'Your score can’t be saved on this device',
  },
  scores: { title: 'Top scores', you: '· you', replay: 'Play again', back: '‹ Back', empty: 'No score yet in this mode' },
  about: {
    title: 'About', back: '‹ Back', install: 'Install the app',
    installText: 'Countrizz on your home screen, playable even offline.',
    iosTip: 'On iPhone and iPad: tap Share ⬆︎ then “Add to Home Screen”.',
    share: 'Share the game', shareText: 'Send Countrizz to your friends and family.', linkCopied: 'Link copied!',
    legal: 'Notices and licences', vibrations: 'Vibrations',
  },
  loading: { text: 'Getting the globe ready…' },
  errors: {
    oops: 'Oops!', loadTitle: 'The globe couldn’t load', loadText: 'Check your connection, then try again.', retry: 'Try again',
    loadHint: 'If it keeps happening, reload the page.',
    ohNo: 'Oh no!', unsupportedTitle: 'Your browser can’t show the globe',
    unsupportedText: 'The 3D globe is the heart of the game: there’s no version without it.',
  },
  rotate: { title: 'Turn your phone', text: 'Countrizz is played in portrait.', paused: 'Game paused' },
};
```

`web/src/i18n/index.ts` :

```ts
import type { Lang } from '../game/types';
import { en } from './en';
import { fr } from './fr';
import type { Messages } from './types';

export type { Messages } from './types';
export const messages: Record<Lang, Messages> = { fr, en };

/** Langue du jeu : le choix mémorisé s'il est valide, puis la première langue du navigateur en fr ou en ; sinon l'anglais. */
export function detectLang(stored: string | null, browser: readonly string[]): Lang {
  if (stored === 'fr' || stored === 'en') return stored;
  for (const tag of browser) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'fr' || base === 'en') return base;
  }
  return 'en';
}

/** Remplit les `{nom}` d'un texte ; un emplacement sans valeur est une erreur de programmation. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => {
    if (!(k in vars)) throw new Error(`fill : valeur manquante pour {${k}} dans « ${template} »`);
    return String(vars[k]);
  });
}
```

- [ ] **Step 4: Vérifier qu'il passe**

Run: `cd web && npx vitest run --project unit src/i18n/i18n.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/i18n
git commit -m "i18n : catalogues français et anglais (textes des maquettes), langue du navigateur puis choix mémorisé"
```

---

### Task 8: Suite complète et passation

**Files:**
- Modify: `docs/HANDOFF.md`

- [ ] **Step 1: Suite unitaire et types**

Run: `cd web && npm run check`
Expected : tout vert. Noter le nombre de tests (il était de 216 avant ce plan).

- [ ] **Step 2: Données inchangées**

Run: `cd web && npm run test:data`
Expected : 68 passed. Ce plan ne touche ni aux données ni au rendu, et aucun écran ne change : pas d'image, pas de déploiement, pas d'e2e sur le site (la version en ligne est identique).

- [ ] **Step 3: Passation**

Ajouter en tête de la reprise de `docs/HANDOFF.md` une ligne datée : plan 2A-3 fait (modules `web/src/game/*`, `web/src/i18n/*`), nombre de tests, décisions 1 à 8 du plan à valider (textes EN surtout) ; prochain plan : 2A-4 (API du globe) puis 2A-5 (écrans, qui branchent ce moteur).

```bash
git add docs/HANDOFF.md
git commit -m "passation : plan 2A-3 terminé (moteur du jeu et catalogues FR/EN)"
```
