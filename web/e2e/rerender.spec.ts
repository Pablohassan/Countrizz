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

// Le Canvas (clé = génération du renderer) et le voile de coupe (clé = nombre de coupes) sont frères : leurs clés ne
// doivent pas se confondre (React : « Encountered two children with the same key »).
test('aucune erreur React au chargement du globe', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/?webgl');
  await expect(page.getByRole('button', { name: 'Pays suivant' })).toBeEnabled({ timeout: 120_000 });
  console.log('erreurs console', JSON.stringify(errors));
  expect(errors.filter((e) => e.includes('same key'))).toEqual([]);
});
