import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 960, height: 600 } });

// Un re-rendu du parent (ici : changer de pays dans la démo) ne doit ni reconstruire le globe ni recharger ses textures.
test('changer de pays ne recharge pas les textures globales', async ({ page }) => {
  let globalTextures = 0;
  page.on('request', (r) => { if (/\/textures\/(day|night|surface)-/.test(r.url())) globalTextures++; });
  await page.goto('/?webgl');
  const next = page.getByRole('button', { name: 'Pays suivant' });
  await expect(next).toBeEnabled({ timeout: 120_000 });
  await page.waitForTimeout(500);
  const atLoad = globalTextures;
  for (let i = 0; i < 3; i++) {
    await next.click();
    await page.waitForTimeout(1500);
  }
  console.log('requêtes de textures globales : au chargement', atLoad, 'après 3 pays', globalTextures);
  expect(globalTextures).toBe(atLoad);
});
