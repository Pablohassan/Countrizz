import { expect, test, type Page } from '@playwright/test';

/**
 * Intro en pâte et accueil (spec `2026-10-10-countrizz-intro-pate-accueil-design.md` §9). Sous SwiftShader l'intro ne tient
 * pas le temps réel : les parcours passent par « Passer » ; les images figées passent par `?introT=` (crochets e2e).
 */
test.slow(true, 'SwiftShader : la Terre en pâte et le globe se dessinent lentement');
test.use({ viewport: { width: 390, height: 844 } });

const credit = (page: Page) => page.getByRole('contentinfo', { name: 'Crédits de l’imagerie' });
const passer = (page: Page) => page.getByRole('button', { name: /Passer|Skip/ });
/**
 * Une passe de scène par trame de three (skill threejs-r186-webgpu-tsl, règle 3) : un second rendu dans la même trame montre
 * une image périmée. Le globe compte ces rendus ; après quelques images rendues, il n'y en a aucun.
 */
async function expectNoStaleFrame(page: Page) {
  await page.waitForFunction(() => (window.__globe?.frames ?? 0) > 5, null, { timeout: 60_000 });
  expect(await page.evaluate(() => window.__globe?.staleFrames)).toBe(0);
}

test('l’intro mène à l’accueil ; « Passer » la saute ; « Jouer » ouvre la démo', async ({ page }) => {
  await page.goto('/?webgl');
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 120_000 });
  await passer(page).click();
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 }); // globe prêt, fondu fini
  await expect(page.getByRole('link', { name: /Jouer|Play/ })).toHaveAttribute('href', '/demo.html');
  await expect(credit(page)).toBeVisible();
  await expectNoStaleFrame(page);
});

test('sans les textures de la pâte, accueil direct sur le globe', async ({ page }) => {
  // les textures seules (en dev, src/intro/ sert aussi le code de l'intro)
  await page.route(/\/intro\/[^/]+\.(jpg|json)$/, (r) => r.abort());
  await page.goto('/?webgl');
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
});

test('globe lent : l’accueil se monte sur la pâte et le fondu attend le globe', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  await page.route('**/textures/day-*.ktx2', async (route) => { await gate; await route.continue(); });
  await page.goto('/?webgl');
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 120_000 });
  await passer(page).click();
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  await expect(page.locator('.intro')).toHaveCount(1); // la pâte reste sous l'accueil
  release();
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  await expectNoStaleFrame(page); // l'image de préchauffage (globe inactif) compte aussi
});

test('globe en échec : le fondu part quand même et « Réessayer » se voit (revue du 10/10)', async ({ page }) => {
  await page.route('**/data/borders.json', (r) => r.abort());
  await page.goto('/?webgl');
  await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 120_000 });
  await passer(page).click();
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: /Réessayer|Try again/ })).toBeVisible({ timeout: 60_000 });
});

test('« Passer » pendant que la pâte se charge : accueil tout de suite (revue du 10/10)', async ({ page }) => {
  await page.route(/\/intro\/monde\.jpg$/, () => { /* jamais servi : la pâte ne vient pas */ });
  await page.goto('/?webgl');
  await expect(passer(page)).toBeVisible({ timeout: 30_000 });
  await passer(page).click();
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible({ timeout: 5_000 });
});
