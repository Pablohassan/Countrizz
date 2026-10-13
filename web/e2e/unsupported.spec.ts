import { expect, test } from '@playwright/test';

// Sans les options WebGPU de la configuration et avec WebGL coupé, ni l'un ni l'autre n'est disponible.
test.use({ launchOptions: { args: ['--disable-webgl'] } });

test('sans WebGL ni WebGPU : « navigateur non compatible »', async ({ page }) => {
  await page.goto('/demo.html');
  await expect(page.getByText('Ton navigateur ne peut pas afficher le globe')).toBeVisible({ timeout: 30_000 });
});

test.describe('accueil en français', () => {
  test.use({ locale: 'fr-FR' });   // l'accueil suit la langue du navigateur (la démo, elle, parle toujours français)
  test('accueil sans WebGL ni WebGPU : « Oh non ! », sans bouton', async ({ page }) => {
    await page.route('**/video/videos.json', (r) => r.abort());
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Oh non !' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Ton navigateur ne peut pas afficher le globe')).toBeVisible();
    await expect(page.locator('.erreur button')).toHaveCount(0);
  });
});
