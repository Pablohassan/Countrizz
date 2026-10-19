import { test } from '@playwright/test';

/**
 * Captures avant / après du zoom (spec zoom §8), pour le regard de l'utilisateur : sautées sans `CAPTURES` (dossier de
 * sortie). Téléphone en portrait, vraies photos (aucune route), arrivée puis 800 ms (fondu de la première photo).
 * « Avant » : sur le site déployé ; « après » : `npm run e2e:local`.
 */
const OUT = process.env.CAPTURES;
test.skip(!OUT, 'captures : CAPTURES=<dossier> seulement');
test.slow(true, 'SwiftShader : vols jusqu’à 6 s et photos 2048');
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

for (const cca3 of ['RUS', 'FRA', 'MCO', 'VAT']) {
  test(`capture à l’arrivée : ${cca3}`, async ({ page }) => {
    await page.goto(`/demo.html?demo=${cca3}`);
    await page.waitForFunction((c) => window.__demo?.arrived.includes(c) === true, cca3, { timeout: 180_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/zoom-${cca3}.png` });
  });
}

test('plongée vers le Vatican : horloge de la page tenue, une capture tous les 400 ms de vol', async ({ page }) => {
  // l'horloge de la page (rAF, performance.now, minuteries) avance à la main : chaque capture prend son temps sous
  // SwiftShader sans que le vol avance pendant ce temps
  const t0 = new Date('2026-10-19T12:00:00Z');
  await page.clock.install({ time: t0 });
  await page.clock.pauseAt(new Date(t0.getTime() + 1000));
  await page.goto('/demo.html?demo=VAT');
  for (let k = 0; k < 2000 && !(await page.evaluate(() => (window.__globe?.frames ?? 0) > 0)); k++) {
    await page.clock.runFor(16);
    await page.waitForTimeout(30);
  }
  const log: string[] = [];
  for (let i = 0; i < 30; i++) {
    const done = await page.evaluate(() => window.__demo?.arrived.includes('VAT') === true);
    // laisser arriver les photos (réseau et transcodage, en temps réel) avant de figer l'image
    await page.waitForTimeout(400);
    await page.clock.runFor(16);
    await page.screenshot({ path: `${OUT}/plongee-VAT-${String(i).padStart(2, '0')}.png` });
    const slots = await page.evaluate(() => window.__globe?.imageSlots?.() ?? null);   // absent avant la 1.9
    log.push(`${i}\t${(i * 0.4).toFixed(1)} s\t${JSON.stringify(slots)}`);
    if (done) break;
    await page.clock.runFor(400);
  }
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`${OUT}/plongee-VAT.txt`, log.join('\n'));
});
