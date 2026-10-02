import { expect, test } from '@playwright/test';

// Sans les options WebGPU de la configuration et avec WebGL coupé, ni l'un ni l'autre n'est disponible.
test.use({ launchOptions: { args: ['--disable-webgl'] } });

test('sans WebGL ni WebGPU : « navigateur non compatible »', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Ton navigateur ne peut pas afficher le globe')).toBeVisible({ timeout: 30_000 });
});
