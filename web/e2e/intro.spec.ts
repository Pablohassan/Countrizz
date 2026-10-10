import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';

/**
 * Intro en pâte et accueil (spec `2026-10-10-countrizz-intro-pate-accueil-design.md` §9). Sous SwiftShader l'intro ne tient
 * pas le temps réel : les parcours passent par « Passer » ; les images figées passent par `?introT=` (crochets e2e).
 */
test.slow(true, 'SwiftShader : la Terre en pâte et le globe se dessinent lentement');
test.use({ viewport: { width: 390, height: 844 } });

const credit = (page: Page) => page.getByRole('contentinfo', { name: 'Crédits de l’imagerie' });
const passer = (page: Page) => page.getByRole('button', { name: /Passer|Skip/ });

test('l’intro mène à l’accueil ; « Passer » la saute ; « Jouer » ouvre la démo', async ({ page }) => {
  await page.goto('/?webgl');
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 120_000 });
  await passer(page).click();
  await expect(page.locator('.accueil-titre')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 }); // globe prêt, fondu fini
  await expect(page.getByRole('link', { name: /Jouer|Play/ })).toHaveAttribute('href', '/demo.html');
  await expect(credit(page)).toBeVisible();
});

test('sans les textures de la pâte, accueil direct sur le globe', async ({ page }) => {
  // les textures seules (en dev, src/intro/ sert aussi le code de l'intro)
  await page.route(/\/intro\/[^/]+\.(jpg|json)$/, (r) => r.abort());
  await page.goto('/?webgl');
  await expect(page.locator('.accueil-titre')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
});

test('globe lent : l’accueil se monte sur la pâte et le fondu attend le globe', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/textures/day-*.ktx2', async (route) => { await gate; await route.continue(); });
  await page.goto('/?webgl');
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 120_000 });
  await passer(page).click();
  await expect(page.locator('.accueil-titre')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  await expect(page.locator('.intro')).toHaveCount(1); // la pâte reste sous l'accueil
  release();
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
});

test('image figée à 5 s : la Terre en pâte est dessinée au centre', async ({ page }) => {
  await page.goto('/?webgl&introT=5');
  await page.waitForFunction(() => window.__intro?.ready === true && window.__intro.frames > 2, null, { timeout: 120_000 });
  const png = PNG.sync.read(await page.screenshot());
  const i = (Math.floor((470 / 844) * png.height) * png.width + Math.floor(png.width / 2)) * 4;
  const [r, g, b] = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
  // le fond de l'intro est #16173a (22, 23, 58) : au centre du disque, il y a de la pâte
  expect(Math.abs(r - 22) + Math.abs(g - 23) + Math.abs(b - 58)).toBeGreaterThan(60);
});

test('globe en échec : le fondu part quand même et « Réessayer » se voit (revue du 10/10)', async ({ page }) => {
  await page.route('**/data/borders.json', (r) => r.abort());
  await page.goto('/?webgl');
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 120_000 });
  await passer(page).click();
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible({ timeout: 60_000 });
});

test('« Passer » pendant que la pâte se charge : accueil tout de suite (revue du 10/10)', async ({ page }) => {
  await page.route(/\/intro\/monde\.jpg$/, () => { /* jamais servi : la pâte ne vient pas */ });
  await page.goto('/?webgl');
  await expect(passer(page)).toBeVisible({ timeout: 30_000 });
  await passer(page).click();
  await expect(page.locator('.accueil-titre')).toBeVisible({ timeout: 5_000 });
});
