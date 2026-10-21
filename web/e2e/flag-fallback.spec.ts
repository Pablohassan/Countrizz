import { expect, test } from '@playwright/test';
import { answer, openHome, startGame } from './game-helpers';

/**
 * Drapeau introuvable (hors ligne, pays jamais vu ; plan 2A-6, décision 8) : l'autocollant porte le nom du pays, jamais
 * une case vide, et la manche se joue. Ici les drapeaux sont coupés au réseau ; la partie hors ligne complète est dans
 * pwa.spec.ts (service worker, version de production).
 */
test('drapeaux introuvables : le nom du pays sur chaque autocollant, la manche se joue', async ({ page }) => {
  test.setTimeout(240_000);
  await page.route('**/data/flags/**', (r) => r.abort());
  await openHome(page);
  await startGame(page, /Drapeau|Flag/);
  await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
  const stickers = page.locator('.reponse-drapeau-sans');
  await expect(stickers).toHaveCount(4);
  for (const t of await stickers.allTextContents()) expect(t.trim().length).toBeGreaterThan(1);
  await expect(page.locator('.reponse-drapeau img')).toHaveCount(0);
  expect(await answer(page, true)).toBe(true);
});
