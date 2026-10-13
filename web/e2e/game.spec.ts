import { expect, test, type Page } from '@playwright/test';
import { answer, credit, gameState, openHome, startGame } from './game-helpers';

/**
 * Le jeu de bout en bout (spec 2A §2-3, §11) : parcours, Quitter, double tape, onglet caché, stockage bloqué. Parties
 * courtes et rejouables par les crochets des e2e (`?partie=`, `?graine=`, `window.__game` ; plan 2A-5, décision 5).
 */
test.slow(true, 'SwiftShader : vols et globe lents');
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, locale: 'fr-FR' });

test('partie complète en mode Pays, téléphone, français : 3-2-1, questions, révélation, fin, scores', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await openHome(page, '&partie=20000&graine=42');   // 20 s nettes : sous SwiftShader, un clic attend plusieurs images du globe
  await startGame(page, /Pays/);
  await expect(page.locator('.decompte-n')).toHaveText('3');
  await expect(page.locator('.hud-sec--pause')).toContainText('❚❚');
  await expect(credit(page)).toBeVisible();
  expect(await answer(page, true)).toBe(true);
  await expect(page.locator('.reponse--ok')).toHaveCount(1);
  await expect(page.locator('.hud-plus')).toBeVisible();
  await expect(page.locator('p.sr')).toContainText('Bonne réponse');
  await expect(page.locator('.etiquette')).toBeVisible();
  expect(await answer(page, false)).toBe(true);
  await expect(page.locator('.reponse--ko')).toHaveCount(1);
  await expect(page.locator('p.sr')).toContainText('Raté');
  for (let i = 0; i < 40 && (await answer(page, i % 2 === 0)); i++);
  await expect(page.getByRole('heading', { name: 'Temps écoulé !' })).toBeVisible({ timeout: 60_000 });
  const s = await gameState(page);
  await expect(page.locator('.fin-score')).toHaveText(String(s.tally.score));
  await expect(page.locator('.fin-tampon')).toHaveText('Nouveau record !');
  await expect(page.locator('.fin-escale')).toHaveCount(s.tally.rounds.length);
  await page.getByRole('button', { name: 'Scores' }).click();
  await expect(page.locator('.scores-ligne--toi')).toContainText('· toi');
  await expect(page.getByRole('tab', { name: 'Pays' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '‹ Retour' }).click();
  await page.getByRole('button', { name: 'Changer de mode' }).click();
  await expect(page.locator('.mode-bouton')).toHaveCount(3);
  await page.getByRole('button', { name: '‹ Retour' }).click();
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible();
  expect(errors).toEqual([]);
});

test('quitter pendant le 3-2-1 : retour à l’accueil, le vol abandonné n’amène aucune question', async ({ page }) => {
  await openHome(page, '&graine=7');
  await startGame(page, /Drapeau/);
  await expect(page.locator('.decompte-n')).toBeVisible();
  await page.getByRole('button', { name: 'Quitter' }).click();
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible();
  await page.waitForTimeout(5_000);
  await expect(page.locator('.jeu')).toHaveCount(0);
  expect((await gameState(page)).screen).toBe('home');
});

test('double tape : une seule manche comptée, une seule réponse choisie', async ({ page }) => {
  await openHome(page, '&graine=11');
  await startGame(page, /Capitale/);
  await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
  await page.evaluate(() => { const b = document.querySelectorAll<HTMLButtonElement>('.reponse'); b[0]!.click(); b[1]!.click(); });
  await page.waitForFunction(() => window.__game?.state.screen === 'reveal');
  const s = await gameState(page);
  expect(s.tally.rounds).toHaveLength(1);
  expect(s.picked).toBe(0);
  await expect(page.locator('.reponse--ok, .reponse--ko')).toHaveCount(s.question!.answer === 0 ? 1 : 2);
});

test('onglet caché pendant un vol : chrono figé, puis la manche suivante arrive', async ({ page }) => {
  await openHome(page, '&graine=5');
  await startGame(page, /Pays/);
  await answer(page, true);
  await page.waitForFunction(() => window.__game?.state.screen === 'flight', null, { timeout: 30_000 });
  const hide = (h: boolean) => page.evaluate((v) => {
    Object.defineProperty(document, 'hidden', { value: v, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, h);
  await hide(true);
  // l'état passe par un rendu de React avant d'arriver dans window.__game
  await page.waitForFunction(() => window.__game?.state.clock.reasons.includes('hidden') === true);
  const before = await gameState(page);
  await page.waitForTimeout(2_000);
  expect((await gameState(page)).clock.usedMs).toBe(before.clock.usedMs);
  await hide(false);
  await page.waitForFunction(() => window.__game?.state.clock.reasons.includes('hidden') === false);
  await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
});

test('stockage bloqué : la fin le dit, les scores gardent la partie le temps de la visite', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('bloqué', 'SecurityError'); }; });
  await openHome(page, '&partie=1500&graine=3');
  await startGame(page, /Pays/);
  while (await answer(page, true));
  await expect(page.getByText('Ton score ne peut pas être gardé sur cet appareil')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Scores' }).click();
  await expect(page.locator('.scores-ligne--toi')).toBeVisible();
});

test('À propos : partager (lien copié), GitHub, vibrations mémorisées, mentions et licences', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openHome(page);
  await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
  await page.getByRole('button', { name: 'À propos' }).click();
  await expect(page.getByRole('heading', { name: 'À propos' })).toBeVisible();
  await page.getByRole('button', { name: 'Partager le jeu' }).click();
  await expect(page.getByText('Lien copié !')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://countrizz.fr');
  await expect(page.getByRole('link', { name: 'github.com/Pablohassan' })).toHaveAttribute('href', 'https://github.com/Pablohassan');
  const vib = page.getByRole('switch', { name: 'Vibrations' });
  await expect(vib).toBeChecked();
  await vib.uncheck();
  expect(await page.evaluate(() => localStorage.getItem('countrizz:vibrations'))).toBe('0');
  await page.getByRole('button', { name: 'Mentions et licences' }).click();
  const panneau = page.locator('.mentions-panneau');   // le crédit permanent du globe porte le même texte
  await expect(panneau.getByText('EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH')).toBeVisible();
  await expect(panneau.getByText('ODbL 1.0')).toBeVisible();
  await page.getByRole('button', { name: '‹ Retour' }).click();
  await page.getByRole('button', { name: '‹ Retour' }).click();
  await expect(page.locator('.accueil .accueil-titre')).toBeVisible();
});

test('globe en échec : « Oups ! », Réessayer remonte le globe ; une partie en cours est quittée', async ({ page }) => {
  let block = true;
  await page.route('**/data/borders.json', (r) => (block ? r.abort() : r.continue()));
  await page.route('**/video/videos.json', (r) => r.abort());
  await page.goto('/?webgl');
  await expect(page.getByRole('heading', { name: 'Oups !' })).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText('Le globe n’a pas pu se charger')).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Jouer|Play)/ })).toBeDisabled();
  block = false;
  await page.getByRole('button', { name: 'Réessayer' }).click();
  await expect(page.getByRole('heading', { name: 'Oups !' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Jouer|Play)/ })).toBeEnabled({ timeout: 180_000 });
});

test('perte du GPU recréée : la partie continue ; recréation ratée : partie quittée et « Oups ! »', async ({ page }) => {
  await openHome(page, '&graine=9');
  await startGame(page, /Pays/);
  await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
  await page.evaluate(() => window.__globe!.simulateDeviceLost());
  await page.waitForFunction(() => (window.__globe?.generation ?? 0) > 0, null, { timeout: 60_000 });
  expect((await gameState(page)).screen).not.toBe('home');
  await page.evaluate(() => { window.__globe!.failNextRenderer = true; window.__globe!.simulateDeviceLost(); });
  await expect(page.getByRole('heading', { name: 'Oups !' })).toBeVisible({ timeout: 60_000 });
  expect((await gameState(page)).screen).toBe('home');
});

test.describe('téléphone en paysage', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  test('« Tourne ton téléphone » ; en partie, le chrono s’arrête et repart en portrait', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openHome(page, '&graine=4');
    await startGame(page, /Pays/);
    await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole('heading', { name: 'Tourne ton téléphone' })).toBeVisible();
    await expect(page.getByText('❚❚ Partie en pause')).toBeVisible();
    expect((await gameState(page)).clock.reasons).toContain('rotate');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { name: 'Tourne ton téléphone' })).toHaveCount(0);
    expect((await gameState(page)).clock.reasons).not.toContain('rotate');
  });
});

/** Le crédit EOX n'est recouvert par rien (spec §11) : trois points de sa ligne rendent le crédit lui-même. */
async function creditFree(page: Page, where: string) {
  const b = (await credit(page).boundingBox())!;
  const free = await page.evaluate(({ x, y, w, h }) => [[x + 3, y + h / 2], [x + w / 2, y + h / 2], [x + w - 3, y + h / 2]]
    .every(([px, py]) => !!document.elementFromPoint(px!, py!)?.closest('footer[role="contentinfo"]')), { x: b.x, y: b.y, w: b.width, h: b.height });
  expect(free, where).toBe(true);
}

test('crédit EOX jamais recouvert : accueil, mode, 3-2-1, question, révélation, fin, scores, À propos', async ({ page }) => {
  await openHome(page, '&partie=20000&graine=8');   // le temps de relever chaque écran ; la 2e question, sans réponse, finit la partie
  await creditFree(page, 'accueil');
  await page.getByRole('button', { name: /^(Jouer|Play)/ }).click();
  await creditFree(page, 'mode');
  await page.locator('.mode-bouton', { hasText: /Pays/ }).click();
  await expect(page.locator('.decompte-n')).toBeVisible();
  await creditFree(page, '3-2-1');
  await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
  await creditFree(page, 'question');
  await answer(page, true);
  await creditFree(page, 'révélation');
  await expect(page.getByRole('heading', { name: 'Temps écoulé !' })).toBeVisible({ timeout: 120_000 });
  await creditFree(page, 'fin');
  await page.getByRole('button', { name: 'Scores' }).click();
  await creditFree(page, 'scores');
  await page.getByRole('button', { name: '‹ Retour' }).click();
  await page.getByRole('button', { name: 'Changer de mode' }).click();
  await page.getByRole('button', { name: '‹ Retour' }).click();
  await page.getByRole('button', { name: 'À propos' }).click();
  await creditFree(page, 'À propos');
});

test('360 × 640 : rien ne déborde, la grille reste au-dessus du crédit', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openHome(page, '&graine=21');
  await startGame(page, /Pays/);
  await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const grille = (await page.locator('.reponses').boundingBox())!;
  const c = (await credit(page).boundingBox())!;
  expect(grille.y + grille.height).toBeLessThanOrEqual(c.y);
});

test.describe('bureau, anglais, clavier', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false });
  test('touches 1-4 rappelées sur les boutons ; on répond au clavier', async ({ page }) => {
    await openHome(page, '&graine=13');
    await page.getByRole('button', { name: 'EN' }).click();
    await startGame(page, /Country/);
    await page.waitForFunction(() => window.__game?.state.screen === 'question', null, { timeout: 120_000 });
    await expect(page.getByRole('heading', { name: 'Which country is this?' })).toBeVisible();
    await expect(page.locator('.reponse-touche').first()).toBeVisible();
    const s = await gameState(page);
    await page.keyboard.press(`Digit${s.question!.answer + 1}`);
    await page.waitForFunction(() => window.__game?.state.screen === 'reveal');
    await expect(page.locator('.reponse--ok')).toHaveCount(1);
    await expect(page.locator('p.sr')).toContainText('Right:');
  });

  test('partie complète en anglais, au clavier, mode Capital', async ({ page }) => {
    await openHome(page, '&partie=1500&graine=17');
    await page.getByRole('button', { name: 'EN' }).click();
    await startGame(page, /Capital/);
    for (;;) {
      await page.waitForFunction(() => ['question', 'end'].includes(window.__game?.state.screen ?? ''), null, { timeout: 120_000 });
      const s = await gameState(page);
      if (s.screen === 'end') break;
      await page.keyboard.press(`Digit${s.question!.answer + 1}`);
      await page.waitForFunction(() => window.__game?.state.screen !== 'question', null, { timeout: 30_000 });
    }
    await expect(page.getByRole('heading', { name: 'Time’s up!' })).toBeVisible();
    expect((await gameState(page)).tally.rounds.length).toBeGreaterThan(0);   // le clavier a bien répondu
  });
});

for (const [mode, label] of [['drapeau', /Drapeau/], ['capitale', /Capitale/]] as const) {
  test(`partie complète en mode ${mode} (téléphone, français)`, async ({ page }) => {
    await openHome(page, `&partie=1500&graine=${mode.length}`);
    await startGame(page, label);
    while (await answer(page, true));
    await expect(page.getByRole('heading', { name: 'Temps écoulé !' })).toBeVisible({ timeout: 120_000 });
  });
}

test.describe('haptique, par espion', () => {
  test.use({ isMobile: true, hasTouch: true });
  test('3-2-1, appui, mauvaise réponse : les motifs du prototype', async ({ page }) => {
    await page.addInitScript(() => {
      const seen: number[][] = [];
      (window as unknown as { __vib: number[][] }).__vib = seen;
      Object.defineProperty(navigator, 'vibrate', { value: (p: number[]) => { seen.push([...p]); return true; }, configurable: true });
    });
    await openHome(page, '&graine=6');
    await startGame(page, /Pays/);
    await answer(page, false);
    const vib = await page.evaluate(() => (window as unknown as { __vib: number[][] }).__vib);
    expect(vib.slice(0, 4)).toEqual([[18], [18], [18], [45]]);
    expect(vib).toContainEqual([9]);
    expect(vib).toContainEqual([70, 25, 8, 2, 8, 2, 8, 2, 8, 25, 140]);
  });
});

test.describe('mouvement réduit', () => {
  test.use({ reducedMotion: 'reduce' });
  test('3-2-1 et tampon « Nouveau record ! » immobiles', async ({ page }) => {
    await openHome(page, '&partie=20000&graine=2');   // une bonne réponse le temps de cliquer, puis la question suivante finit la partie
    await startGame(page, /Pays/);
    await expect(page.locator('.decompte-n')).toBeVisible();
    expect(await page.locator('.decompte-n').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    expect(await answer(page, true)).toBe(true);
    await expect(page.locator('.fin-tampon')).toBeVisible({ timeout: 120_000 });
    expect(await page.locator('.fin-tampon').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  });
});
