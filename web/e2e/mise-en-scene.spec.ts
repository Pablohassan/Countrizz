import { expect, test } from '@playwright/test';
import { answer, gameState, openHome } from './game-helpers';

/**
 * Mise en scène des transitions (spec `2026-10-24-countrizz-mise-en-scene-design.md`, storyboard validé le 24/10) : le choix
 * du mode dans l'accueil, le vol à la place du 3-2-1, la grille qui reste en place entre deux questions, l'étiquette qui
 * part avec son pays, le retour des scores vers l'accueil déjà en place.
 */
test.slow(true, 'SwiftShader : vols et globe lents');
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'fr-FR' });

test('« Jouer » : les trois modes à la place des commandes, dans l’accueil ; titre, avion et repères restent ; « ‹ Retour » les referme', async ({ page }) => {
  await openHome(page);
  await page.waitForFunction(() => !!window.__plane?.look(), null, { timeout: 60_000 });
  await expect(page.locator('.reperes .mk')).toHaveCount(5);
  await page.getByRole('button', { name: /^(Jouer|Play)/ }).click();
  await expect(page.locator('.accueil.accueil--choix')).toHaveCount(1);
  await expect(page.locator('.accueil-modes .mode-bouton')).toHaveCount(3);
  for (const b of await page.locator('.accueil-modes .mode-bouton').all()) await expect(b).toBeVisible();
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible();
  await expect(page.locator('.reperes .mk')).toHaveCount(5);
  expect(await page.evaluate(() => !!window.__plane?.look())).toBe(true);
  expect((await gameState(page)).screen).toBe('mode');
  await page.getByRole('button', { name: '‹ Retour' }).click();
  await expect(page.locator('.accueil.accueil--choix')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Jouer|Play)/ })).toBeVisible();
});

test('partie : le vol tient lieu de 3-2-1, la grille monte à l’arrivée, puis reste estompée sans libellés pendant les vols ; l’étiquette part avec son pays', async ({ page }) => {
  await openHome(page, '&partie=20000&graine=42');
  await page.getByRole('button', { name: /^(Jouer|Play)/ }).click();
  // l'accueil sort (0,3 s) pendant que le vol part : il reste monté, en sortie, au lieu de disparaître d'un coup
  await page.evaluate(() => {
    const w = window as unknown as { __sortie: boolean };
    w.__sortie = false;
    // le même élément, resté monté (un accueil démonté puis remonté déjà effacé ne montre aucune sortie)
    const accueil = document.querySelector<HTMLElement>('.accueil')!;
    new MutationObserver(() => { if (accueil.isConnected && accueil.classList.contains('accueil--sortie')) w.__sortie = true; }).observe(accueil, { attributes: true });
  });
  await page.locator('.accueil-modes .mode-bouton', { hasText: /Pays/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __sortie: boolean }).__sortie)).toBe(true);
  await expect(page.locator('.accueil')).toHaveCount(0, { timeout: 10_000 });
  expect((await gameState(page)).screen).toBe('flight');
  await expect(page.locator('.decompte, .decompte-n')).toHaveCount(0);
  await expect(page.locator('.jeu-bas--cache')).toHaveCount(1);
  await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
  await expect(page.locator('.jeu-bas--monte')).toHaveCount(1);
  expect(await answer(page, true)).toBe(true);
  await page.waitForFunction(() => window.__game?.state.screen === 'flight', null, { timeout: 30_000 });
  await expect(page.locator('.jeu-bas--vol')).toHaveCount(1);
  expect(await page.locator('.jeu-bas--vol .reponse > span:not(.reponse-touche)').allTextContents()).toEqual([' ', ' ', ' ', ' ']);
  await expect(page.locator('.etiquette')).toHaveCount(1);
  await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
  await expect(page.locator('.jeu-bas--vol')).toHaveCount(0);
  await expect(page.locator('.etiquette')).toHaveCount(0);
});

test('scores → « ‹ Retour » : l’accueil, déjà en place (rien ne rejoue)', async ({ page }) => {
  await openHome(page);
  await page.getByRole('button', { name: 'Scores' }).click();
  await page.getByRole('button', { name: '‹ Retour' }).click();
  await expect(page.locator('.accueil.accueil--deja')).toHaveCount(1);
  expect((await gameState(page)).screen).toBe('home');
});
