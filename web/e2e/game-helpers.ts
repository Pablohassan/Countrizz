import { expect, type Page } from '@playwright/test';

export const credit = (page: Page) => page.getByRole('contentinfo', { name: 'Crédits de l’imagerie' });
export const gameState = (page: Page) => page.evaluate(() => window.__game!.state);

/** Accueil direct (manifeste des vidéos refusé : l'intro s'efface), globe prêt, « Jouer » actif. */
export async function openHome(page: Page, query = '') {
  await page.route('**/video/videos.json', (r) => r.abort());
  await page.goto(`/?webgl${query}`);
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 180_000 });
  await expect(page.getByRole('button', { name: /^(Jouer|Play)/ })).toBeEnabled({ timeout: 180_000 });
}

/** De l'accueil au 3-2-1 dans le mode dont le bouton porte ce texte. */
export async function startGame(page: Page, mode: RegExp) {
  await page.getByRole('button', { name: /^(Jouer|Play)/ }).click();
  await expect(page.locator('.mode-bouton')).toHaveCount(3);
  await page.locator('.mode-bouton', { hasText: mode }).click();
}

/** Attend la question suivante (ou la fin), répond juste (`ok`) ou faux et attend la révélation ; `false` : partie finie. */
export async function answer(page: Page, ok: boolean): Promise<boolean> {
  await page.waitForFunction(() => ['question', 'end'].includes(window.__game?.state.screen ?? ''), null, { timeout: 120_000 });
  const s = await gameState(page);
  if (s.screen !== 'question') return false;
  const i = ok ? s.question!.answer : (s.question!.answer + 1) % 4;
  // le chrono peut atteindre zéro entre la lecture de l'état et le clic : la grille disparaît, la partie est finie
  try { await page.locator('.reponse, .reponse-drapeau').nth(i).click({ timeout: 10_000 }); } catch (e) {
    if ((await gameState(page)).screen === 'question') throw e;
    return false;
  }
  await page.waitForFunction(() => window.__game?.state.screen !== 'question', null, { timeout: 30_000 });
  return true;
}
