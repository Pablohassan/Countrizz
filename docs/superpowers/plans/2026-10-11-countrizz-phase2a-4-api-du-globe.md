# Countrizz 2A-4 — API du globe · plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** donner au `GlobeHandle` ce que les écrans du jeu (2A-5) et l'accueil complet (2A-6) attendent : zone libre et axe optique décalé, projection écran publique, objets de scène, signaux de chargement et d'erreur, ticket de vol annulable avec sa durée, mouvement réduit relu à chaud.

**Architecture:** la logique reste hors de React et testée sous Vitest : calculs purs dans `camera/` (zone libre, projection), registres et hôtes dans `globe/` (accessoires, progression), le `CameraDirector` et le `GlobeController` portent l'état qui survit à la perte du GPU. `GlobeView` ne fait que brancher : caméra décentrée fournie à R3F, signaux, interface d'erreur traduite et désactivable. Aucun écran visible ne change (références visuelles inchangées).

**Tech Stack:** three 0.186.1 (`three/webgpu`, TSL), React Three Fiber 9, React 19, TypeScript 5.9, Vitest, Playwright. Aucun nouveau paquet.

**Spec:** `docs/superpowers/specs/2026-10-05-countrizz-phase2a-design.md` §5 (et §3 D1, D2, D15, D16 ; §10 erreurs). Feuille de route : `docs/superpowers/plans/2026-10-06-countrizz-phase2a-1-mise-en-ligne.md` (tableau des plans : 2A-4 = « API du globe à ajouter (spec §5) »).

## Décisions prises en écrivant le plan (à valider par l'utilisateur)

1. **Axe optique décalé par une caméra décentrée** (`OffsetCamera` : l'élément 9 de la matrice de projection reçoit le décalage après chaque `updateProjectionMatrix`). `setViewOffset` est inutilisable : le TRAA de three le réécrit à chaque image (`TRAANode.setViewOffset` repart de `offsetX = offsetY = 0`, puis `clearViewOffset`, lu dans `node_modules/three/examples/jsm/tsl/display/TRAANode.js` l. 290-340). Le TRAA rappelle `updateProjectionMatrix` : notre décalage s'y ajoute, gigue comprise. Un tangage (comme l'accueil) inclinerait le pays ; la caméra décentrée le garde vu d'aplomb.
2. **La vue d'accueil garde son tangage** (`camera/home.ts`, réglé sur la maquette H3) : rien à refaire, références visuelles inchangées. §5.4 (« vue d'accueil propre ») est **déjà fait** au plan de l'intro (`flyToHome`, `startAtHome`).
3. **Zone libre** donnée en bandes occupées `{ top, bottom }` (px CSS : HUD en haut, grille et crédit en bas). Le pays se cadre sur la zone (champ vertical de la zone, même champ horizontal) et se centre au milieu de la zone. Au moins **20 %** de l'image reste libre : au-delà, les deux bandes sont réduites dans la même proportion. Une valeur non finie ou négative compte pour 0.
4. **Objets de scène** (§5.3) : 2A-4 livre le point de montage (`mount(accessory)`, recréé avec le renderer après une perte du GPU) et les données de chaque image (pose, direction du soleil, pour l'ombre portée). **L'avion A2, sa traînée et son ombre restent au plan 2A-6** (feuille de route : « Accueil complet (avion A2 en boucle, §4) »).
5. **Erreurs et chargement** (§5.5) : signaux `onLoading(progression 0..1)`, `onLost()`, `onError({ reason: 'unsupported' | 'load' | 'lost', detail })` et `retry()` dans le handle. L'interface d'erreur intégrée reste par défaut, **traduite** (prop `texts`, catalogue `errors` de 2A-3) ; `errorUi={false}` la coupe pour les écrans D16 du 2A-5. `reason: 'lost'` = la recréation du renderer après une perte du GPU a échoué.
6. **Progression du chargement** = moyenne des fractions des 5 fichiers du globe (4 textures, frontières) ; un fichier sans taille connue compte 0 jusqu'à sa fin. Une nouvelle tentative (`withRetry`) repart de 0.
7. **Ticket de vol** : `flyTo`, `overview`, `home` rendent `{ durationMs, arrived: Promise<boolean> }` ; `arrived` vaut `true` à l'arrivée, `false` si un autre vol l'a remplacé ou si `clear()` a été appelé pendant le vol. Pour la machine de 2A-3 : envoyer `ARRIVED { flight }` seulement sur `true`.
8. **Mouvement réduit relu à chaud** : le vol en cours finit tel qu'il a été planifié (aucun saut) ; les vols suivants coupent ; la rotation demandée s'arrête et reprend quand le réglage est retiré.
9. **Déploiement** : les e2e visent countrizz.fr ; les nouveaux contrôles passent en local (`npm run e2e:local`) pendant le plan, puis l'image `countrizz-web:1.6` est construite et déployée **sur GO de l'utilisateur** (Task 8), et la suite complète repasse sur le site.

## Global Constraints

- « **Aucun nouveau paquet** pour le jeu » (spec §1).
- « GitHub : `check` seul. **Le Mac fait foi** (`check && test:data && e2e && budget`) et barre l'image. Test d'abord. » (spec §11)
- Références visuelles `-darwin` seulement ; elles **ne doivent pas changer** dans ce plan (axe à 0 = projection identique).
- Une passe de scène par trame de three : `staleFrames` reste à 0 (`e2e/intro.spec.ts`, `expectNoStaleFrame`).
- Hooks du poste : pas de `grep`/`sed`/`awk` filtrants (lire en entier ou `node -e`) ; e2e locaux par `npm run e2e:local` (serveur de dev sur 5174).
- Écritures hors dépôt (Docker Hub, cluster) : **GO de l'utilisateur sur la commande exacte**.
- Code et commentaires en français, au ton du code voisin ; commits terminés par les lignes d'attribution de la session.

## Review Focus

1. Bandes plus hautes que l'image (téléphone en paysage, grille haute) : la zone garde 20 % de l'image, le pays reste cadré, rien ne devient négatif ni NaN → `safeArea.test.ts` (Task 3).
2. Un abonné de `onFrame` qui lève : la boucle de rendu continue et les autres abonnés sont appelés → `controller.test.ts` (Task 5).
3. Un accessoire dont `create()` lève : le globe se dessine, les autres accessoires sont montés → `accessories.test.ts` (Task 7).
4. `setSafeArea` pendant un vol : aucun saut ; l'axe et l'altitude rejoignent la zone par un vol court à l'arrivée → `director.test.ts` (Task 4).
5. Perte du GPU pendant un vol : le ticket se résout quand même à `true` à l'arrivée (le contrôleur survit au renderer) → `controller.test.ts` (Task 1).

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| `web/src/camera/director.ts` (modifié) | ticket de vol, mouvement réduit à chaud, axe optique animé (`FramePose.axisY`) |
| `web/src/camera/safeArea.ts` (nouveau) | zone libre : viewport de cadrage et hauteur de l'axe |
| `web/src/camera/home.ts` (modifié) | `projectOnScreen` tient compte de `axisY` |
| `web/src/globe/offsetCamera.ts` (nouveau) | caméra perspective décentrée verticalement |
| `web/src/globe/project.ts` (nouveau) | point écran public avec visibilité |
| `web/src/globe/loading.ts` (nouveau) | progression combinée des fichiers du globe |
| `web/src/globe/accessories.ts` (nouveau) | types des accessoires, hôte qui les monte dans une scène |
| `web/src/globe/controller.ts` (modifié) | zone libre, pose de la dernière image, abonnés, accessoires, ticket |
| `web/src/globe/globe.ts` (modifié) | `applyPose` pose `axisY` sur une `OffsetCamera` |
| `web/src/globe/textures.ts` (modifié) | progression par fichier |
| `web/src/globe/credits.tsx` (modifié) | position du crédit paramétrable |
| `web/src/globe/GlobeView.tsx` (modifié) | handle, signaux, caméra fournie, interface d'erreur traduite |
| `web/src/app/App.tsx`, `web/src/demo/main.tsx`, `web/src/calibrate/main.tsx`, `web/src/probe/main.ts` (modifiés) | appelants ; crochets e2e de la démo et de la sonde |
| `web/e2e/globe-api.spec.ts` (nouveau) | contrôles de bout en bout de l'API |

---

### Task 1 : ticket de vol (annulation et durée)

**Files:**
- Modify: `web/src/camera/director.ts`
- Modify: `web/src/globe/controller.ts:78-97`
- Modify: `web/src/globe/GlobeView.tsx:22-32,105-114`
- Modify: `web/src/demo/main.tsx:25`, `web/src/calibrate/main.tsx:34`
- Test: `web/src/camera/director.test.ts`, `web/src/globe/controller.test.ts`, `web/src/globe/clouds.test.ts`

**Interfaces:**
- Produces : `export interface FlightTicket { durationMs: number; arrived: Promise<boolean> }` (dans `camera/director.ts`) ; `CameraDirector.flyTo / flyToOverview / flyToHome(): FlightTicket` ; `GlobeController.flyTo(rec): FlightTicket` ; `GlobeHandle.flyTo / overview / home(): FlightTicket`.

- [ ] **Step 1 : tests du directeur.** Dans `director.test.ts`, remplacer les tests « flyTo se résout à l'arrivée, pas avant » et « un second flyTo repart de la pose courante… » par :

```ts
  it('flyTo rend sa durée et se résout à true à l’arrivée, pas avant', async () => {
    const d = new CameraDirector(opts);
    d.update(0);
    const t = d.flyTo(japan);
    expect(t.durationMs).toBeGreaterThanOrEqual(1500);
    expect(t.durationMs).toBeLessThanOrEqual(3500);
    let done: boolean | null = null;
    void t.arrived.then((ok) => { done = ok; });
    d.update(t.durationMs - 1);
    await Promise.resolve();
    expect(done).toBeNull();
    d.update(t.durationMs);
    await t.arrived;
    expect(done).toBe(true);
    expect(angleBetween(d.update(5000).dir, toVec(japan.cap.center))).toBeLessThan(1e-9);
  });

  it('un vol remplacé se résout à false tout de suite ; le second repart de la pose courante, sans saut', async () => {
    const d = new CameraDirector(opts);
    d.update(0);
    const first = d.flyTo(japan);
    const before = d.update(800);
    const second = d.flyTo(france);
    const after = d.update(800);
    expect(angleBetween(before.dir, after.dir)).toBeLessThan(1e-9);
    expect(await first.arrived).toBe(false);
    d.update(10_000);
    expect(await second.arrived).toBe(true);
  });
```

Adapter les autres usages du même fichier : `await flight;` → `await flight.arrived;` (tests « mouvement réduit : coupe… », « un vol vers un pays depuis l'accueil… ») et `await home;` → `await home.arrived;`. Dans « mouvement réduit : coupe… », ajouter `expect(flight.durationMs).toBe(0);`.

- [ ] **Step 2 : tests du contrôleur.** Dans `controller.test.ts`, ajouter un bloc :

```ts
describe('ticket de vol (GlobeController)', () => {
  it('clear() pendant le vol : l’arrivée ne compte pas', async () => {
    const { c } = setup(async () => tex('x'));
    c.director.update(0);
    const t = c.flyTo(by('FRA'));
    c.clear();
    c.director.update(10_000);
    expect(await t.arrived).toBe(false);
  });

  it('perte du GPU pendant le vol (globe détaché puis rattaché) : l’arrivée compte', async () => {
    const { c } = setup(async () => tex('x'));
    c.director.update(0);
    const t = c.flyTo(by('FRA'));
    c.director.update(500);
    c.attach(null);
    c.attach({ setPatch() {}, setBeacon() {}, setImagePatch() {} } as unknown as Globe);
    c.director.update(10_000);
    expect(await t.arrived).toBe(true);
  });
});
```

Dans `clouds.test.ts` : `await flight;` → `await flight.arrived;`.

- [ ] **Step 3 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit src/camera/director.test.ts src/globe/controller.test.ts src/globe/clouds.test.ts`. Expected : FAIL (`t.durationMs` indéfini, `t.arrived` indéfini).

- [ ] **Step 4 : implémenter dans le directeur.** Dans `director.ts` :

```ts
/** Vol lancé : sa durée (le 3-2-1 s'y règle) et son issue — `true` à l'arrivée, `false` s'il a été remplacé avant. */
export interface FlightTicket { durationMs: number; arrived: Promise<boolean> }
```

Champ `flight` : remplacer `resolve: () => void` par `settle: (arrived: boolean) => void`. `flyTo`, `flyToOverview`, `flyToHome` rendent `FlightTicket` (doc : « résolu à true à l'arrivée, à false si un autre vol le remplace »). `flyToPose` :

```ts
  private flyToPose(to: Pose, toPitch = 0): FlightTicket {
    this.flight?.settle(false);
    this.spinDegPerSec = 0;
    this.reframePending = false;
    const plan = planFlight(this.pose, to, {
      ...this.opts.flight,
      alphaRad: limitingHalfAngle(this.viewport),
      reducedMotion: this.opts.reducedMotion,
    });
    let settle!: (arrived: boolean) => void;
    const arrived = new Promise<boolean>((r) => { settle = r; });
    this.flight = { plan, startMs: this.now, settle, pitch: [this.pitch, toPitch] };
    return { durationMs: plan.durationMs, arrived };
  }
```

Dans `reframe()` : `settle: () => {}`. Dans `update()` : `const { plan, startMs, settle, pitch } = this.flight;` … `settle(true);`.

- [ ] **Step 5 : implémenter dans le contrôleur.** `controller.ts`, importer `type FlightTicket` depuis `../camera/director` et remplacer la fin de `flyTo` :

```ts
  /**
   * Vole vers le pays. `arrived` : true à l'arrivée (patch chargé, en retard ou en échec : la manche n'attend pas), false
   * si un autre vol l'a remplacé ou si `clear()` est passé entre-temps.
   */
  flyTo(rec: CountryRecord): FlightTicket {
    // … corps inchangé jusqu'à this.apply() …
    const t = this.director.flyTo(rec);
    return {
      durationMs: t.durationMs,
      arrived: t.arrived.then((ok) => {
        if (!ok || this.target !== rec) return false;
        this.arrived = true;
        this.fadeClouds(0);
        this.apply();
        return true;
      }),
    };
  }
```

- [ ] **Step 6 : handle et appelants.** `GlobeView.tsx` : importer `type FlightTicket` ; dans `GlobeHandle`, `flyTo(rec: CountryRecord): FlightTicket;`, `overview(): FlightTicket;`, `home(): FlightTicket;` (doc de `flyTo` : « `arrived` à true à l'arrivée, false si remplacé »). `demo/main.tsx` l. 25 : `await globe.current!.flyTo(rec).arrived;`. `calibrate/main.tsx` l. 34 : `void globe.current!.flyTo(rec).arrived.then(() => globe.current!.showQuestion());`.

- [ ] **Step 7 : vérifier.** Run : `cd web && npm run check`. Expected : tsc sans erreur, tous les tests unitaires verts (dont les 3 nouveaux).

- [ ] **Step 8 : commit.**

```bash
git add web/src/camera/director.ts web/src/camera/director.test.ts web/src/globe/controller.ts web/src/globe/controller.test.ts web/src/globe/clouds.test.ts web/src/globe/GlobeView.tsx web/src/demo/main.tsx web/src/calibrate/main.tsx
git commit -m "globe : ticket de vol (durée, arrivée ou remplacement) — spec 2A §5.6"
```

---

### Task 2 : mouvement réduit relu à chaud

**Files:**
- Modify: `web/src/camera/director.ts`
- Modify: `web/src/globe/controller.ts:44-48`
- Modify: `web/src/globe/GlobeView.tsx` (création du contrôleur, nouvel effet, crochet `view`)
- Modify: `web/src/demo/main.tsx` (paramètre `spin`, objet `__demo` créé au chargement)
- Test: `web/src/camera/director.test.ts`, `web/e2e/globe-api.spec.ts` (créé)

**Interfaces:**
- Produces : `CameraDirector.setReducedMotion(on: boolean): void` ; `GlobeController.setReducedMotion(on: boolean): void`, getter `reducedMotion: boolean`, getter `pose: FramePose | null` (posé à la Task 5, ici `null` puis la pose de `update` — voir Step 5) ; `GlobeDebug.view(): LngLat | null`.

- [ ] **Step 1 : tests unitaires.** Dans `director.test.ts` :

```ts
  it('mouvement réduit activé à chaud : la rotation s’arrête, puis reprend quand on le retire', () => {
    const d = new CameraDirector(opts);
    d.update(0);
    d.setIdleSpin(6);
    for (let ms = 20; ms <= 500; ms += 20) d.update(ms);
    d.setReducedMotion(true);
    const a = d.update(520).dir;
    for (let ms = 540; ms <= 1500; ms += 20) d.update(ms);
    expect(angleBetween(a, d.update(1500).dir)).toBe(0);
    d.setReducedMotion(false);
    for (let ms = 1520; ms <= 2500; ms += 20) d.update(ms);
    expect(angleBetween(a, d.update(2500).dir)).toBeGreaterThan(0.05);
  });

  it('mouvement réduit activé pendant un vol : le vol finit tel quel, le suivant coupe', async () => {
    const d = new CameraDirector(opts);
    d.update(0);
    const first = d.flyTo(japan);
    const a = d.update(800);
    d.setReducedMotion(true);
    const b = d.update(816);
    expect(angleBetween(a.dir, b.dir)).toBeLessThan(2 * Math.PI / 180);   // pas de saut vers l'arrivée
    d.update(10_000);
    expect(await first.arrived).toBe(true);
    expect(d.flyTo(france).durationMs).toBe(0);
  });
```

- [ ] **Step 2 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit src/camera/director.test.ts`. Expected : FAIL (`d.setReducedMotion is not a function`).

- [ ] **Step 3 : implémenter dans le directeur.** `director.ts` :

```ts
  private reducedMotion: boolean;
  /** Rotation demandée ; effective seulement hors mouvement réduit. */
  private spinDegPerSec = 0;
```

Constructeur : `this.reducedMotion = opts.reducedMotion;`. Remplacer `setIdleSpin` et ajouter :

```ts
  /** Rotation lente au repos (degrés de longitude par seconde, vers l'ouest) ; 0 l'arrête ; suspendue en mouvement réduit (spec 2A §5.7). */
  setIdleSpin(degPerSec: number): void { this.spinDegPerSec = degPerSec; }

  /** Spec 2A §5.7, relu à chaud : le vol en cours finit tel quel ; les suivants coupent ; la rotation demandée attend. */
  setReducedMotion(on: boolean): void { this.reducedMotion = on; }
```

Remplacer `this.opts.reducedMotion` par `this.reducedMotion` dans `flyToPose` et `reframe`. Dans `update`, la branche de rotation devient `} else if (this.spinDegPerSec !== 0 && !this.reducedMotion) {`.

- [ ] **Step 4 : contrôleur.** `controller.ts` : le paramètre `readonly reducedMotion = false` du constructeur devient `reducedMotion = false`, gardé dans `private reduced: boolean` (`this.reduced = reducedMotion;` avant la création du directeur, qui reçoit `reducedMotion`). Ajouter :

```ts
  get reducedMotion(): boolean { return this.reduced; }

  /** Réglage du système changé pendant la visite (spec 2A §5.7) : caméra et dérive des nuages le suivent. */
  setReducedMotion(on: boolean): void {
    this.reduced = on;
    this.director.setReducedMotion(on);
  }
```

- [ ] **Step 5 : GlobeView.** Après la création du contrôleur :

```tsx
  // Mouvement réduit relu à chaud (spec 2A §5.7) : le réglage du système peut changer pendant la visite.
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => controller.setReducedMotion(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [controller]);
```

Dans `GlobeDebug`, ajouter `/** Point visé (sous l'axe de la caméra) à la dernière image. */ view(): LngLat | null;`. Dans la scène, garder la dernière pose dans une ref (`const lastPose = useRef<FramePose | null>(null);`, posée dans `useFrame` juste après `controller.director.update(now)`) et ajouter au crochet : `view: () => (lastPose.current ? toLngLat(lastPose.current.dir) : null),` (`toLngLat` depuis `../geo/vec`, `type FramePose` depuis `../camera/director`). La Task 5 remplace cette ref par `controller.pose`.

- [ ] **Step 6 : démo.** `demo/main.tsx` : créer `window.__demo` au chargement du module (et non plus à `ready`) et l'étendre au fil des tâches. Ici :

```tsx
declare global { interface Window { __demo?: { arrived: string[]; done: boolean; ready: number } } }
window.__demo = { arrived: [], done: false, ready: 0 };
const q = new URLSearchParams(location.search);
```

Dans `Demo`, le `onReady` devient `onReady={() => { window.__demo!.ready++; setReady(true); }}` ; l'effet de la liste ne recrée plus `window.__demo` (supprimer la ligne `window.__demo = { arrived: [], done: false };`). Ajouter :

```tsx
  // `?spin=6` : rotation lente au repos (contrôle du mouvement réduit à chaud)
  useEffect(() => { if (ready && q.has('spin')) globe.current!.setIdleSpin(Number(q.get('spin'))); }, [ready]);
```

- [ ] **Step 7 : e2e (échec attendu d'abord).** Créer `web/e2e/globe-api.spec.ts` :

```ts
import { expect, test, type Page } from '@playwright/test';

/** API du globe (plan 2A-4) sur la page de démo. */
test.use({ viewport: { width: 390, height: 844 } });

const view = (page: Page) => page.evaluate(() => window.__globe!.view());
const lngGap = (a: [number, number], b: [number, number]) => Math.abs(((b[0] - a[0] + 540) % 360) - 180);

test('mouvement réduit relu à chaud : la rotation s’arrête puis reprend', async ({ page }) => {
  await page.goto('/demo.html?spin=6');
  await page.waitForFunction(() => (window.__demo?.ready ?? 0) > 0 && (window.__globe?.frames ?? 0) > 5, null, { timeout: 120_000 });
  const a = (await view(page))!;
  await page.waitForTimeout(1500);
  expect(lngGap(a, (await view(page))!)).toBeGreaterThan(2);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(300);
  const b = (await view(page))!;
  await page.waitForTimeout(1500);
  expect(lngGap(b, (await view(page))!)).toBeLessThan(0.01);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForTimeout(1500);
  expect(lngGap(b, (await view(page))!)).toBeGreaterThan(2);
});
```

Run (avant les Steps 3-6, pour voir l'échec) : `cd web && npx playwright test e2e/globe-api.spec.ts` avec `E2E_BASE_URL=http://localhost:5174`. Expected : FAIL (`__demo.ready` absent ou `view` absent).

- [ ] **Step 8 : vérifier.** Run : `cd web && npm run check && E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/globe-api.spec.ts e2e/reduced-motion.spec.ts e2e/flight.spec.ts`. Expected : tout vert.

- [ ] **Step 9 : commit.**

```bash
git add web/src/camera/director.ts web/src/camera/director.test.ts web/src/globe/controller.ts web/src/globe/GlobeView.tsx web/src/demo/main.tsx web/e2e/globe-api.spec.ts
git commit -m "globe : mouvement réduit relu à chaud (vol en cours fini tel quel, rotation suspendue) — spec 2A §5.7"
```

---

### Task 3 : zone libre, caméra décentrée et projection (calculs purs)

**Files:**
- Create: `web/src/camera/safeArea.ts`, `web/src/camera/safeArea.test.ts`
- Create: `web/src/globe/offsetCamera.ts`, `web/src/globe/offsetCamera.test.ts`
- Modify: `web/src/camera/home.ts` (`projectOnScreen`)

**Interfaces:**
- Produces : `export interface SafeArea { top: number; bottom: number }` ; `export const MIN_FREE = 0.2` ; `safeViewport(v: Viewport, a: SafeArea | null): { zone: Viewport; axisY: number }` ; `class OffsetCamera extends THREE.PerspectiveCamera { axisY: number }` ; `projectOnScreen(p: Pose & { pitch?: number; axisY?: number }, v, point)`.

- [ ] **Step 1 : tests de la zone.** `web/src/camera/safeArea.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { limitingHalfAngle } from './framing';
import { MIN_FREE, safeViewport } from './safeArea';

const phone = { width: 390, height: 844, fovYDeg: 50 };
const deg = (r: number) => (r * 180) / Math.PI;

describe('zone libre entre le HUD et la grille (D1)', () => {
  it('sans bandes : tout l’écran, axe au centre', () => {
    expect(safeViewport(phone, null)).toEqual({ zone: phone, axisY: 0 });
    expect(safeViewport(phone, { top: 0, bottom: 0 }).axisY).toBe(0);
  });

  it('HUD 80 px, grille 300 px : zone de 464 px, axe au milieu de la zone', () => {
    const { zone, axisY } = safeViewport(phone, { top: 80, bottom: 300 });
    expect(zone.width).toBe(390);
    expect(zone.height).toBe(464);
    // milieu de la zone : y = 80 + 232 = 312 px ; en NDC : 1 − 2 · 312 / 844
    expect(axisY).toBeCloseTo(1 - (2 * 312) / 844, 12);
    // même champ horizontal, champ vertical réduit dans le rapport des hauteurs
    const tan = (fov: number) => Math.tan((fov * Math.PI) / 360);
    expect(tan(zone.fovYDeg)).toBeCloseTo(tan(50) * (464 / 844), 12);
    expect(deg(Math.atan(tan(zone.fovYDeg) * (zone.width / zone.height)))).toBeCloseTo(deg(Math.atan(tan(50) * (390 / 844))), 9);
    expect(limitingHalfAngle(zone)).toBeLessThanOrEqual(limitingHalfAngle(phone));
  });

  it('bandes plus hautes que l’image : réduites ensemble, 20 % de l’image reste libre', () => {
    const { zone, axisY } = safeViewport(phone, { top: 400, bottom: 600 });
    expect(zone.height).toBeCloseTo(844 * MIN_FREE, 9);
    // proportion gardée : top 400/1000, bottom 600/1000 de 675,2 px
    expect(axisY).toBeCloseTo((0.6 * 675.2 - 0.4 * 675.2) / 844, 9);
    expect(Number.isFinite(zone.fovYDeg) && zone.fovYDeg > 0).toBe(true);
  });

  it('valeurs non finies ou négatives : comptées 0', () => {
    expect(safeViewport(phone, { top: Number.NaN, bottom: -50 })).toEqual({ zone: phone, axisY: 0 });
    expect(safeViewport(phone, { top: Infinity, bottom: 0 })).toEqual({ zone: phone, axisY: 0 });
  });
});
```

- [ ] **Step 2 : tests de la caméra.** `web/src/globe/offsetCamera.test.ts` :

```ts
import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { projectOnScreen } from '../camera/home';
import { northUp, toVec } from '../geo/vec';
import { OffsetCamera } from './offsetCamera';

const v = { width: 390, height: 844, fovYDeg: 50 };
function place(c: THREE.PerspectiveCamera, dir: [number, number, number], altitude: number, up: [number, number, number], pitch: number) {
  const d = 1 + altitude;
  c.position.set(dir[0] * d, dir[1] * d, dir[2] * d);
  c.up.set(...up);
  c.lookAt(0, 0, 0);
  if (pitch) c.rotateX(pitch);
  c.updateMatrixWorld(true);
  c.updateProjectionMatrix();
}

describe('caméra décentrée (axe optique hors du centre)', () => {
  it('à 0, identique à une PerspectiveCamera (aucune image ne change)', () => {
    const a = new OffsetCamera(50, v.width / v.height, 0.01, 100), b = new THREE.PerspectiveCamera(50, v.width / v.height, 0.01, 100);
    expect(a.projectionMatrix.elements).toEqual(b.projectionMatrix.elements);
  });

  it('le point visé tombe à la hauteur demandée, même sous la gigue du TRAA (setViewOffset)', () => {
    const c = new OffsetCamera(50, v.width / v.height, 0.01, 100);
    c.axisY = 0.3;
    place(c, [0, 0, 1], 1, [0, 1, 0], 0);
    expect(new THREE.Vector3(0, 0, 0).project(c).y).toBeCloseTo(0.3, 9);
    // ce que fait TRAANode.setViewOffset : vue pleine, décalée d'une fraction de pixel
    c.setViewOffset(v.width, v.height, 0.25, -0.25, v.width, v.height);
    expect(new THREE.Vector3(0, 0, 0).project(c).y).toBeCloseTo(0.3, 2);
    c.clearViewOffset();
    expect(new THREE.Vector3(0, 0, 0).project(c).y).toBeCloseTo(0.3, 9);
  });

  it('l’inverse suit : unproject(project(p)) = p', () => {
    const c = new OffsetCamera(50, v.width / v.height, 0.01, 100);
    c.axisY = -0.4;
    place(c, [0, 0, 1], 1, [0, 1, 0], 0);
    const p = new THREE.Vector3(0.2, -0.1, 0.5);
    expect(p.clone().project(c).unproject(c).distanceTo(p)).toBeLessThan(1e-6);
  });

  it('projectOnScreen (calcul pur) rejoint three, tangage et axe compris', () => {
    for (const [lngLat, alt, pitch, axisY] of [[[2.35, 48.85], 0.3, 0, 0.26], [[10, 19.5], 1.6, 0.416, 0], [[139.7, 35.7], 0.8, 0.2, -0.3]] as const) {
      const dir = toVec(lngLat as [number, number]), up = northUp(dir);
      const c = new OffsetCamera(v.fovYDeg, v.width / v.height, 0.001, 100);
      c.axisY = axisY;
      place(c, dir, alt, up, pitch);
      for (const q of [[2.35, 48.85], [12, 41.9], [139.7, 35.7], [5, 20]] as [number, number][]) {
        const pt = toVec(q);
        const pure = projectOnScreen({ dir, altitude: alt, up, pitch, axisY }, v, pt);
        const n = new THREE.Vector3(...pt).project(c);
        if (!pure) continue;
        expect(pure[0]).toBeCloseTo(((n.x + 1) / 2) * v.width, 6);
        expect(pure[1]).toBeCloseTo(((1 - n.y) / 2) * v.height, 6);
      }
    }
  });
});
```

- [ ] **Step 3 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit src/camera/safeArea.test.ts src/globe/offsetCamera.test.ts`. Expected : FAIL (modules introuvables).

- [ ] **Step 4 : implémenter la zone.** `web/src/camera/safeArea.ts` :

```ts
import type { Viewport } from './framing';

/** Bandes occupées par l'interface, en px CSS : HUD en haut, grille de réponses et crédit en bas (D1, D2). */
export interface SafeArea { top: number; bottom: number }

/** Part de l'image qui reste libre au minimum : au-delà, les deux bandes sont réduites dans la même proportion. */
export const MIN_FREE = 0.2;

const band = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);

/**
 * Zone libre entre les bandes : le pays s'y cadre (`zone` : même largeur et même champ horizontal, champ vertical réduit
 * dans le rapport des hauteurs) et s'y centre (`axisY` : hauteur de l'axe optique à l'écran, en NDC, > 0 au-dessus du
 * centre). La caméra décentrée (globe/offsetCamera.ts) place l'axe à cette hauteur.
 */
export function safeViewport(v: Viewport, a: SafeArea | null): { zone: Viewport; axisY: number } {
  let top = a ? band(a.top) : 0, bottom = a ? band(a.bottom) : 0;
  if (top === 0 && bottom === 0) return { zone: v, axisY: 0 };
  const max = v.height * (1 - MIN_FREE);
  if (top + bottom > max) {
    const k = max / (top + bottom);
    top *= k;
    bottom *= k;
  }
  const height = v.height - top - bottom;
  const tanHalf = Math.tan((v.fovYDeg * Math.PI) / 360) * (height / v.height);
  return { zone: { width: v.width, height, fovYDeg: (2 * Math.atan(tanHalf) * 180) / Math.PI }, axisY: (bottom - top) / v.height };
}
```

- [ ] **Step 5 : implémenter la caméra.** `web/src/globe/offsetCamera.ts` :

```ts
import * as THREE from 'three/webgpu';

/**
 * Caméra perspective dont l'axe optique tombe à `axisY` (NDC, > 0 au-dessus du centre) au lieu du centre de l'image :
 * le pays se centre dans la zone libre (spec 2A §5.1, D1) en restant vu d'aplomb. Pas de `setViewOffset` : le TRAA de three
 * le réécrit à chaque image (TRAANode.setViewOffset part de offsetX = offsetY = 0). Il rappelle `updateProjectionMatrix`,
 * où le décalage s'ajoute à sa gigue : élément 9 de la projection (b = (haut + bas) / (haut − bas), le point de l'axe sort à −b).
 */
export class OffsetCamera extends THREE.PerspectiveCamera {
  axisY = 0;

  override updateProjectionMatrix(): void {
    super.updateProjectionMatrix();
    // appelée aussi par le constructeur de PerspectiveCamera, avant l'initialisation de `axisY` (undefined)
    if (!this.axisY) return;
    this.projectionMatrix.elements[9] -= this.axisY;
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}
```

- [ ] **Step 6 : projection pure.** `camera/home.ts`, `projectOnScreen` : signature `p: Pose & { pitch?: number; axisY?: number }` ; doc complétée (« `axisY` : hauteur de l'axe optique, NDC, comme `OffsetCamera` ») ; dernière ligne :

```ts
  const axisY = p.axisY ?? 0;
  return [v.width / 2 + (dot(rel, right) / z / tanH) * (v.width / 2), v.height / 2 - (dot(rel, up) / z / tanV + axisY) * (v.height / 2)];
```

- [ ] **Step 7 : vérifier.** Run : `cd web && npm run check`. Expected : vert, `home.test.ts` inchangé et vert.

- [ ] **Step 8 : commit.**

```bash
git add web/src/camera/safeArea.ts web/src/camera/safeArea.test.ts web/src/globe/offsetCamera.ts web/src/globe/offsetCamera.test.ts web/src/camera/home.ts
git commit -m "globe : zone libre et caméra décentrée (calculs purs, compatibles avec le TRAA) — spec 2A §5.1"
```

---

### Task 4 : axe optique décalé, de la zone libre à l'image

**Files:**
- Modify: `web/src/camera/director.ts` (`FramePose.axisY`, `setViewport(v, axisY)`, interpolation)
- Modify: `web/src/globe/controller.ts` (`setSafeArea`, viewport complet et zone)
- Modify: `web/src/globe/globe.ts` (`applyPose`)
- Modify: `web/src/globe/GlobeView.tsx` (caméra fournie, `setSafeArea` du handle)
- Modify: `web/src/probe/main.ts` (`OffsetCamera`, paramètre `safe`, poses à `axisY: 0`)
- Modify: `web/src/demo/main.tsx` (paramètre `safe`)
- Test: `web/src/camera/director.test.ts`, `web/e2e/globe-api.spec.ts`

**Interfaces:**
- Consumes : `safeViewport`, `SafeArea`, `OffsetCamera` (Task 3) ; `FlightTicket` (Task 1).
- Produces : `FramePose { …; axisY: number }` ; `CameraDirector.setViewport(v: Viewport, axisY = 0)` ; `GlobeController.setSafeArea(a: SafeArea | null)` ; `GlobeHandle.setSafeArea(a: SafeArea | null): void`.

- [ ] **Step 1 : tests du directeur.**

```ts
  it('zone libre au repos : altitude et axe rejoignent la zone par un vol court, sans saut', () => {
    const phone = { width: 390, height: 844, fovYDeg: 50 };
    const d = new CameraDirector({ ...opts, viewport: phone });
    d.update(0);
    void d.flyTo(france);
    d.update(10_000);
    const before = d.update(10_000);
    expect(before.axisY).toBe(0);
    const { zone, axisY } = safeViewport(phone, { top: 80, bottom: 300 });
    d.setViewport(zone, axisY);
    const start = d.update(10_000);
    expect(start.axisY).toBe(0);
    expect(start.altitude).toBe(before.altitude);
    const mid = d.update(10_200).axisY;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(axisY);
    const end = d.update(11_000);
    expect(end.axisY).toBeCloseTo(axisY, 12);
    expect(end.altitude).toBeCloseTo(frameAltitude(france.cap.radiusDeg, zone, opts.framing), 9);
  });

  it('zone libre posée pendant un vol : appliquée à l’arrivée, par le recadrage', async () => {
    const phone = { width: 390, height: 844, fovYDeg: 50 };
    const d = new CameraDirector({ ...opts, viewport: phone });
    d.update(0);
    const t = d.flyTo(japan);
    const a = d.update(800);
    const { zone, axisY } = safeViewport(phone, { top: 80, bottom: 300 });
    d.setViewport(zone, axisY);
    const b = d.update(800);
    expect(b.axisY).toBe(a.axisY);
    expect(angleBetween(a.dir, b.dir)).toBeLessThan(1e-12);
    d.update(10_000);
    expect(await t.arrived).toBe(true);
    expect(d.update(11_000).axisY).toBeCloseTo(axisY, 12);
  });

  it('un vol interpole l’axe vers la zone courante', () => {
    const phone = { width: 390, height: 844, fovYDeg: 50 };
    const d = new CameraDirector({ ...opts, viewport: phone });
    const { zone, axisY } = safeViewport(phone, { top: 80, bottom: 300 });
    d.update(0);
    d.setViewport(zone, axisY);
    d.update(2000);
    const t = d.flyTo(japan);
    expect(d.update(2000).axisY).toBeCloseTo(axisY, 12);
    d.update(2000 + t.durationMs);
    expect(d.update(2000 + t.durationMs).axisY).toBeCloseTo(axisY, 12);
  });
```

(imports : `frameAltitude` depuis `./framing`, `safeViewport` depuis `./safeArea`.)

- [ ] **Step 2 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit src/camera/director.test.ts`. Expected : FAIL (`axisY` indéfini).

- [ ] **Step 3 : directeur.** `director.ts` :
  - `FramePose` : `export interface FramePose extends Pose { cut: boolean; pitch: number; axisY: number }` (doc : « `axisY` : hauteur de l'axe optique à l'écran, NDC — zone libre, camera/safeArea.ts »).
  - champs `private axisY = 0;` (courant) et `private axisTarget = 0;` ; `flight` reçoit `axis: [number, number]`.
  - `setViewport(v: Viewport, axisY = 0)` : retour anticipé si viewport identique **et** `axisY === this.axisTarget` ; sinon `this.viewport = v; this.axisTarget = axisY;` puis comme avant (`reframePending` en vol, `reframe()` au repos).
  - `flyToPose` : `axis: [this.axisY, this.axisTarget]`.
  - `reframe()` : à l'accueil, `this.axisY = this.axisTarget;` avec le tangage ; ailleurs, ne rien faire seulement si l'altitude **et** l'axe sont déjà bons (`Math.abs(altitude - this.pose.altitude) < 1e-9 && this.axisY === this.axisTarget`) ; le vol court reçoit `axis: [this.axisY, this.axisTarget]`.
  - `update` : avec le tangage, `this.axisY = axis[0] + (axis[1] - axis[0]) * e;` où `e = s * s * (3 - 2 * s)` (même lissage) ; retour `{ ...this.pose, cut, pitch: this.pitch, axisY: this.axisY }`.

- [ ] **Step 4 : contrôleur.** `controller.ts` : `private fullViewport: Viewport;` (initialisé comme `viewport`), `private safeArea: SafeArea | null = null;`. `setViewport(v)` garde `v` dans `fullViewport` puis appelle `this.layout()` ; nouveau :

```ts
  /** Bandes occupées par l'interface (D1) : le pays se cadre et se centre dans la zone libre ; `null` : tout l'écran. */
  setSafeArea(a: SafeArea | null): void {
    this.safeArea = a;
    this.layout();
  }

  /** Viewport de cadrage (zone libre) pour le directeur et la balise ; l'axe optique suit le milieu de la zone. */
  private layout(): void {
    const { zone, axisY } = safeViewport(this.fullViewport, this.safeArea);
    this.viewport = zone;
    this.director.setViewport(zone, axisY);
    this.apply();
  }
```

- [ ] **Step 5 : globe.** `globe.ts`, `applyPose` : avant `camera.updateProjectionMatrix()`, `if (camera instanceof OffsetCamera) camera.axisY = pose.axisY;` (import depuis `./offsetCamera`).

- [ ] **Step 6 : GlobeView.** Caméra fournie à R3F (R3F 9 garde une instance passée en `camera`, `events-*.cjs.dev.js` : `isCamera ? cameraOptions : new PerspectiveCamera…`) :

```tsx
  // Caméra décentrée (zone libre, D1) : une par GlobeView, réutilisée par les Canvas recréés après une perte du GPU.
  const [camera] = useState(() => new OffsetCamera(FOV_Y_DEG, 1, 0.001, 100));
```

`<Canvas … camera={camera}>` (au lieu de l'objet d'options). Handle : `setSafeArea: (a) => controller.setSafeArea(a),` et dans `GlobeHandle` : `/** Bandes occupées par l'interface (px CSS) : le pays se cadre et se centre dans la zone libre (D1) ; `null` : tout l'écran. */ setSafeArea(a: SafeArea | null): void;`.

- [ ] **Step 7 : sonde.** `probe/main.ts` : `const camera = new OffsetCamera(FOV_Y_DEG, width / height, 0.001, 100);` ; documenter `safe=top,bottom` (« bandes occupées, px : zone libre de la Task 4 du plan 2A-4 ») ; avec `rec`, après la création du directeur et avant `director.flyTo(rec)` :

```ts
  const safe = lngLat(q.get('safe'));
  if (safe) { const s = safeViewport({ width, height, fovYDeg: FOV_Y_DEG }, { top: safe[0], bottom: safe[1] }); director.setViewport(s.zone, s.axisY); }
```

Les deux poses écrites à la main reçoivent `axisY: 0` (`{ ...homePose(…), cut: false, axisY: 0 }` et la pose `at`).

- [ ] **Step 8 : démo.** `demo/main.tsx`, effet sur `ready` : `if (ready && q.has('safe')) { const [top, bottom] = q.get('safe')!.split(',').map(Number); globe.current!.setSafeArea({ top: top!, bottom: bottom! }); }`.

- [ ] **Step 9 : e2e.** Ajouter à `globe-api.spec.ts` (le centre des pixels jaunes du pays doit tomber au milieu de la zone ; sans décalage, il tomberait au centre de l'image, y ≈ 422) :

```ts
import { PNG } from 'pngjs';
import type { BackendName } from './sdf-check';

/** Centre (moyenne) des pixels du remplissage jaune du pays visé ; `null` s'il n'y en a pas. */
function yellowCentroid(png: PNG): [number, number] | null {
  let n = 0, sx = 0, sy = 0;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const i = (y * png.width + x) * 4, r = png.data[i]!, g = png.data[i + 1]!, b = png.data[i + 2]!;
    if (r > 170 && g > 160 && b < 60) { n++; sx += x; sy += y; }   // jaune du pays (#d3cd0f) ; le sable a b > 60
  }
  return n > 200 ? [sx / n, sy / n] : null;
}

// HUD 80 px, grille 300 px sur 390 × 844 : zone libre de 464 px, milieu à y = 312.
for (const [backend, tier] of [['webgpu', 'haute'], ['webgpu', 'standard'], ['webgl2', 'standard']] as [BackendName, string][]) {
  test(`${backend} ${tier} : la France se centre dans la zone libre (TRAA compris en haute)`, async ({ page }) => {
    await page.goto(`/probe.html?mode=game&cca3=FRA&safe=80,300&tier=${tier}&post&w=390&h=844${backend === 'webgl2' ? '&webgl' : ''}`);
    await page.waitForFunction(() => window.__probe !== undefined, null, { timeout: 60_000 });
    const c = yellowCentroid(PNG.sync.read(await page.screenshot()));
    console.log(backend, tier, 'centre du jaune', c);
    expect(c).not.toBeNull();
    expect(Math.abs(c![0] - 195)).toBeLessThan(15);
    expect(Math.abs(c![1] - 312)).toBeLessThan(15);
    const [fra] = await page.evaluate(() => window.__probe!.project([[2.35, 46.6]]));
    expect(Math.abs(fra![1] - 312)).toBeLessThan(25);
  });
}

test('jeu : setSafeArea recentre le pays visé dans la zone libre', async ({ page }) => {
  await page.goto('/demo.html?demo=FRA&safe=80,300');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 120_000 });
  await page.waitForTimeout(800);
  const c = yellowCentroid(PNG.sync.read(await page.screenshot()));
  expect(c).not.toBeNull();
  expect(Math.abs(c![1] - 312)).toBeLessThan(15);
});
```

Run d'abord avant les Steps 3-8 pour voir l'échec, puis : `cd web && E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/globe-api.spec.ts`. Expected : le centre est vers y ≈ 422 avant (FAIL), vers 312 après (PASS). Contre-épreuve : rendre `OffsetCamera.updateProjectionMatrix` inopérante (retour immédiat après `super`) → les trois tests de la sonde échouent ; remettre.

- [ ] **Step 10 : rien d'autre ne bouge.** Run : `cd web && npm run check && E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/visual.spec.ts e2e/intro.spec.ts e2e/flight.spec.ts e2e/beacon.spec.ts e2e/post.spec.ts`. Expected : tout vert, références visuelles identiques (axe à 0).

- [ ] **Step 11 : commit.**

```bash
git add web/src/camera/director.ts web/src/camera/director.test.ts web/src/globe/controller.ts web/src/globe/globe.ts web/src/globe/GlobeView.tsx web/src/probe/main.ts web/src/demo/main.tsx web/e2e/globe-api.spec.ts
git commit -m "globe : le pays se cadre et se centre dans la zone libre (caméra décentrée, TRAA compris) — spec 2A §5.1, D1"
```

---

### Task 5 : projection écran publique et rappel à chaque image

**Files:**
- Create: `web/src/globe/project.ts`, `web/src/globe/project.test.ts`
- Modify: `web/src/globe/controller.ts` (pose de la dernière image, abonnés, `project`)
- Modify: `web/src/globe/GlobeView.tsx` (handle `project`, `onFrame` ; crochet `view` sur `controller.pose`)
- Modify: `web/src/demo/main.tsx` (`__demo.project`)
- Test: `web/src/globe/controller.test.ts`, `web/e2e/globe-api.spec.ts`

**Interfaces:**
- Consumes : `projectOnScreen` avec `axisY` (Task 3), `FramePose.axisY` (Task 4).
- Produces : `export interface ScreenPoint { x: number; y: number; visible: boolean }` ; `screenPoint(pose: FramePose, v: Viewport, p: LngLat): ScreenPoint | null` ; `GlobeController.notePose(p: FramePose)`, `get pose(): FramePose | null`, `onFrame(cb: () => void): () => void`, `project(p: LngLat): ScreenPoint | null` ; `GlobeHandle.project`, `GlobeHandle.onFrame`.

- [ ] **Step 1 : tests.** `web/src/globe/project.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { northUp, toVec } from '../geo/vec';
import { screenPoint } from './project';

const v = { width: 390, height: 844, fovYDeg: 50 };
const at = (lngLat: [number, number], altitude: number, axisY = 0) => {
  const dir = toVec(lngLat);
  return { dir, altitude, up: northUp(dir), cut: false, pitch: 0, axisY };
};

describe('position écran d’un point du globe (spec 2A §5.2)', () => {
  it('le point visé est au centre, visible', () => {
    const s = screenPoint(at([2.35, 48.85], 0.5), v, [2.35, 48.85])!;
    expect(s.x).toBeCloseTo(195, 6);
    expect(s.y).toBeCloseTo(422, 6);
    expect(s.visible).toBe(true);
  });

  it('avec la zone libre, le point visé suit l’axe décalé', () => {
    const s = screenPoint(at([2.35, 48.85], 0.5, 0.26), v, [2.35, 48.85])!;
    expect(s.y).toBeCloseTo(422 - 0.26 * 422, 6);
  });

  it('face cachée : non visible (derrière l’horizon)', () => {
    const s = screenPoint(at([2.35, 48.85], 0.5), v, [-177.65, -48.85]);
    expect(s === null || s.visible === false).toBe(true);
  });

  it('hors du cadre : position rendue, non visible', () => {
    // 11,6° du point visé : devant l'horizon (17,8° à l'altitude 0,05) mais loin hors du champ (12,2° de demi-champ)
    const s = screenPoint(at([2.35, 48.85], 0.05), v, [20, 48.85])!;
    expect(s).not.toBeNull();
    expect(s.visible).toBe(false);
  });
});
```

Dans `controller.test.ts` :

```ts
describe('rappels à chaque image (GlobeController.onFrame)', () => {
  it('appelle chaque abonné après la pose, même si l’un d’eux lève ; se désinscrit', () => {
    const c = new GlobeController('/');
    const calls: string[] = [];
    const errors: unknown[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((e) => { errors.push(e); });
    c.onFrame(() => { throw new Error('calque cassé'); });
    const off = c.onFrame(() => calls.push(c.project([2.35, 30]) ? 'ok' : 'vide'));
    expect(c.project([2.35, 30])).toBeNull();          // avant la première image
    c.notePose(c.director.update(0));
    expect(calls).toEqual(['ok']);
    expect(errors).toHaveLength(1);
    off();
    c.notePose(c.director.update(16));
    expect(calls).toEqual(['ok']);
    spy.mockRestore();
  });
});
```

(import `vi` depuis `vitest`.)

- [ ] **Step 2 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit src/globe/project.test.ts src/globe/controller.test.ts`. Expected : FAIL.

- [ ] **Step 3 : implémenter.** `web/src/globe/project.ts` :

```ts
import type { FramePose } from '../camera/director';
import type { Viewport } from '../camera/framing';
import { projectOnScreen } from '../camera/home';
import type { LngLat } from '../data/types';
import { dot, toVec } from '../geo/vec';

/** Point du sol à l'écran (px CSS, coin haut gauche) ; `visible` : devant l'horizon et dans le cadre. */
export interface ScreenPoint { x: number; y: number; visible: boolean }

/**
 * Position écran d'un point du sol pour la pose d'une image (bulles des escales, étiquette « Pays · capitale », repères G5 ;
 * spec 2A §5.2) ; `null` derrière la caméra. Même calcul que la caméra three (offsetCamera.test.ts le vérifie).
 */
export function screenPoint(pose: FramePose, v: Viewport, p: LngLat): ScreenPoint | null {
  const q = toVec(p);
  const s = projectOnScreen(pose, v, q);
  if (!s) return null;
  const front = dot(q, pose.dir) * (1 + pose.altitude) > 1;   // P · C > 1 sur la sphère unité
  return { x: s[0], y: s[1], visible: front && s[0] >= 0 && s[0] <= v.width && s[1] >= 0 && s[1] <= v.height };
}
```

`controller.ts` :

```ts
  private lastPose: FramePose | null = null;
  private readonly frameListeners = new Set<() => void>();

  /** Pose dessinée à l'image courante (boucle de rendu, avant le rendu), puis les abonnés de `onFrame`. */
  notePose(p: FramePose): void {
    this.lastPose = p;
    for (const f of this.frameListeners) {
      try { f(); } catch (e) { console.error(e); }   // un calque cassé n'arrête pas le globe
    }
  }

  get pose(): FramePose | null { return this.lastPose; }

  /** Appelé à chaque image, pose posée : les calques DOM s'y recalent. Rend la désinscription. */
  onFrame(cb: () => void): () => void {
    this.frameListeners.add(cb);
    return () => { this.frameListeners.delete(cb); };
  }

  /** Position écran d'un point du sol à la dernière image (viewport complet) ; `null` avant la première image. */
  project(p: LngLat): ScreenPoint | null {
    return this.lastPose ? screenPoint(this.lastPose, this.fullViewport, p) : null;
  }
```

- [ ] **Step 4 : GlobeView.** Dans `useFrame`, après `globe.applyPose(pose, camera);` : `controller.notePose(pose);`. Supprimer la ref `lastPose` de la Task 2 ; `view: () => (controller.pose ? toLngLat(controller.pose.dir) : null)`. Handle : `project: (p) => controller.project(p), onFrame: (cb) => controller.onFrame(cb),` avec, dans `GlobeHandle` :

```ts
  /** Position écran d'un point du sol à la dernière image (px CSS) ; `null` avant la première image ou derrière la caméra. */
  project(p: LngLat): ScreenPoint | null;
  /** Appelé à chaque image, pose posée, avant le rendu : les calques DOM s'y recalent. Rend la désinscription. */
  onFrame(cb: () => void): () => void;
```

- [ ] **Step 5 : démo et e2e.** `demo/main.tsx` : `__demo` reçoit `project(p: LngLat): ScreenPoint | null` (initialisé à `() => null`, remplacé dans un effet par `(p) => globe.current?.project(p) ?? null`). Dans `globe-api.spec.ts` :

```ts
test('project du handle : même point que la caméra three, avec visibilité', async ({ page }) => {
  await page.goto('/demo.html?demo=FRA&safe=80,300');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 120_000 });
  const [pub, cam, back] = await page.evaluate(() => [window.__demo!.project([2.35, 46.6]), window.__globe!.project([2.35, 46.6]), window.__demo!.project([-177.65, -46.6])]);
  expect(pub!.visible).toBe(true);
  expect(Math.abs(pub!.x - cam![0])).toBeLessThan(0.5);
  expect(Math.abs(pub!.y - cam![1])).toBeLessThan(0.5);
  expect(back === null || back.visible === false).toBe(true);
});
```

- [ ] **Step 6 : vérifier.** Run : `cd web && npm run check && E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/globe-api.spec.ts`. Expected : vert.

- [ ] **Step 7 : commit.**

```bash
git add web/src/globe/project.ts web/src/globe/project.test.ts web/src/globe/controller.ts web/src/globe/controller.test.ts web/src/globe/GlobeView.tsx web/src/demo/main.tsx web/e2e/globe-api.spec.ts
git commit -m "globe : position écran publique avec visibilité, rappel à chaque image — spec 2A §5.2"
```

---

### Task 6 : signaux de chargement et d'erreur, nouvel essai, crédit placé, textes traduits

**Files:**
- Create: `web/src/globe/loading.ts`, `web/src/globe/loading.test.ts`
- Modify: `web/src/globe/textures.ts` (progression par fichier)
- Modify: `web/src/globe/credits.tsx` (placement)
- Modify: `web/src/globe/GlobeView.tsx` (props, signaux, `retry`, interface d'erreur)
- Modify: `web/src/app/App.tsx` (`onError`, `texts`)
- Modify: `web/src/demo/main.tsx` (journal des signaux, `credit`, `noerrorui`)
- Modify: `web/e2e/intro.spec.ts` (bouton « Réessayer » ou « Try again »)
- Test: `web/e2e/globe-api.spec.ts`

**Interfaces:**
- Produces : `createProgress(n: number, emit: (p: number) => void): { update(i: number, fraction: number): void }` ; `loadGlobeTextures(renderer, tier, base = '/', onProgress?: (file: number, fraction: number) => void)` (fichiers 0 à 3 : jour, nuit, surface, nuages) ; `export interface CreditPlacement { top?: string; right?: string; bottom?: string; left?: string; textAlign?: 'left' | 'center' | 'right' }` ; `ImageryCredit({ placement })` ; dans `GlobeView` : `export type GlobeErrorReason = 'unsupported' | 'load' | 'lost'`, `export interface GlobeError { reason: GlobeErrorReason; detail: string }`, props `onLoading?(progress: number)`, `onLost?()`, `onError?(e: GlobeError)` (remplace `onFailed`), `texts?: Messages['errors']` (défaut : `fr.errors`), `errorUi?: boolean` (défaut `true`), `credit?: CreditPlacement` ; `GlobeHandle.retry(): void`.

- [ ] **Step 1 : tests de la progression.** `web/src/globe/loading.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { createProgress } from './loading';

describe('progression du chargement du globe (D15)', () => {
  it('moyenne des fractions, sans recul, 1 quand tout est fini', () => {
    const seen: number[] = [];
    const p = createProgress(4, (x) => seen.push(x));
    p.update(0, 0.5);
    p.update(0, 0.2);          // un recul d'un fichier est ignoré
    p.update(1, 1);
    p.update(2, 1); p.update(3, 1); p.update(0, 1);
    expect(seen).toEqual([0.125, 0.375, 0.625, 0.875, 1]);
  });

  it('fraction hors bornes ou non finie : bornée, sans NaN', () => {
    const seen: number[] = [];
    const p = createProgress(2, (x) => seen.push(x));
    p.update(0, Number.NaN);
    p.update(0, 7);
    p.update(5, 1);            // fichier inconnu : ignoré
    expect(seen).toEqual([0.5]);
  });
});
```

- [ ] **Step 2 : vérifier l'échec, puis implémenter.** Run : `cd web && npx vitest run --project unit src/globe/loading.test.ts` → FAIL (module introuvable). `web/src/globe/loading.ts` :

```ts
/**
 * Progression combinée de `n` fichiers (jauge de l'écran de chargement, D15) : moyenne de leurs fractions, chacune bornée à
 * [0, 1] et sans recul ; `emit` seulement quand la valeur change. Un fichier sans taille connue reste à 0 jusqu'à sa fin.
 */
export function createProgress(n: number, emit: (p: number) => void) {
  const parts = new Array<number>(n).fill(0);
  let last = 0;
  return {
    update(i: number, fraction: number): void {
      if (!(i >= 0 && i < n)) return;
      const f = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
      if (f <= parts[i]!) return;
      parts[i] = f;
      const p = parts.reduce((a, b) => a + b, 0) / n;
      if (p !== last) { last = p; emit(p); }
    },
  };
}
```

Run à nouveau : PASS.

- [ ] **Step 3 : textures.** `textures.ts`, signature `loadGlobeTextures(renderer, tier, base = '/', onProgress?: (file: number, fraction: number) => void)` (doc : « `onProgress` : fichier 0 à 3 (jour, nuit, surface, nuages) et sa fraction ; 1 à la fin, échec compris ») et :

```ts
  const step = (i: number, url: string) =>
    loader.loadAsync(url, (e: ProgressEvent) => onProgress?.(i, e.total ? e.loaded / e.total : 0)).finally(() => onProgress?.(i, 1));
```

utilisé pour les quatre fichiers (`step(0, …day…)`, `step(1, …night…)`, `step(2, …surface…)`, `step(3, …clouds…).catch(() => null)`). `KTX2Loader.load` passe `onProgress` au `FileLoader` (lu dans `node_modules/three/examples/jsm/loaders/KTX2Loader.js`), `Loader.loadAsync(url, onProgress)` aussi.

- [ ] **Step 4 : crédit.** `credits.tsx` :

```tsx
/** Place du crédit (D2 : sur sa ligne sous la grille pendant les questions) ; défaut : en bas à droite. */
export interface CreditPlacement { top?: string; right?: string; bottom?: string; left?: string; textAlign?: 'left' | 'center' | 'right' }

export function ImageryCredit({ placement }: { placement?: CreditPlacement } = {}) {
```

et dans `style` : `…, textShadow: '0 0 2px #000', ...placement,` (après les valeurs par défaut).

- [ ] **Step 5 : GlobeView.** Imports : `import type { Messages } from '../i18n';`, `import { fr } from '../i18n/fr';`, `type CreditPlacement`. Types et props comme dans **Interfaces** ; dans le composant :

```tsx
  // Signaux par ref : un parent qui les donne en flèches inline ne doit pas recréer le renderer.
  const signals = useRef({ onError, onLoading, onLost });
  signals.current = { onError, onLoading, onLost };
  // Déjà prêt une fois : une erreur du renderer ensuite vient de sa recréation après une perte du GPU.
  const everReady = useRef(false);
  const fail = (e: GlobeError) => signals.current.onError?.(e);
  const retry = () => { setLoadError(null); regenerate(); };
```

- `gl` : `info.renderer.onDeviceLost = () => { signals.current.onLost?.(); regenerate(); };`
- handle : `retry,` ; `GlobeHandle` : `/** Après une erreur (chargement, recréation) : nouvel essai complet. */ retry(): void;`
- `<Unsupported key={generation} ui={errorUi} texts={texts} onFailed={(detail) => fail({ reason: everReady.current ? 'lost' : 'unsupported', detail })}>` ; le composant devient :

```tsx
class Unsupported extends Component<{ children: ReactNode; ui: boolean; texts: Messages['errors']; onFailed(detail: string): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e: unknown) { this.props.onFailed(String(e)); }
  render() {
    if (!this.state.failed) return this.props.children;
    if (!this.props.ui) return null;
    const t = this.props.texts;
    return <div className="globe-unsupported" role="alert"><p>{t.unsupportedTitle}</p><p>{t.unsupportedHint}</p></div>;
  }
}
```

- `GlobeScene` reçoit `onLoading(p: number)` ; dans l'effet de chargement, chaque tentative crée sa progression :

```tsx
    const attempt = () => {
      const progress = createProgress(5, (p) => onLoadingRef.current(p));
      return Promise.all([
        loadGlobeTextures(renderer, tier, '/', (i, f) => progress.update(i, f)),
        loadBorders().finally(() => progress.update(4, 1)),
      ]);
    };
    void withRetry(attempt, { attempts: 3, delayMs: 800 }).then(…inchangé…);
```

(`onLoadingRef` comme `onErrorRef`.) Côté `GlobeView` : `onLoading={(p) => signals.current.onLoading?.(p)}`, `onReady={(info) => { everReady.current = true; onReady?.(info); }}`, `onError={(e) => { setLoadError(String(e)); fail({ reason: 'load', detail: String(e) }); }}`.
- interface intégrée : `{loadError && errorUi && (<div role="alert" …><p>{texts.loadTitle}</p><p>{texts.loadText}</p><button onClick={retry}>{texts.retry}</button></div>)}` (style inchangé) ; `<ImageryCredit placement={credit} />`.

- [ ] **Step 6 : appelants.** `App.tsx` : `onError={() => setGlobeReady(true)}` (au lieu de `onFailed`), `texts={m.errors}`. `intro.spec.ts` : `page.getByRole('button', { name: /Réessayer|Try again/ })`.

- [ ] **Step 7 : démo.** `__demo` reçoit `loading: number[]`, `lost: number`, `errors: { reason: string; detail: string }[]`, `retry(): void` ; `GlobeView` de la démo : `onLoading={(p) => window.__demo!.loading.push(p)}`, `onLost={() => window.__demo!.lost++}`, `onError={(e) => window.__demo!.errors.push(e)}`, `errorUi={!q.has('noerrorui')}`, `credit={q.has('credit') ? { bottom: `${q.get('credit')}px` } : undefined}`.

- [ ] **Step 8 : e2e.** Ajouter à `globe-api.spec.ts` :

```ts
test('chargement : progression croissante jusqu’à 1, puis prêt', async ({ page }) => {
  await page.goto('/demo.html');
  await page.waitForFunction(() => (window.__demo?.ready ?? 0) > 0, null, { timeout: 120_000 });
  const p = await page.evaluate(() => window.__demo!.loading);
  expect(p.length).toBeGreaterThan(1);
  for (let i = 1; i < p.length; i++) expect(p[i]!).toBeGreaterThan(p[i - 1]!);
  expect(p.at(-1)).toBe(1);
});

test('perte du GPU : onLost, puis prêt de nouveau', async ({ page }) => {
  await page.goto('/demo.html');
  await page.waitForFunction(() => (window.__demo?.ready ?? 0) > 0, null, { timeout: 120_000 });
  await page.evaluate(() => window.__globe!.simulateDeviceLost());
  await page.waitForFunction(() => window.__demo!.ready === 2, null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.__demo!.lost)).toBe(1);
});

test('frontières introuvables : onError « load », sans interface intégrée ; retry() recharge', async ({ page }) => {
  let failing = true;
  await page.route('**/data/borders.json', (r) => (failing ? r.abort() : r.continue()));
  await page.goto('/demo.html?noerrorui');
  await page.waitForFunction(() => (window.__demo?.errors.length ?? 0) > 0, null, { timeout: 120_000 });
  expect(await page.evaluate(() => window.__demo!.errors[0]!.reason)).toBe('load');
  await expect(page.getByRole('alert')).toHaveCount(0);
  failing = false;
  await page.evaluate(() => window.__demo!.retry());
  await page.waitForFunction(() => (window.__demo?.ready ?? 0) > 0, null, { timeout: 120_000 });
});

test('le crédit se place où l’interface le demande, sans quitter l’écran', async ({ page }) => {
  await page.goto('/demo.html?credit=120');
  const credit = page.getByRole('contentinfo', { name: 'Crédits de l’imagerie' });
  await expect(credit).toBeVisible({ timeout: 120_000 });
  const box = (await credit.boundingBox())!;
  expect(Math.abs(844 - 120 - (box.y + box.height))).toBeLessThan(1.5);
  expect(box.x).toBeGreaterThanOrEqual(0);
});
```

`__demo.retry` : ajouté à l'objet de la démo (Step 7), `retry: () => globe.current?.retry()` posé dans le même effet que `project`. Run d'abord pour voir l'échec, puis : `cd web && npm run check && E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/globe-api.spec.ts e2e/load-failure.spec.ts e2e/unsupported.spec.ts e2e/credit.spec.ts e2e/intro.spec.ts`. Expected : vert.

- [ ] **Step 9 : commit.**

```bash
git add web/src/globe/loading.ts web/src/globe/loading.test.ts web/src/globe/textures.ts web/src/globe/credits.tsx web/src/globe/GlobeView.tsx web/src/app/App.tsx web/src/demo/main.tsx web/e2e/intro.spec.ts web/e2e/globe-api.spec.ts
git commit -m "globe : signaux de chargement, de perte et d'erreur, nouvel essai, crédit placé, textes traduits — spec 2A §5.5"
```

---

### Task 7 : objets de scène (accessoires)

**Files:**
- Create: `web/src/globe/accessories.ts`, `web/src/globe/accessories.test.ts`
- Modify: `web/src/globe/controller.ts` (registre)
- Modify: `web/src/globe/GlobeView.tsx` (hôte dans la scène, `mount` du handle)
- Modify: `web/src/demo/main.tsx` (`?accessoire`)
- Test: `web/src/globe/controller.test.ts`, `web/e2e/globe-api.spec.ts`

**Interfaces:**
- Produces : `AccessoryFrame { nowMs: number; pose: FramePose; sun: Vec3 }` ; `AccessoryInstance { object: THREE.Object3D; update?(f: AccessoryFrame): void; dispose(): void }` ; `Accessory { create(): AccessoryInstance }` ; `createAccessoryHost(scene: SceneLike): { sync(list: Iterable<Accessory>): void; update(f: AccessoryFrame): void; dispose(): void }` ; `GlobeController.mount(a): () => void`, `accessories(): Accessory[]`, `onAccessories(cb): () => void` ; `GlobeHandle.mount(a: Accessory): () => void`. Le plan 2A-6 y monte l'avion A2 (traînée, ombre portée par `sun`).

- [ ] **Step 1 : tests.** `web/src/globe/accessories.test.ts` :

```ts
import type * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { createAccessoryHost, type Accessory } from './accessories';

const scene = () => { const objects: unknown[] = []; return { objects, add: (o: unknown) => objects.push(o), remove: (o: unknown) => objects.splice(objects.indexOf(o), 1) }; };
const acc = (name: string, log: string[]): Accessory => ({
  create: () => { log.push(`+${name}`); return { object: { name } as unknown as THREE.Object3D, update: () => log.push(`~${name}`), dispose: () => log.push(`-${name}`) }; },
});
const frame = { nowMs: 0, pose: { dir: [0, 0, 1], altitude: 1, up: [0, 1, 0], cut: false, pitch: 0, axisY: 0 }, sun: [0, 0, 1] } as const;

describe('accessoires de la scène (spec 2A §5.3)', () => {
  it('monte, met à jour à chaque image, retire et libère', () => {
    const log: string[] = [], s = scene(), host = createAccessoryHost(s);
    const a = acc('avion', log), b = acc('traînée', log);
    host.sync([a, b]);
    host.update(frame);
    host.sync([b]);
    host.dispose();
    expect(log).toEqual(['+avion', '+traînée', '~avion', '~traînée', '-avion', '-traînée']);
    expect(s.objects).toEqual([]);
  });

  it('un accessoire qui lève à la création n’empêche pas les autres', () => {
    const log: string[] = [], s = scene(), host = createAccessoryHost(s);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    host.sync([{ create: () => { throw new Error('cassé'); } }, acc('avion', log)]);
    host.update(frame);
    expect(log).toEqual(['+avion', '~avion']);
    expect(s.objects).toHaveLength(1);
    spy.mockRestore();
  });
});
```

Dans `controller.test.ts` :

```ts
describe('registre des accessoires (GlobeController)', () => {
  it('mount ajoute, le retour retire, les abonnés sont prévenus', () => {
    const c = new GlobeController('/');
    const a = { create: () => { throw new Error('non appelé ici'); } };
    let changes = 0;
    c.onAccessories(() => changes++);
    const off = c.mount(a);
    expect(c.accessories()).toEqual([a]);
    off();
    off();
    expect(c.accessories()).toEqual([]);
    expect(changes).toBe(2);
  });
});
```

- [ ] **Step 2 : vérifier l'échec.** Run : `cd web && npx vitest run --project unit src/globe/accessories.test.ts src/globe/controller.test.ts`. Expected : FAIL.

- [ ] **Step 3 : implémenter.** `web/src/globe/accessories.ts` :

```ts
import type * as THREE from 'three/webgpu';
import type { FramePose } from '../camera/director';
import type { Vec3 } from '../geo/vec';

/** Données d'une image pour un accessoire : horloge, pose de la caméra, direction du soleil (ombre portée). */
export interface AccessoryFrame { nowMs: number; pose: FramePose; sun: Vec3 }
export interface AccessoryInstance { object: THREE.Object3D; update?(f: AccessoryFrame): void; dispose(): void }
/**
 * Objet de scène ajouté au globe (avion de l'accueil, plan 2A-6 ; spec 2A §5.3). `create` est rappelé à chaque renderer :
 * après une perte du GPU, la scène est neuve et l'accessoire recréé.
 */
export interface Accessory { create(): AccessoryInstance }
export interface SceneLike { add(o: THREE.Object3D): unknown; remove(o: THREE.Object3D): unknown }

/** Monte dans une scène les accessoires demandés ; un accessoire qui lève à la création est ignoré (le globe continue). */
export function createAccessoryHost(scene: SceneLike) {
  const live = new Map<Accessory, AccessoryInstance>();
  const sync = (list: Iterable<Accessory>) => {
    const want = new Set(list);
    for (const [a, inst] of live) {
      if (want.has(a)) continue;
      scene.remove(inst.object);
      inst.dispose();
      live.delete(a);
    }
    for (const a of want) {
      if (live.has(a)) continue;
      try {
        const inst = a.create();
        scene.add(inst.object);
        live.set(a, inst);
      } catch (e) { console.error(e); }
    }
  };
  return {
    sync,
    update(f: AccessoryFrame): void { for (const inst of live.values()) inst.update?.(f); },
    dispose(): void { sync([]); },
  };
}
```

`controller.ts` :

```ts
  private readonly mounted = new Set<Accessory>();
  private readonly accessoryListeners = new Set<() => void>();

  /** Objet de scène (survit à la perte du GPU : la scène le recrée). Rend le retrait. */
  mount(a: Accessory): () => void {
    this.mounted.add(a);
    this.emitAccessories();
    return () => { if (this.mounted.delete(a)) this.emitAccessories(); };
  }

  accessories(): Accessory[] { return [...this.mounted]; }

  onAccessories(cb: () => void): () => void {
    this.accessoryListeners.add(cb);
    return () => { this.accessoryListeners.delete(cb); };
  }

  private emitAccessories(): void { for (const f of this.accessoryListeners) f(); }
```

- [ ] **Step 4 : scène.** `GlobeView.tsx`, dans `GlobeScene` :

```tsx
  // Accessoires (avion de l'accueil) : un hôte par scène, donc par renderer ; recréés après une perte du GPU.
  const host = useMemo(() => createAccessoryHost(scene), [scene]);
  useEffect(() => {
    if (!globe) return;
    const sync = () => host.sync(controller.accessories());
    sync();
    const off = controller.onAccessories(sync);
    return () => { off(); host.dispose(); };
  }, [globe, host, controller]);
```

Dans `useFrame`, après `globe.applyPose(pose, camera);` et avant `controller.notePose(pose);` : `host.update({ nowMs: now, pose, sun: sunDirection(pose) });` (`sunDirection` depuis `../camera/sun`). Handle : `mount: (a) => controller.mount(a),` ; `GlobeHandle` : `/** Objet de scène (avion de l'accueil, 2A-6), recréé avec le renderer. Rend le retrait. */ mount(a: Accessory): () => void;`.

- [ ] **Step 5 : démo et e2e.** `demo/main.tsx`, effet sur `ready` :

```tsx
  // `?accessoire` : une bille magenta posée sur Paris (contrôle du montage, et de sa recréation après une perte du GPU)
  useEffect(() => {
    if (!ready || !q.has('accessoire')) return;
    return globe.current!.mount({
      create: () => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 8), new THREE.MeshBasicNodeMaterial({ color: 0xff00ff }));
        m.position.set(...toVec([2.35, 48.85]));
        return { object: m, dispose: () => { m.geometry.dispose(); m.material.dispose(); } };
      },
    });
  }, [ready]);
```

(imports : `* as THREE from 'three/webgpu'`, `toVec` depuis `../geo/vec`.) Dans `globe-api.spec.ts` :

```ts
test('accessoire monté : dessiné, et recréé après une perte du GPU', async ({ page }) => {
  await page.goto('/demo.html?demo=FRA&accessoire');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 120_000 });
  const magenta = async () => {
    await page.waitForTimeout(800);
    const p = (await page.evaluate(() => window.__demo!.project([2.35, 48.85])))!;
    const png = PNG.sync.read(await page.screenshot());
    const i = (Math.round(p.y) * png.width + Math.round(p.x)) * 4;
    return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
  };
  const [r, g, b] = await magenta();
  expect(r > 150 && b > 150 && g < 100).toBe(true);
  await page.evaluate(() => window.__globe!.simulateDeviceLost());
  await page.waitForFunction(() => window.__demo!.ready === 2, null, { timeout: 120_000 });
  const [r2, g2, b2] = await magenta();
  expect(r2 > 150 && b2 > 150 && g2 < 100).toBe(true);
});
```

Run d'abord pour voir l'échec, puis : `cd web && npm run check && E2E_BASE_URL=http://localhost:5174 npx playwright test e2e/globe-api.spec.ts`. Expected : vert.

- [ ] **Step 6 : commit.**

```bash
git add web/src/globe/accessories.ts web/src/globe/accessories.test.ts web/src/globe/controller.ts web/src/globe/controller.test.ts web/src/globe/GlobeView.tsx web/src/demo/main.tsx web/e2e/globe-api.spec.ts
git commit -m "globe : objets de scène montés par l'interface, recréés avec le renderer — spec 2A §5.3"
```

---

### Task 8 : suite complète, passation, image 1.6

**Files:**
- Modify: `docs/HANDOFF.md`, `deploy/k8s/countrizz.yaml` (étiquette `1.6`)

- [ ] **Step 1 : suite du Mac, en local.** Run : `cd web && npm run check && npm run test:data && npm run e2e:local`. Expected : tout vert ; `e2e/visual.spec.ts` sans nouvelle référence (aucune image ne change) ; `staleFrames` à 0.
- [ ] **Step 2 : revue finale** par un relecteur neuf sur toute la branche depuis le commit qui précède la Task 1 (skill du mode d'exécution choisi) ; corrections test d'abord.
- [ ] **Step 3 : passation.** En tête de la reprise de `docs/HANDOFF.md`, une ligne datée : plan 2A-4 fait (handle : `setSafeArea`, `project`, `onFrame`, `mount`, `retry`, tickets de vol ; props `onLoading`, `onLost`, `onError`, `texts`, `errorUi`, `credit`), nombres de tests recopiés des sorties, décisions 1 à 9 du plan à valider ; contrat pour 2A-5 (`ARRIVED` sur `arrived === true`, `setSafeArea` à l'entrée du 3-2-1, `errorUi={false}` avec les écrans D16) ; suite : plan 2A-5.
- [ ] **Step 4 : étiquette.** `deploy/k8s/countrizz.yaml` : `image: pablohassan/countrizz-web:1.6`. Commit : `déploiement : countrizz-web 1.6 (API du globe 2A-4)`.
- [ ] **Step 5 : GO de l'utilisateur**, puis `deploy/scripts/build-image.sh` ; nouveau GO, puis `ssh pablo1@192.168.1.171 'kubectl apply -f -' < deploy/k8s/countrizz.yaml` et `kubectl -n countrizz rollout status deploy/countrizz-web`.
- [ ] **Step 6 : sur le site.** Run : `cd web && npm run e2e && npm run budget`. Expected : tout vert ; chiffres recopiés dans la passation.
