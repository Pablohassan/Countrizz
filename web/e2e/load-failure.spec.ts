import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 960, height: 600 } });

// Une texture globale (ou borders.json) indisponible ne doit pas laisser l'application bloquée sans rien dire.
test('texture globale indisponible : message, puis « Réessayer » recharge le globe', async ({ page }) => {
  let failing = true;
  await page.route('**/textures/night-*.ktx2', (r) => (failing ? r.fulfill({ status: 503 }) : r.continue()));
  await page.goto('/?webgl');
  await expect(page.getByText('Le globe n’a pas pu se charger')).toBeVisible({ timeout: 120_000 });
  failing = false;
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByRole('button', { name: 'Pays suivant' })).toBeEnabled({ timeout: 120_000 });
  await expect(page.getByText('Le globe n’a pas pu se charger')).toHaveCount(0);
});
