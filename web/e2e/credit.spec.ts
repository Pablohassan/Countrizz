import { expect, test } from '@playwright/test';

// Spec §9 : l'attribution EOX est visible dans l'interface de la carte, mot pour mot, avec un lien vers la source.
const ATTRIBUTION = 'EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)';

test('le crédit de l’imagerie est visible dans la vue du globe, mot pour mot', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?webgl');
  const credit = page.getByRole('contentinfo', { name: 'Crédits de l’imagerie' });
  await expect(credit).toBeVisible({ timeout: 120_000 });
  await expect(credit).toContainText(ATTRIBUTION);
  await expect(credit.getByRole('link', { name: 'https://cloudless.eox.at' })).toHaveAttribute('href', 'https://cloudless.eox.at');
  const box = (await credit.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390); // tient dans un écran de téléphone
});
