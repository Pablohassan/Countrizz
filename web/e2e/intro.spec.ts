import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { messages } from '../src/i18n';
import { couverture, versEcran } from '../src/intro/lecteur';
import { MARGE_QUESTION, ORDRE_QUESTIONS, QUESTIONS, RETOUR, ancreQuestion, etatLettre, poserMot, type Ancres, type Question } from '../src/intro/questions';
import { CADRAGES, INTRO, INTRO_GIVE_UP_MS, LOGO_ANGLE_FIN, LOGO_TOUR_S, type Cadrage } from '../src/intro/temps';
import { idVariante, type Manifeste } from '../src/intro/videos';

/**
 * Intro en vidéo précalculée (spec `2026-10-11-countrizz-intro-video-blender-design.md` §4, §5, §8). La vidéo est décodée
 * hors du GPU logiciel : elle se lit en temps réel, deux parcours la laissent aller au bout. Chromium headless mesure
 * toujours ~60 Hz et lit l'AV1 : les parcours forcent leur variante (`?introVariante=`, crochets e2e), sauf ceux qui
 * contrôlent le choix lui-même. Les questions se contrôlent à des instants figés (`?introT=`) contre
 * `public/intro/ancres.json` et les fonctions pures des questions (`poserMot`, `etatLettre`, `versEcran`) : le site doit
 * servir les fichiers de ce dépôt (e2e/deployed.ts).
 */
test.slow(true, 'SwiftShader : le globe se charge lentement sous la vidéo');
test.use({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });

const manifeste = JSON.parse(readFileSync('public/video/videos.json', 'utf8')) as Manifeste;
const ancres = JSON.parse(readFileSync('public/intro/ancres.json', 'utf8')) as Ancres;
/** Variantes forcées : AV1 à 60 i/s, celle que Chromium headless reçoit (D3, D6), sans dépendre de sa mesure. */
const VARIANTE: Record<Cadrage, string> = { portrait: 'portrait-plein-60-av1', paysage: 'paysage-plein-60-av1' };
/**
 * Texte attendu de chaque question : `modes.*` du catalogue, suivi de la typographie de la langue. Elle est écrite ici,
 * et non prise à `questions.ts`, puisque c'est elle qu'on contrôle : en français une espace fine insécable (U+202F)
 * avant « ? », en anglais « ? » collé.
 */
const MODE = { capitale: 'capital', pays: 'country', drapeau: 'flag' } as const;
const POINT = { fr: ' ?', en: '?' } as const;
/** Lettres de chaque mot (blancs exclus), dans l'ordre des questions. */
const LETTRES = { fr: [9, 5, 8], en: [8, 8, 5] } as const;
/**
 * La page mesure le centre au repos de chaque lettre en `offset*`, qui sont entiers : il est donc connu à 0,75 px vidéo
 * près. On l'admet à 1,5 px vidéo, plus un quart de px CSS.
 */
const ECART_VIDEO = 1.5;
/** Un mot posé reste à 8 px CSS des bords (spec §5) ; on admet 1 px pour la mesure entière des lettres. */
const BORD = MARGE_QUESTION - 1;

const accueil = (page: Page) => page.locator('.accueil .accueil-titre');
const credit = (page: Page) => page.getByRole('contentinfo', { name: 'Crédits de l’imagerie' });
const passer = (page: Page) => page.getByRole('button', { name: /Passer|Skip/ });
const intro = (page: Page) => page.evaluate(() => window.__intro!);
const uneImage = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

/** Instants figés sur la grille de 1/60 s (la vidéo à 60 i/s). */
const grille = (t: number) => Math.round(t * 60) / 60;
/** Avant la naissance de « Capitale ? » (le point touche Paris à 11,22 s) : aucune lettre. */
const AVANT = grille(QUESTIONS.capitale.naissance - 0.1);
/** Chaque mot en plein envol : sa première lettre à mi-vol, entre son objet et sa place. */
const ENVOL = Object.fromEntries(ORDRE_QUESTIONS.map((q) => [q, grille(QUESTIONS[q].naissance + QUESTIONS[q].vol / 2)])) as Record<Question, number>;
/** Les trois mots posés (la dernière lettre de « Drapeau ? » se pose à 14,12 s), avant le retour (RETOUR, 15,6 s). */
const TOUS_POSES = grille(14.5);
/** Le retour dans les objets, en cours. */
const RENTRENT = grille(RETOUR + 0.35);
/** Second dézoom (16,4 s) : toutes les lettres sont rentrées. */
const APRES = grille(16.4);

/**
 * Une passe de scène par trame de three (skill threejs-r186-webgpu-tsl, règle 3) : un second rendu dans la même trame montre
 * une image périmée. Le globe compte ces rendus ; après quelques images rendues, il n'y en a aucun.
 */
async function expectNoStaleFrame(page: Page) {
  await page.waitForFunction(() => (window.__globe?.frames ?? 0) > 5, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__globe?.staleFrames)).toBe(0);
}

/**
 * `?introT=` : la vidéo posée à t, en pause, son image affichée ; police chargée (Intro.tsx mesure de nouveau les
 * questions quand Chango arrive) et une image de plus pour leur pose.
 */
async function figee(page: Page, t: number) {
  await page.waitForFunction((t) => window.__intro?.ready === true && Math.abs(window.__intro.t - t) < 0.05, t, { timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await uneImage(page);
}

/** La vidéo couvre tout l'écran (rognage `cover`, portrait calé en haut — D8) : aucune bande vide. */
async function couvre(page: Page, cadrage: Cadrage) {
  const { width, height } = page.viewportSize()!;
  const v = await page.locator('.intro video').evaluate((el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return { gauche: r.left, haut: r.top, droite: r.right, bas: r.bottom, fit: s.objectFit, pos: s.objectPosition };
  });
  expect(v.gauche).toBeLessThanOrEqual(0);
  expect(v.haut).toBeLessThanOrEqual(0);
  expect(v.droite).toBeGreaterThanOrEqual(width);
  expect(v.bas).toBeGreaterThanOrEqual(height);
  expect(v.fit).toBe('cover');
  expect(v.pos).toMatch(cadrage === 'portrait' ? /^50% 0(%|px)?$/ : /^50% 50%$/); // valeur calculée : « 50% 0px » pour « 50% 0 »
}

/**
 * Ce que la page montre des questions, lu d'un coup. Le calque d'abord. Puis, pour chaque mot, son texte, son gabarit
 * mesuré comme Intro.tsx le mesure (`offset*` : px de la vidéo, le transform du calque n'y entre pas) et chaque lettre
 * à l'écran.
 */
const lire = (page: Page) => page.locator('.intro .intro-questions').evaluate((c: HTMLElement) => ({
  cadrage: c.dataset.cadrage,
  transform: c.style.transform,
  mots: [...c.querySelectorAll<HTMLElement>('.intro-question')].map((m) => {
    const ls = [...m.querySelectorAll<HTMLElement>('.intro-lettre')];
    return {
      q: m.dataset.question,
      texte: m.textContent,
      g: { largeur: m.offsetWidth, hauteur: m.offsetHeight, lettres: ls.map((l) => ({ x: l.offsetLeft + l.offsetWidth / 2, y: l.offsetTop + l.offsetHeight / 2, w: l.offsetWidth, h: l.offsetHeight })) },
      lettres: ls.map((l) => {
        const r = l.getBoundingClientRect();
        return { opacite: Number(getComputedStyle(l).opacity), x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, gauche: r.left, droite: r.right, haut: r.top, bas: r.bottom };
      }),
    };
  }),
}));

/**
 * Les questions à l'image affichée (`__intro.t`), dans la langue :
 * - le calque est dans le repère de la vidéo de ce cadrage, posé sur l'écran par le transform de `couverture` (D8) ;
 * - chaque mot a son texte ;
 * - chaque lettre est visible si et seulement si `etatLettre` la montre, et là où il la met, sur le mot que `poserMot`
 *   pose pour cet écran ; aucune lettre avant la naissance de son mot ;
 * - en vol, une lettre est entre l'ancre de son objet (convertie à l'écran) et sa place de repos, saut compris ;
 * - un mot posé (toutes ses lettres arrivées, avant le retour) est entier dans l'écran, à 8 px des bords. Ce contrôle
 *   ne prend que les boîtes des lettres, rien de `questions.ts`.
 * Rend le nombre de lettres visibles de chaque mot. Pour la première lettre en vol de chaque mot, rend aussi ses
 * distances à son objet et à sa place (px CSS).
 */
async function verifierQuestions(page: Page, cadrage: Cadrage, lang: 'fr' | 'en') {
  const { t } = await intro(page);
  const ecran = page.viewportSize()!, video = CADRAGES[cadrage], k = couverture(video, ecran, cadrage);
  const ici = `${ecran.width}×${ecran.height}, ${t} s`, lu = await lire(page);
  expect(lu.cadrage, `repère du calque des questions (${ici})`).toBe(cadrage);
  // Chromium relit le style à 6 chiffres significatifs : 0,01 px pour la translation, 1e-5 en relatif pour l'échelle
  const [tx, ty, s] = (/^translate\((\S+)px, (\S+)px\) scale\((\S+)\)$/.exec(lu.transform) ?? []).slice(1).map(Number);
  expect(Math.abs(s / k.echelle - 1) < 1e-5 && Math.abs(tx - k.x) < 0.01 && Math.abs(ty - k.y) < 0.01,
    `calque des questions posé par couverture (${ici}) : « ${lu.transform} », attendu translate(${k.x}px, ${k.y}px) scale(${k.echelle})`).toBe(true);
  expect(lu.mots.map((m) => m.q)).toEqual([...ORDRE_QUESTIONS]);
  const tol = ECART_VIDEO * k.echelle + 0.25;
  const vues: Record<Question, number> = { capitale: 0, pays: 0, drapeau: 0 };
  const envol: Partial<Record<Question, { objet: number; place: number }>> = {};
  ORDRE_QUESTIONS.forEach((q, j) => {
    const m = lu.mots[j], Q = QUESTIONS[q], n = m.lettres.length;
    expect(m.texte, `texte de ${q} (${lang})`).toBe(messages[lang].modes[MODE[q]] + POINT[lang]);
    const mot = poserMot(q, cadrage, m.g, ecran), a = (mot.inclinaison * Math.PI) / 180, [cx, cy] = mot.centre;
    m.lettres.forEach((l, i) => {
      const e = etatLettre(t, mot, i, ancres), vue = l.opacite > 0.01;
      expect(vue, `${q}, lettre ${i}, visible à ${t} s`).toBe(e !== null && e.opacite > 0.01);
      if (!vue || !e) return;
      vues[q]++;
      const [ex, ey] = versEcran([e.x, e.y], video, ecran, cadrage);
      expect(Math.hypot(l.x - ex, l.y - ey), `${q}, lettre ${i}, à sa place (${ici})`).toBeLessThanOrEqual(tol);
      if (t >= Q.naissance + i * Q.ecart + Q.vol) return;
      // en vol : partie de l'ancre de son objet (qui bouge : le drapeau monte), vers sa place de repos (inclinée)
      const A = versEcran(ancreQuestion(ancres, cadrage, q, t), video, ecran, cadrage), [nx, ny] = mot.lettres[i];
      const R = versEcran([cx + (nx - cx) * Math.cos(a) - (ny - cy) * Math.sin(a), cy + (nx - cx) * Math.sin(a) + (ny - cy) * Math.cos(a)], video, ecran, cadrage);
      const entre = l.x >= Math.min(A[0], R[0]) - tol && l.x <= Math.max(A[0], R[0]) + tol
        && l.y >= Math.min(A[1], R[1]) - Q.saut * k.echelle - tol && l.y <= Math.max(A[1], R[1]) + tol;
      expect(entre, `${q}, lettre ${i}, en vol entre son objet (${A.map(Math.round).join(', ')}) et sa place (${R.map(Math.round).join(', ')}) : (${Math.round(l.x)}, ${Math.round(l.y)}) à ${t} s`).toBe(true);
      envol[q] ??= { objet: Math.hypot(l.x - A[0], l.y - A[1]), place: Math.hypot(l.x - R[0], l.y - R[1]) };
    });
    if (t <= Q.naissance) expect(vues[q], `${q} : aucune lettre avant sa naissance (${Q.naissance} s)`).toBe(0);
    if (t >= Q.naissance + (n - 1) * Q.ecart + Q.vol && t < RETOUR) {
      const dit = `${q} (${lang}) entière dans l'écran (${ici})`;
      expect(vues[q], dit).toBe(n);
      expect(Math.min(...m.lettres.map((l) => l.gauche)), dit).toBeGreaterThanOrEqual(BORD);
      expect(Math.min(...m.lettres.map((l) => l.haut)), dit).toBeGreaterThanOrEqual(BORD);
      expect(Math.max(...m.lettres.map((l) => l.droite)), dit).toBeLessThanOrEqual(ecran.width - BORD);
      expect(Math.max(...m.lettres.map((l) => l.bas)), dit).toBeLessThanOrEqual(ecran.height - BORD);
    }
  });
  return { vues, envol };
}
/** Lettres visibles de chaque mot, dans l'ordre des questions. */
const compte = (v: { vues: Record<Question, number> }) => ORDRE_QUESTIONS.map((q) => v.vues[q]);

/** Le calque et chaque lettre tels que la page les a écrits (pour voir qu'ils ne bougent plus). */
const ecrites = (page: Page) => page.locator('.intro .intro-questions').evaluate((c: HTMLElement) =>
  [c.style.transform, ...[...c.querySelectorAll<HTMLElement>('.intro-lettre')].map((l) => `${l.style.opacity} ${l.style.transform}`)]);

/**
 * Onglet caché, simulé : Chromium headless ne cache jamais une page (sondé le 11/10 : `visibilityState` reste « visible »
 * derrière un autre onglet). Le script fait ce que fait le navigateur : `document.hidden` et son évènement, rAF suspendu,
 * vidéo mise en pause (Chrome suspend une vidéo muette en arrière-plan), relancée au retour sauf `relancer = false` :
 * c'est alors à la page de la relancer (Intro.tsx, comme pour un navigateur qui ne le fait pas). Les minuteurs
 * (`setTimeout`, `setInterval`) continuent, comme dans un vrai onglet caché (ralentis, pas arrêtés).
 */
type Onglet = { __onglet(cache: boolean, relancer?: boolean): void };
function simulerOnglet() {
  let cache = false;
  const attente: FrameRequestCallback[] = [], pausees: HTMLVideoElement[] = [];
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (f) => { if (!cache) return raf(f); attente.push(f); return 0; };
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => cache });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (cache ? 'hidden' : 'visible') });
  (window as unknown as Onglet).__onglet = (c, relancer = true) => {
    cache = c;
    if (c) for (const v of document.querySelectorAll('video')) if (!v.paused) { v.pause(); pausees.push(v); }
    document.dispatchEvent(new Event('visibilitychange'));
    if (!c) {
      for (const v of pausees.splice(0)) if (relancer) void v.play().catch(() => undefined);
      for (const f of attente.splice(0)) raf(f);
    }
  };
}

test('la vidéo se lit jusqu’au bout et mène à l’accueil, sans « Passer » ; le globe tourne ensuite', async ({ page }) => {
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  expect((await intro(page)).variante).toEqual({ cadrage: 'portrait', taille: 'plein', ips: 60, codec: 'av1' });
  // accessibilité (spec §5) : la vidéo a un nom ; l'affiche et le calque des questions sont décoratifs
  await expect(page.locator('.intro video')).toHaveAttribute('aria-label', messages.fr.intro.videoLabel);
  const decor = page.locator('.intro .intro-affiche, .intro .intro-questions');
  await expect(decor).toHaveCount(2);
  for (const el of await decor.all()) await expect(el).toHaveAttribute('aria-hidden', 'true');
  // temps réel : le temps de la vidéo avance avec l'horloge ; pas d'accueil avant ACCUEIL
  const t0 = (await intro(page)).t;
  await page.waitForTimeout(1000);
  expect((await intro(page)).t - t0).toBeGreaterThan(0.5);
  await page.waitForFunction((t) => window.__intro!.t >= t, INTRO.ACCUEIL - 1, { timeout: 60_000 });
  await expect(page.locator('.accueil')).toHaveCount(0);
  await expect(accueil(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 120_000 }); // globe prêt, fondu fini
  expect(await intro(page)).toMatchObject({ skipped: false, echec: null });
  await expect(page.getByRole('button', { name: /^(Jouer|Play)/ })).toBeVisible();   // « Jouer » ouvre le choix du mode (2A-5)
  await expect(credit(page)).toBeVisible();
  // rotation légère de l'accueil (HOME_SPIN_DEG_PER_S) : la longitude visée bouge d'une image à l'autre (SwiftShader rend
  // une image en quelques secondes : on compte les images, pas le temps)
  const vue = () => page.evaluate(() => ({ lng: window.__globe!.view()![0], frames: window.__globe!.frames }));
  const a = await vue();
  await page.waitForFunction((f) => window.__globe!.frames >= f + 2, a.frames, { timeout: 60_000 });
  const b = await vue();
  expect(Math.abs(((b.lng - a.lng + 540) % 360) - 180)).toBeGreaterThan(0.01);
  await expectNoStaleFrame(page);
});

test('WebGPU : rien ne se compile à l’apparition de l’accueil, avion compris (précompilé sous la vidéo)', async ({ page }) => {
  // L'avion était monté à la fin du fondu : ses pipelines se compilaient alors, d'un bloc, sur le fil principal (à-coup à
  // l'apparition de l'accueil, 23/10). On compte les créations bloquantes de pipelines une fois l'intro démontée.
  await page.addInitScript(() => {
    const D = (globalThis as unknown as { GPUDevice?: { prototype: Record<string, (...a: unknown[]) => unknown> } }).GPUDevice;
    const w = window as unknown as { __bloquants: number };
    w.__bloquants = 0;
    if (!D) return;
    const f = D.prototype.createRenderPipeline!;
    D.prototype.createRenderPipeline = function (this: unknown, ...a: unknown[]) {
      if (!document.querySelector('.intro') && document.querySelector('.accueil')) w.__bloquants++;
      return f.apply(this, a);
    };
  });
  await page.goto(`/?introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  test.skip(await page.evaluate(() => window.__globe?.backend !== 'webgpu'), 'WebGPU seulement');
  await page.waitForFunction(() => !!window.__plane?.look(), null, { timeout: 60_000 });
  const f0 = await page.evaluate(() => window.__globe!.frames);
  await page.waitForFunction((f) => window.__globe!.frames >= f + 5, f0, { timeout: 120_000 });
  expect(await page.evaluate(() => (window as unknown as { __bloquants: number }).__bloquants)).toBe(0);
});

test('sans variante forcée : le lecteur choisit une vidéo lisible du bon cadrage, à 60 i/s, et elle avance', async ({ page }) => {
  await page.goto('/?webgl');
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  const { variante, t } = await intro(page);
  expect(variante).toMatchObject({ cadrage: 'portrait', ips: 60 }); // headless : rAF à 16,7 ms → 60 i/s (D3)
  await page.waitForTimeout(1000);
  expect((await intro(page)).t).toBeGreaterThan(t + 0.5);
});

test('« Passer › » saute à la fin : accueil, fondu, intro démontée', async ({ page }) => {
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  await passer(page).click();
  await expect(accueil(page)).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  expect(await intro(page)).toMatchObject({ skipped: true, echec: null });
});

test('vidéo absente (requête en échec) : accueil direct sur le globe', async ({ page }) => {
  await page.route(/\/video\/[^/]+\.mp4$/, (r) => r.abort());
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await expect(accueil(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0);
  expect((await intro(page)).echec).toBe('erreur');
  // accueil direct (D5) : pas de titre en pâte à relayer, les lettres surgissent une à une
  await expect(accueil(page)).toHaveClass(/\blogo-titre--pop\b/);
  expect(await accueil(page).locator('.logo-l').first().evaluate((e) => getComputedStyle(e).animationName)).toBe('logo-lettre');
});

test('lecture refusée (play() rejeté, ex. économie d’énergie d’iOS) : accueil direct', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('lecture refusée (test)', 'NotAllowedError'));
  });
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await expect(accueil(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0);
  expect((await intro(page)).echec).toBe('lecture-refusee');
});

test('aucun codec lisible (MediaCapabilities et canPlayType disent non) : accueil direct', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.canPlayType = () => '';
    Object.defineProperty(Navigator.prototype, 'mediaCapabilities', { configurable: true, get: () => ({ decodingInfo: async () => ({ supported: false, smooth: false, powerEfficient: false }) }) });
  });
  await page.goto('/?webgl'); // variante non forcée : le lecteur choisit, et ne trouve rien
  await expect(accueil(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0);
  expect((await intro(page)).echec).toBe('aucun-codec');
});

test('requête vidéo jamais servie : l’affiche du bon cadrage, puis l’accueil direct au bout de 8 s', async ({ page }) => {
  await page.route(/\/video\/[^/]+\.mp4$/, () => { /* jamais servie : aucune image ne vient */ });
  const debut = Date.now();
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await expect(page.locator(`.intro img[src$="${manifeste.affiches.portrait}"]`)).toBeVisible({ timeout: 5_000 });
  await expect(accueil(page)).toBeVisible({ timeout: INTRO_GIVE_UP_MS + 20_000 });
  expect(Date.now() - debut).toBeGreaterThanOrEqual(INTRO_GIVE_UP_MS);
  await expect(page.locator('.intro')).toHaveCount(0);
  expect((await intro(page)).echec).toBe('pas-d-image');
});

test('« Passer » pendant que la vidéo se charge : accueil tout de suite', async ({ page }) => {
  await page.route(/\/video\/[^/]+\.mp4$/, () => { /* jamais servie */ });
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await expect(passer(page)).toBeVisible({ timeout: 30_000 });
  await passer(page).click();
  await expect(accueil(page)).toBeVisible({ timeout: 5_000 });
});

test('globe lent : la vidéo s’arrête sur sa dernière image sous l’accueil, puis le fondu part', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/textures/day-*.ktx2', async (route) => { await gate; await route.continue(); });
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  await expect(accueil(page)).toBeVisible({ timeout: (INTRO.ACCUEIL + 30) * 1000 });
  await page.waitForFunction((d) => {
    const v = document.querySelector<HTMLVideoElement>('.intro video');
    return !!v && v.paused && v.currentTime >= d - 0.1;
  }, manifeste.duree, { timeout: 60_000 });
  await page.waitForTimeout(2000);
  await expect(page.locator('.intro')).toHaveCount(1); // le fondu attend le globe
  expect(await page.locator('.intro video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  release();
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  await expectNoStaleFrame(page); // l'image de préchauffage (globe inactif) compte aussi
});

test('globe en échec : le fondu part quand même et « Réessayer » se voit', async ({ page }) => {
  await page.route('**/data/borders.json', (r) => r.abort());
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  await passer(page).click();
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: /Réessayer|Try again/ })).toBeVisible({ timeout: 60_000 });
});

test('code du globe introuvable (D15) : le fondu part quand même, « Réessayer » sous l’accueil, pas de page blanche', async ({ page }) => {
  // le morceau GlobeView : /src/globe/GlobeView.tsx en dev, /assets/GlobeView-<empreinte>.js en production
  await page.route(/\/(src\/globe\/GlobeView\.tsx|assets\/GlobeView-[\w-]+\.js)(\?.*)?$/, (r) => r.abort());
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  await passer(page).click();
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 60_000 });
  await expect(accueil(page)).toBeVisible();
  await expect(page.getByRole('button', { name: /Réessayer|Try again/ })).toBeVisible();
});

test('titre de l’accueil (D5) : invisible sous la vidéo jusqu’au fondu, puis en fondu ; la petite Terre repart à l’angle de la vidéo', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/textures/day-*.ktx2', async (route) => { await gate; await route.continue(); });
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  await passer(page).click(); // la vidéo saute à sa dernière image (le titre en pâte), l'accueil se monte ; le fondu attend le globe
  const titre = accueil(page);
  const style = () => titre.evaluate((e) => { const s = getComputedStyle(e); return { opacite: Number(s.opacity), animation: s.animationName, duree: parseFloat(s.animationDuration) }; });
  await expect(titre).toHaveClass(/\blogo-titre--fondu\b/, { timeout: 5_000 });
  await page.waitForTimeout(1000);
  await expect(titre).not.toHaveClass(/\blogo-titre--visible\b/);
  expect((await style()).opacite).toBe(0); // la vidéo le montre en pâte : le titre HTML attend
  expect(await titre.locator('.logo-l').first().evaluate((e) => getComputedStyle(e).animationName)).toBe('none'); // ses lettres ne surgissent pas
  release();
  await expect(titre).toHaveClass(/\blogo-titre--visible\b/, { timeout: 180_000 });
  // en fondu, au rythme de la vidéo qui s'efface (FIN − FONDU), jusqu'à l'opacité pleine
  expect(await style()).toMatchObject({ animation: 'logo-fondu', duree: expect.closeTo(INTRO.FIN - INTRO.FONDU, 2) });
  await expect.poll(async () => (await style()).opacite, { timeout: 10_000 }).toBe(1);
  // « Passer » : la vidéo est sur sa dernière image, la petite Terre part de son angle (LOGO_ANGLE_FIN)
  // planche en grille : la ligne et la planche (::before) partent du même --delai (23/10)
  const delais = await page.locator('.accueil .logo-terre-ligne').evaluate((e) => [getComputedStyle(e), getComputedStyle(e, '::before')].map((s) => parseFloat(s.animationDelay)));
  expect(delais[1]).toBe(delais[0]);
  const delai = delais[0]!;
  expect(delai).toBeCloseTo(-(LOGO_ANGLE_FIN / (2 * Math.PI)) * LOGO_TOUR_S, 2);
});

for (const lang of ['fr', 'en'] as const) {
  test.describe(`questions (${lang})`, () => {
    test.use({ locale: lang === 'fr' ? 'fr-FR' : 'en-US' });
    test('aux instants figés : rien avant la naissance, chaque mot né de son objet, les trois posés entiers dans l’écran, plus rien après le retour', async ({ page }) => {
      const voir = async (t: number) => {
        await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}&introT=${t}`);
        await figee(page, t);
        return verifierQuestions(page, 'portrait', lang);
      };
      expect(compte(await voir(AVANT)), `lettres visibles à ${AVANT} s`).toEqual([0, 0, 0]);
      for (const q of ORDRE_QUESTIONS) {
        // en plein envol : la première lettre a quitté son objet et n'est pas encore à sa place
        const { envol } = await voir(ENVOL[q]);
        expect(envol[q]?.objet, `${q} a quitté son objet à ${ENVOL[q]} s`).toBeGreaterThan(10);
        expect(envol[q]?.place, `${q} pas encore à sa place à ${ENVOL[q]} s`).toBeGreaterThan(10);
      }
      expect(compte(await voir(TOUS_POSES)), `lettres visibles à ${TOUS_POSES} s`).toEqual([...LETTRES[lang]]);
      await voir(RENTRENT);
      expect(compte(await voir(APRES)), `lettres visibles à ${APRES} s`).toEqual([0, 0, 0]);
    });
  });
}

// Review Focus 1 : écrans loin des deux références (1080×2340, 1920×1080). Variante non forcée : le cadrage vient de la fenêtre.
const ECRANS = [
  { nom: 'iPad portrait', width: 768, height: 1024, cadrage: 'portrait' },
  { nom: 'bureau 21:9', width: 2560, height: 1080, cadrage: 'paysage' },
  { nom: 'téléphone court', width: 390, height: 664, cadrage: 'portrait' },
] as const;
for (const e of ECRANS) {
  test(`${e.nom} ${e.width}×${e.height} : la vidéo couvre l’écran, chaque question reste entière dedans`, async ({ page }) => {
    await page.setViewportSize({ width: e.width, height: e.height });
    for (const t of [TOUS_POSES, grille(RETOUR - 0.1)]) { // les trois mots posés, à deux instants de leur vie (onde, oscillation)
      await page.goto(`/?webgl&introT=${t}`);
      await figee(page, t);
      expect((await intro(page)).variante?.cadrage).toBe(e.cadrage);
      await couvre(page, e.cadrage);
      expect(compte(await verifierQuestions(page, e.cadrage, 'fr'))).toEqual([...LETTRES.fr]);
    }
  });
}

test('rotation et redimensionnement pendant l’intro : la vidéo n’est pas rechargée, les questions sont reposées et restent entières dans l’écran', async ({ page }) => {
  const t = TOUS_POSES;
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}&introT=${t}`);
  await figee(page, t);
  const src = await page.locator('.intro video').evaluate((v: HTMLVideoElement) => {
    v.dataset.chargements = '0';
    v.addEventListener('loadstart', () => { v.dataset.chargements = String(Number(v.dataset.chargements) + 1); });
    return v.currentSrc;
  });
  const autres: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()).pathname; if (/^\/video\/.+\.mp4$/.test(u) && !src.endsWith(u)) autres.push(u); });
  // 768 × 1024 : l'écran grandit, les mots y tiendraient même sans être reposés ; seul le transform du calque le voit
  for (const ecran of [{ width: 430, height: 932 }, { width: 844, height: 390 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(ecran);
    await uneImage(page);
    await couvre(page, 'portrait'); // le cadrage choisi au départ reste (même vidéo, calée en haut)
    expect(compte(await verifierQuestions(page, 'portrait', 'fr'))).toEqual([...LETTRES.fr]);
  }
  // même élément (marqué), même source, aucun nouveau chargement
  expect(await page.locator('.intro video').evaluate((v: HTMLVideoElement) => [v.dataset.chargements, v.currentSrc])).toEqual(['0', src]);
  expect(autres).toEqual([]);
});

test('le réseau cale en pleine lecture : les questions attendent avec la vidéo, puis accueil après 8 s sans progrès', async ({ page }) => {
  // le serveur n'a que les octets jusqu'au milieu de la vie des questions (débit supposé régulier) ; la suite ne vient jamais
  const v = manifeste.variantes.find((x) => idVariante(x) === VARIANTE.portrait)!;
  const coupe = Math.floor((v.octets * (QUESTIONS.capitale.naissance + RETOUR)) / 2 / manifeste.duree);
  await page.route(/\/video\/[^/]+\.mp4$/, async (route) => {
    const debut = Number(/bytes=(\d+)-/.exec(route.request().headers()['range'] ?? '')?.[1] ?? 0);
    if (debut >= coupe) return; // jamais servie : la lecture cale
    const r = await route.fetch({ headers: { ...route.request().headers(), range: `bytes=${debut}-${coupe - 1}` } });
    const total = /\/(\d+)$/.exec(r.headers()['content-range'] ?? '')?.[1] ?? String(v.octets);
    await route.fulfill({ status: 206, headers: { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-range': `bytes ${debut}-${coupe - 1}/${total}` }, body: await r.body() });
  });
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 60_000 });
  // calée : le temps de la vidéo ne bouge plus depuis 1 s
  const tCale = await (await page.waitForFunction(() => {
    const w = window as unknown as { __cale?: { t: number; depuis: number } }, t = window.__intro!.t, now = performance.now();
    if (!w.__cale || w.__cale.t !== t) { w.__cale = { t, depuis: now }; return false; }
    return now - w.__cale.depuis > 1000 ? t : false;
  }, null, { timeout: 40_000, polling: 100 })).jsonValue();
  const cale = Date.now();
  test.info().annotations.push({ type: 'calage', description: `vidéo calée à ${tCale} s` });
  // la coupe doit tomber pendant la vie des questions : sans lettre visible, « elles attendent » ne vérifierait rien
  expect(compte(await verifierQuestions(page, 'portrait', 'fr')).some((n) => n > 0), `lettres visibles à ${tCale} s`).toBe(true);
  const avant = await ecrites(page);
  await page.waitForTimeout(2000);
  expect(await ecrites(page)).toEqual(avant); // elles attendent avec la vidéo
  expect((await intro(page)).echec).toBeNull();
  await expect(accueil(page)).toBeVisible({ timeout: INTRO_GIVE_UP_MS + 15_000 });
  expect(Date.now() - cale).toBeGreaterThanOrEqual(INTRO_GIVE_UP_MS - 2000); // 8 s sans progrès, dont ~1 s pour voir le calage
  await expect(page.locator('.intro')).toHaveCount(0);
  expect((await intro(page)).echec).toBe('bloquee');
});

test('onglet caché pendant la lecture : aucun abandon pendant l’absence ni à cause d’elle ; au retour, la lecture reprend', async ({ page }) => {
  await page.addInitScript(simulerOnglet);
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro?.ready === true && window.__intro.t > 1, null, { timeout: 60_000 });
  await page.evaluate(() => (window as unknown as Onglet).__onglet(true));
  const tCache = (await intro(page)).t;
  await page.waitForTimeout(INTRO_GIVE_UP_MS + 2000); // plus long que les abandons (« pas d'image », « plus de progrès »)
  expect((await intro(page)).echec).toBeNull();
  await expect(page.locator('.intro')).toHaveCount(1);
  await page.evaluate(() => (window as unknown as Onglet).__onglet(false, false));
  // le script ne relance pas la vidéo : c'est Intro.tsx qui doit le faire (play() est permis ici), sans compter l'absence
  // comme un calage
  await page.waitForFunction((t0) => window.__intro!.t > t0 + 0.5, tCache, { timeout: 10_000 });
  expect((await intro(page)).echec).toBeNull();
  await expect(page.locator('.intro')).toHaveCount(1);
});

test('onglet caché avant la première image : l’absence ne compte pas dans les 8 s', async ({ page }) => {
  await page.addInitScript(simulerOnglet);
  await page.route(/\/video\/[^/]+\.mp4$/, () => { /* jamais servie */ });
  const debut = Date.now();
  await page.goto(`/?webgl&introVariante=${VARIANTE.portrait}`);
  await page.waitForFunction(() => window.__intro !== undefined, null, { timeout: 30_000 });
  await page.evaluate(() => (window as unknown as Onglet).__onglet(true));
  const cache = Date.now();
  await page.waitForTimeout(INTRO_GIVE_UP_MS + 2000);
  expect((await intro(page)).echec).toBeNull();
  await expect(page.locator('.intro')).toHaveCount(1);
  await page.evaluate(() => (window as unknown as Onglet).__onglet(false));
  const retour = Date.now();
  await expect(accueil(page)).toBeVisible({ timeout: INTRO_GIVE_UP_MS + 10_000 });
  // les 8 s se comptent onglet visible : avant l'absence (majoré par le chargement de la page) et après le retour
  expect(cache - debut + (Date.now() - retour)).toBeGreaterThanOrEqual(INTRO_GIVE_UP_MS - 500);
  expect((await intro(page)).echec).toBe('pas-d-image');
});
