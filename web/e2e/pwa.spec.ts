import { expect, test } from '@playwright/test';

/**
 * PWA (spec 2A §8, décisions du 10/10) : manifeste installable, service worker, fichiers lourds gardés sur l'appareil,
 * accueil hors ligne après une première visite. Le service worker n'existe qu'en production : ces contrôles tournent sur
 * le site déployé (ou sur `vite preview`) ; ailleurs ils sont sautés.
 */
test.slow(true, 'SwiftShader : la première visite charge tout le globe');
test.use({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });

test('le manifeste décrit une appli installable (portrait, plein écran, icônes)', async ({ page, request }) => {
  await page.goto('/?webgl');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  test.skip(href === null, 'pas de manifeste : serveur de dev');
  const m = await (await request.get(href!)).json() as { display: string; orientation: string; theme_color: string; start_url: string; icons: { src: string; purpose?: string }[] };
  expect(m).toMatchObject({ display: 'standalone', orientation: 'portrait', theme_color: '#16173a', start_url: '/' });
  expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const i of m.icons) expect((await request.get(i.src)).status()).toBe(200);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test('après une visite, les fichiers lourds sont sur l’appareil et l’accueil s’ouvre hors ligne', async ({ page, context }) => {
  await page.goto('/?webgl');
  test.skip((await page.locator('link[rel="manifest"]').count()) === 0, 'pas de service worker : serveur de dev');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // première visite : on saute l'intro, on attend le globe (tout ce qui est chargé passe par le service worker)
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 120_000 });
  await page.getByRole('button', { name: /Passer|Skip/ }).click();
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  // le passage par le service worker se fait en arrière-plan, fichier après fichier : on attend qu'il ait fini
  const lourds = ['/textures/day-4k.ktx2', '/textures/surface-4k.ktx2', '/intro/monde.jpg', '/basis/basis_transcoder.wasm'];
  await expect.poll(() => page.evaluate(async (wanted) => {
    const out: string[] = [];
    for (const n of await caches.keys()) for (const r of await (await caches.open(n)).keys()) out.push(new URL(r.url).pathname);
    return wanted.filter((w) => !out.includes(w));
  }, lourds), { timeout: 60_000 }).toEqual([]);
  // hors ligne : la page, l'intro et le globe viennent de l'appareil
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 120_000 });
  await page.getByRole('button', { name: /Passer|Skip/ }).click();
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  await context.setOffline(false);
});
