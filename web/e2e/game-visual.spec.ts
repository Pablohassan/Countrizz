import { expect, test, type Page } from '@playwright/test';
import { answer, openHome } from './game-helpers';

/**
 * Captures des écrans du jeu pour le regard de l'utilisateur (`CAPTURES=1 npm run e2e:local -- e2e/game-visual.spec.ts`,
 * dans `test-results/captures-jeu/`), globe compris, tirages fixés par `?graine=`. Les références `-darwin` prévues
 * (spec 2A §11) sont différées : sous SwiftShader, deux captures identiques de suite ne viennent pas sur le globe.
 */
test.slow(true, 'SwiftShader : vols et globe lents');
test.use({ locale: 'fr-FR' });

test.skip(!process.env.CAPTURES, 'captures pour l’utilisateur, à la demande : CAPTURES=1');

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/captures-jeu/jeu-${name}.png`, animations: 'disabled', timeout: 60_000 });

/** La révélation dure 1,5 s, une capture sous SwiftShader en prend 5 : son minuteur est retenu (la partie s'y arrête). */
const holdReveal = (page: Page) => page.evaluate((ms) => {
  const st = window.setTimeout;
  window.setTimeout = ((fn: TimerHandler, delay?: number, ...a: unknown[]) => (delay === ms ? 0 : st(fn, delay, ...a))) as typeof setTimeout;
}, 1500);

const TELEPHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const CADRAGES = [['telephone', TELEPHONE], ['bureau', { viewport: { width: 1440, height: 900 } }]] as const;

for (const [cadrage, options] of CADRAGES) {
  test.describe(cadrage, () => {
    test.use(options);

    test(`mode, questions et révélation (${cadrage})`, async ({ page }) => {
      await openHome(page, '&graine=42');
      await page.getByRole('button', { name: /^(Jouer|Play)/ }).click();
      await shot(page, `mode-${cadrage}`);
      await page.locator('.mode-bouton', { hasText: /Drapeau/ }).click();
      await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
      await shot(page, `question-drapeau-${cadrage}`);
      await page.getByRole('button', { name: 'Quitter' }).click();
      await page.getByRole('button', { name: /^(Jouer|Play)/ }).click();
      await page.locator('.mode-bouton', { hasText: /Pays/ }).click();
      await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
      await shot(page, `question-pays-${cadrage}`);
      await holdReveal(page);
      await answer(page, false);
      await expect(page.locator('.etiquette')).toBeVisible();
      await shot(page, `revelation-pays-${cadrage}`);
    });

    test(`fin, scores, À propos (${cadrage})`, async ({ page }) => {
      await openHome(page, '&partie=20000&graine=42');
      await page.getByRole('button', { name: /^(Jouer|Play)/ }).click();
      await page.locator('.mode-bouton', { hasText: /Capitale/ }).click();
      for (let i = 0; await answer(page, i % 3 !== 2); i++);   // une erreur toutes les trois manches, jusqu'à la fin du chrono
      await expect(page.getByRole('heading', { name: 'Temps écoulé !' })).toBeVisible({ timeout: 120_000 });
      await shot(page, `fin-${cadrage}`);
      await page.getByRole('button', { name: 'Scores' }).click();
      await shot(page, `scores-${cadrage}`);
      await page.getByRole('button', { name: '‹ Retour' }).click();
      await page.getByRole('button', { name: 'Changer de mode' }).click();
      await page.getByRole('button', { name: '‹ Retour' }).click();
      await page.getByRole('button', { name: 'À propos' }).click();
      await shot(page, `apropos-${cadrage}`);
    });
  });
}

test.describe('téléphone, erreur', () => {
  test.use(TELEPHONE);
  test('erreur de chargement', async ({ page }) => {
    await page.route('**/data/borders.json', (r) => r.abort());
    await page.route('**/video/videos.json', (r) => r.abort());
    await page.goto('/?webgl');
    await expect(page.getByRole('heading', { name: 'Oups !' })).toBeVisible({ timeout: 180_000 });
    await shot(page, 'erreur-telephone');
  });
});

test.describe('téléphone en paysage', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  test('« Tourne ton téléphone »', async ({ page }) => {
    await page.route('**/video/videos.json', (r) => r.abort());
    await page.goto('/?webgl');
    await expect(page.getByRole('heading', { name: 'Tourne ton téléphone' })).toBeVisible({ timeout: 60_000 });
    await shot(page, 'tourne');
  });
});
