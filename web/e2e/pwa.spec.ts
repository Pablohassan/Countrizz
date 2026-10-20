import { expect, test, type Page } from '@playwright/test';
import { openHome, startGame } from './game-helpers';

/**
 * PWA (spec 2A §8, décisions du 10/10) : manifeste installable, service worker, fichiers lourds gardés sur l'appareil,
 * accueil hors ligne après une première visite. Le service worker n'existe qu'en production : ces contrôles tournent sur
 * le site déployé (ou sur `vite preview`) ; ailleurs ils sont sautés. Les vidéos de l'intro ne passent jamais par lui
 * (D1 du plan de l'intro vidéo : lues par plages d'octets) : hors ligne, accueil direct.
 */
test.slow(true, 'SwiftShader : la première visite charge tout le globe');
test.use({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });

/** Variante forcée (crochets e2e) : AV1 à 60 i/s, lue par Chromium headless. */
const VARIANTE = 'portrait-plein-60-av1';
/** Chemins rangés dans les caches du service worker. */
const enCache = (page: Page) => page.evaluate(async () => {
  const out: string[] = [];
  for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname);
  return out;
});

test('le manifeste décrit une appli installable (portrait, plein écran, icônes)', async ({ page, request }) => {
  await page.goto('/?webgl');
  // compter d'abord : `getAttribute` attendrait l'élément jusqu'au délai du test sur le serveur de dev (constaté le 10/10)
  test.skip((await page.locator('link[rel="manifest"]').count()) === 0, 'pas de manifeste : serveur de dev');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const m = await (await request.get(href!)).json() as { display: string; orientation: string; theme_color: string; start_url: string; icons: { src: string; purpose?: string }[] };
  expect(m).toMatchObject({ display: 'standalone', orientation: 'portrait', theme_color: '#16173a', start_url: '/' });
  expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const i of m.icons) expect((await request.get(i.src)).status()).toBe(200);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test('après une visite, les fichiers lourds sont sur l’appareil et l’accueil s’ouvre hors ligne', async ({ page, context }) => {
  await page.goto(`/?webgl&introVariante=${VARIANTE}`);
  test.skip((await page.locator('link[rel="manifest"]').count()) === 0, 'pas de service worker : serveur de dev');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // première visite : on saute l'intro, on attend le globe (tout ce qui est chargé passe par le service worker)
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 120_000 });
  await page.getByRole('button', { name: /Passer|Skip/ }).click();
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  // le passage par le service worker se fait en arrière-plan, fichier après fichier : on attend qu'il ait fini
  const lourds = ['/textures/day-4k.ktx2', '/textures/surface-4k.ktx2', '/intro/affiche-portrait.webp', '/intro/ancres.json', '/basis/basis_transcoder.wasm'];
  await expect.poll(async () => { const out = await enCache(page); return lourds.filter((w) => !out.includes(w)); }, { timeout: 60_000 }).toEqual([]);
  expect((await enCache(page)).filter((p) => p.startsWith('/video/'))).toEqual([]);
  // hors ligne : la page et le globe viennent de l'appareil ; la vidéo non (D1) : accueil direct
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  await context.setOffline(false);
});

test('seconde visite, service worker actif : la vidéo se lit, servie par le réseau, jamais rangée dans ses caches', async ({ page }) => {
  await page.goto(`/?webgl&introVariante=${VARIANTE}`);
  test.skip((await page.locator('link[rel="manifest"]').count()) === 0, 'pas de service worker : serveur de dev');
  await page.evaluate(() => navigator.serviceWorker.ready);
  const videos: { url: string; status: number; sw: boolean }[] = [];
  page.on('response', (r) => { if (/^\/video\/.+\.mp4$/.test(new URL(r.url()).pathname)) videos.push({ url: r.url(), status: r.status(), sw: r.fromServiceWorker() }); });
  await page.reload(); // la page est maintenant contrôlée par le service worker
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 120_000 });
  const { t, echec } = await page.evaluate(() => window.__intro!);
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__intro!.t)).toBeGreaterThan(t + 0.5); // elle avance
  expect(echec).toBeNull();
  expect(videos.length).toBeGreaterThan(0);
  expect(videos.filter((v) => v.sw)).toEqual([]); // jamais servie par le service worker
  expect((await enCache(page)).filter((p) => p.startsWith('/video/'))).toEqual([]);
});

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

/**
 * Cache fichier par fichier (spec océan §3) : la table des empreintes rangée dans le cache dit de quelle version est chaque
 * copie. On y vieillit l'empreinte d'une seule texture, comme après un déploiement qui ne change qu'elle : au chargement
 * suivant, seule cette texture sort du cache, puis revient du réseau ; les autres restent servies par le service worker.
 */
test('une seule texture changée : elle seule repasse au réseau, les autres restent sur l’appareil', async ({ page, context }) => {
  await page.goto(`/?webgl&introVariante=${VARIANTE}`);
  test.skip((await page.locator('link[rel="manifest"]').count()) === 0, 'pas de service worker : serveur de dev');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await openHome(page);
  const lourds = ['/textures/day-4k.ktx2', '/textures/surface-4k.ktx2', '/textures/night-4k.ktx2'];
  await expect.poll(async () => { const out = await enCache(page); return lourds.filter((w) => !out.includes(w)); }, { timeout: 60_000 }).toEqual([]);
  const table = '/__countrizz-empreintes__.json';
  expect(await enCache(page)).toContain(table);
  await page.evaluate(async (key) => {
    const c = await caches.open('countrizz-lourd');
    const t = await (await c.match(key))!.json() as Record<string, string>;
    t['/textures/surface-4k.ktx2'] = 'ancienne';
    await c.put(key, new Response(JSON.stringify(t)));
  }, table);
  // requêtes émises par le service worker lui-même : ce qu'il va chercher au réseau (le reste vient de son cache)
  const network: string[] = [];
  context.on('request', (r) => { if (r.serviceWorker()) network.push(new URL(r.url()).pathname); });
  await openHome(page);
  // le service worker est allé chercher la seule texture changée ; jour et nuit viennent du cache
  expect(network.filter((p) => lourds.includes(p))).toEqual(['/textures/surface-4k.ktx2']);
  expect(await enCache(page)).toEqual(expect.arrayContaining(lourds));
});

/**
 * Nouvelle version pendant la visite (src/pwa/update.ts). Le navigateur relit `sw.js` hors des routes de Playwright : on
 * envoie donc l'événement que donne le nouveau service worker en prenant la main (`skipWaiting`, `clientsClaim`). Le
 * vrai cycle (un `sw.js` changé d'un octet) a été essayé à la main le 19/10 sous le nginx de l'image. Marque posée dans
 * la page : elle disparaît au rechargement ; `window.__intro` n'existe pas si l'intro n'a pas été montée.
 */
async function pageControlee(page: Page, query = '') {
  await page.goto(`/?webgl${query}`);
  test.skip((await page.locator('link[rel="manifest"]').count()) === 0, 'pas de service worker : serveur de dev');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await openHome(page, query); // visite suivante : la page est contrôlée, accueil direct
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}
async function nouvelleVersion(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __ancienne: boolean }).__ancienne = true;
    navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
  });
}
const ancienne = (page: Page) => page.evaluate(() => (window as unknown as { __ancienne?: boolean }).__ancienne === true).catch(() => null);
const rechargeeSansIntro = async (page: Page) => {
  await expect.poll(() => ancienne(page), { timeout: 60_000 }).toBe(false);
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => window.__intro === undefined)).toBe(true);
  await expect(page.getByRole('button', { name: /^(Jouer|Play)/ })).toBeEnabled({ timeout: 180_000 });
};

test('nouvelle version, joueur à l’accueil : la page se recharge d’elle-même et s’ouvre sur l’accueil, sans l’intro', async ({ page }) => {
  await pageControlee(page);
  await nouvelleVersion(page);
  await rechargeeSansIntro(page);
  // le rechargement suivant est ordinaire : l'intro est de nouveau montée
  await page.reload();
  await page.waitForFunction(() => window.__intro !== undefined, null, { timeout: 30_000 });
});

test('nouvelle version pendant une partie : rien ne bouge, la page se recharge au retour à l’accueil', async ({ page }) => {
  await pageControlee(page, '&graine=7');
  await startGame(page, /Pays|Country/); // langue du navigateur de test : anglais
  await page.waitForFunction(() => window.__game?.state.screen !== 'mode');
  await nouvelleVersion(page);
  await page.waitForTimeout(3_000);
  expect(await ancienne(page)).toBe(true);
  expect(await page.evaluate(() => window.__game!.state.screen)).not.toBe('home');
  await page.getByRole('button', { name: /^(Quitter|Quit)$/ }).click();
  await rechargeeSansIntro(page);
});
