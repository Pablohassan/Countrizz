import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { expect, test, type Browser } from '@playwright/test';
import type { ImageryIndex } from '../src/data/imagery';
import type { Manifeste } from '../src/intro/videos';

/**
 * Octets transférés (texte compté gzip, comme le servira nginx). Démo : jusqu'à l'arrivée sur le premier pays (spec 2A §11).
 * Accueil (spec intro vidéo §7, 11/10/2026) : l'affiche puis la première image de l'intro en moins d'une seconde sur une
 * bonne connexion ; chaque vidéo sous son plafond ; tout jusqu'à la fin du fondu ≤ 12 Mo en « standard », vidéos non
 * comptées (lues en flux pendant que le globe se charge).
 */
export const FIRST_LOAD_BUDGET = {
  standard: 8_000_000,
  /** Première image de l'intro (`__intro.premiereImageMs`, ms depuis la navigation) sur une bonne connexion : « < 1 s » (spec §7). */
  demarrage: 1_000,
  /** Affiche du cadrage (octets) : moins d'un dixième de seconde de bonne connexion (1 280 000 o/s), pris sur le démarrage. */
  affiche: 100_000,
  accueil: 12_000_000,
  /** Même mesure en « Fast 4G » (choix de l'utilisateur, 20/10/2026) : médiane 1121 ms en ligne (1.12), plus 16 % de marge. */
  demarrageFast4G: 1_300,
} as const;
/**
 * Réseaux du démarrage, émulés par CDP (`Network.emulateNetworkConditions` : latence en ms, débits en octets/s), sources
 * lues le 11/10/2026 dans devtools-frontend :
 * - « bonne connexion » (spec §7, bornée) : les chiffres de `desktopDense4G`, la connexion des audits de bureau de
 *   Lighthouse (`front_end/models/trace/lantern/simulation/Constants.ts` : 40 ms d'aller-retour, 10 × 1024 kbit/s), posés
 *   tels quels en latence par requête — les DevTools multiplient un aller-retour visé par 2,75 à 3,75 pour en faire une
 *   latence par requête : c'est donc un réseau fixe (≈ 11 à 15 ms d'aller-retour), pas un mobile ;
 * - « Fast 4G » (bornée à 1,3 s, 20/10/2026) : le préréglage des DevTools (`front_end/core/sdk/NetworkManager.ts` :
 *   9 Mbit/s × 0,9 en descente, 1,5 Mbit/s × 0,9 en montée, 60 ms × 2,75 de latence), le plus rapide de ses profils mobiles.
 */
export const RESEAUX = {
  'bonne connexion': { offline: false, latency: 40, downloadThroughput: (10 * 1024 * 1000) / 8, uploadThroughput: (10 * 1024 * 1000) / 8 },
  'Fast 4G': { offline: false, latency: 60 * 2.75, downloadThroughput: (9_000_000 / 8) * 0.9, uploadThroughput: (1_500_000 / 8) * 0.9 },
} as const;
const imagery = JSON.parse(readFileSync('public/data/imagery.json', 'utf8')) as ImageryIndex;
/** Plafond de chaque vidéo (octets), fixé à la Task 8 du plan de l'intro vidéo sur les fichiers rendus. */
const { plafonds } = JSON.parse(readFileSync('e2e-budget/plafonds-video.json', 'utf8')) as { plafonds: Record<string, number> };
/** Les vidéos de l'intro : lues en flux, hors du total de l'accueil (spec §7). */
const VIDEO = /^\/video\/[^/]+\.mp4$/;

function collect(page: import('@playwright/test').Page) {
  const rows: { url: string; bytes: number }[] = [];
  const pending: Promise<void>[] = []; // mesures asynchrones : toutes attendues avant le total
  const onResponse = (r: import('@playwright/test').Response) => { pending.push(measure(r)); };
  page.on('response', onResponse);
  const measure = async (r: import('@playwright/test').Response) => {
    if (r.url().startsWith('blob:') || r.url().startsWith('data:')) return; // workers du transcodeur : pas du réseau
    const url = new URL(r.url()).pathname;
    // photos hors dépôt (absentes en CI) : on compte la taille que donne l'index
    const m = url.match(/\/patches\/img\/(\w+)-(\d+)-(\d+)\.ktx2$/);
    if (r.status() === 404 && m) {
      const [, id, level, size] = m;
      rows.push({ url: `${url} (index)`, bytes: imagery.countries[id!.toUpperCase()]!.levels[Number(level)]!.files[size!]!.bytes });
      return;
    }
    if (r.status() >= 300) return;
    const type = r.headers()['content-type'] ?? '';
    let sent: number;
    try { sent = (await r.request().sizes()).responseBodySize; } // 0 si servi par le cache du navigateur
    catch { console.log(`taille inconnue (requête interrompue) : ${url}`); return; } // ex. vidéo démontée en pleine lecture
    if (sent === 0) return;
    const body = /javascript|json|html|css|wasm/.test(type) ? await r.body().catch(() => null) : null;
    rows.push({ url, bytes: body ? gzipSync(body, { level: 9 }).length : sent });
  };
  const stop = async () => { page.off('response', onResponse); await Promise.all(pending); };
  /** Chaque fichier (ceux que `keep` écarte marqués « hors budget »), puis le total compté. */
  const report = (budget: number, keep: (url: string) => boolean = () => true) => {
    rows.sort((a, b) => b.bytes - a.bytes);
    const total = rows.filter((r) => keep(r.url)).reduce((s, r) => s + r.bytes, 0);
    console.log(rows.map((r) => `${String(r.bytes).padStart(9)}  ${r.url}${keep(r.url) ? '' : '  (hors budget)'}`).join('\n'));
    console.log(`dont photos du pays : ${rows.filter((r) => r.url.includes('/patches/img/')).reduce((s, r) => s + r.bytes, 0)} octets`);
    console.log(`total ${total} octets (budget ${budget})`);
    return total;
  };
  return { stop, report };
}

test('premier chargement au niveau « standard » (WebGL 2) : globe, données, premier pays', async ({ page }) => {
  const m = collect(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo.html?demo=FRA&webgl');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 0 });
  await page.waitForLoadState('networkidle');
  await m.stop(); // ce qui arrive après le premier pays n'est pas du premier chargement
  expect(m.report(FIRST_LOAD_BUDGET.standard)).toBeLessThanOrEqual(FIRST_LOAD_BUDGET.standard);
});

/**
 * Une première visite (contexte neuf : rien en cache, service worker bloqué) sous `conditions` : l'instant de la première
 * image de l'intro (`__intro.premiereImageMs`) et les octets de l'affiche du cadrage.
 */
async function premiereVisite(browser: Browser, baseURL: string, conditions: (typeof RESEAUX)[keyof typeof RESEAUX] | null) {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  try {
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('countrizz:e2e', '1')); // crochets window.__intro
    if (conditions) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', conditions);
    }
    const affiche = page.waitForResponse((r) => new URL(r.url()).pathname === '/intro/affiche-portrait.webp');
    await page.goto('/?webgl');
    await page.waitForFunction(() => window.__intro?.premiereImageMs != null || window.__intro?.echec != null, null, { timeout: 0 });
    const { premiereImageMs, echec, variante } = await page.evaluate(() => window.__intro!);
    return { ms: premiereImageMs, echec, variante, affiche: (await (await affiche).request().sizes()).responseBodySize };
  } finally { await ctx.close(); }
}

for (const [reseau, conditions] of Object.entries(RESEAUX)) {
  test(`démarrage (${reseau}) : l’affiche, puis la première image de l’intro`, async ({ browser, baseURL }) => {
    // une visite d'échauffement (lecteur vidéo et GPU du navigateur démarrés : la première coûte 1,3 à 2 s de plus, mesuré
    // le 11/10), puis la médiane de trois premières visites
    await premiereVisite(browser, baseURL!, null);
    const visites = [];
    for (let i = 0; i < 3; i++) visites.push(await premiereVisite(browser, baseURL!, conditions));
    const ms = visites.map((v) => v.ms ?? Infinity).sort((x, y) => x - y), mediane = ms[1]!;
    console.log(`démarrage (${reseau}) : première image à ${ms.map(Math.round).join(', ')} ms, médiane ${Math.round(mediane)} (budget ${reseau === 'Fast 4G' ? FIRST_LOAD_BUDGET.demarrageFast4G : FIRST_LOAD_BUDGET.demarrage}) ; affiche ${visites[0]!.affiche} octets (budget ${FIRST_LOAD_BUDGET.affiche}) ; variante ${JSON.stringify(visites[0]!.variante)}`);
    for (const v of visites) {
      expect(v.echec).toBeNull();
      expect(v.affiche).toBeLessThanOrEqual(FIRST_LOAD_BUDGET.affiche);
    }
    expect(mediane).toBeLessThanOrEqual(reseau === 'Fast 4G' ? FIRST_LOAD_BUDGET.demarrageFast4G : FIRST_LOAD_BUDGET.demarrage);
  });
}

test('chaque vidéo de l’intro sous son plafond (fichiers servis par le site, octets de son manifeste)', async ({ request }) => {
  const m = await (await request.get('/video/videos.json')).json() as Manifeste;
  expect(m.variantes.map((v) => v.src).sort()).toEqual(Object.keys(plafonds).sort());
  for (const v of m.variantes) {
    const r = await request.head(v.src);
    const octets = Number(r.headers()['content-length']);
    console.log(`${String(octets).padStart(9)}  ${v.src} (plafond ${plafonds[v.src]})`);
    expect(r.status()).toBe(200);
    expect(octets).toBe(v.octets);
    expect(octets).toBeLessThanOrEqual(plafonds[v.src]!);
  }
});

for (const tier of ['standard', 'haute'] as const) {
  test(`accueil (${tier}) : tout jusqu'à la fin du fondu, vidéos non comptées`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('countrizz:e2e', '1')); // crochets window.__intro
    const m = collect(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(tier === 'standard' ? '/?webgl' : '/');
    await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 0 });
    await page.getByRole('button', { name: /Passer|Skip/ }).click();
    await expect(page.locator('.intro')).toHaveCount(0, { timeout: 0 });
    await page.waitForLoadState('networkidle');
    await m.stop();
    const total = m.report(FIRST_LOAD_BUDGET.accueil, (u) => !VIDEO.test(u));
    // spec zoom §6 : les deux niveaux
    expect(total).toBeLessThanOrEqual(FIRST_LOAD_BUDGET.accueil);
  });
}
