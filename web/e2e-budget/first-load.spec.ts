import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import type { ImageryIndex } from '../src/data/imagery';

/**
 * Octets transférés (texte compté gzip, comme le servira nginx). Démo : jusqu'à l'arrivée sur le premier pays (spec 2A §11).
 * Accueil (spec intro §7, 10/10/2026) : l'intro prête ≤ 3 Mo, puis tout jusqu'à la fin du fondu ≤ 12 Mo en « standard ».
 */
export const FIRST_LOAD_BUDGET = { standard: 8_000_000, intro: 3_000_000, accueil: 12_000_000 } as const;
const imagery = JSON.parse(readFileSync('public/data/imagery.json', 'utf8')) as ImageryIndex;

function collect(page: import('@playwright/test').Page) {
  const rows: { url: string; bytes: number }[] = [];
  const pending: Promise<void>[] = []; // mesures asynchrones : toutes attendues avant le total
  const onResponse = (r: import('@playwright/test').Response) => { pending.push(measure(r)); };
  page.on('response', onResponse);
  const measure = async (r: import('@playwright/test').Response) => {
    if (r.url().startsWith('blob:') || r.url().startsWith('data:')) return; // workers du transcodeur : pas du réseau
    const url = new URL(r.url()).pathname;
    if (r.status() === 404 && /\/patches\/img\/(\w+)-(\d+)\.ktx2$/.test(url)) {
      // patchs image hors dépôt (absents en CI) : on compte la taille que donne l'index
      const [, id, size] = url.match(/\/patches\/img\/(\w+)-(\d+)\.ktx2$/)!;
      rows.push({ url: `${url} (index)`, bytes: imagery.countries[id!.toUpperCase()]!.files[size!]!.bytes });
      return;
    }
    if (r.status() >= 300) return;
    const type = r.headers()['content-type'] ?? '';
    const sent = (await r.request().sizes()).responseBodySize; // 0 si servi par le cache du navigateur
    if (sent === 0) return;
    const body = /javascript|json|html|css|wasm/.test(type) ? await r.body().catch(() => null) : null;
    rows.push({ url, bytes: body ? gzipSync(body, { level: 9 }).length : sent });
  };
  /** Somme, éventuellement restreinte (l'intro prête : sans les textures, données et transcodeur du globe, chargés en parallèle). */
  const sum = async (keep: (url: string) => boolean = () => true) => { await Promise.all(pending); return rows.filter((r) => keep(r.url)).reduce((s, r) => s + r.bytes, 0); };
  const stop = async () => { page.off('response', onResponse); await Promise.all(pending); };
  const report = (budget: number) => {
    rows.sort((a, b) => b.bytes - a.bytes);
    const total = rows.reduce((s, r) => s + r.bytes, 0);
    console.log(rows.map((r) => `${String(r.bytes).padStart(9)}  ${r.url}`).join('\n'));
    console.log(`total ${total} octets (budget ${budget})`);
    return total;
  };
  return { sum, stop, report };
}

test('premier chargement au niveau « standard » (WebGL 2) : globe, données, premier pays', async ({ page }) => {
  const m = collect(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo.html?demo=FRA&webgl');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 0 });
  await page.waitForLoadState('networkidle');
  await m.stop(); // ce qui arrive après le premier pays n'est pas du premier chargement
  expect(m.report(FIRST_LOAD_BUDGET.standard)).toBeLessThanOrEqual(FIRST_LOAD_BUDGET.standard);
});

for (const tier of ['standard', 'haute'] as const) {
  test(`accueil (${tier}) : l'intro prête ≤ 3 Mo, tout jusqu'à la fin du fondu`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('countrizz:e2e', '1')); // crochets window.__intro
    const m = collect(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(tier === 'standard' ? '/?webgl' : '/');
    await page.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 0 });
    const intro = await m.sum((u) => !/^\/(textures|basis|data)\//.test(u));
    console.log(`intro prête : ${intro} octets (budget ${FIRST_LOAD_BUDGET.intro})`);
    await page.getByRole('button', { name: /Passer|Skip/ }).click();
    await expect(page.locator('.intro')).toHaveCount(0, { timeout: 0 });
    await page.waitForLoadState('networkidle');
    await m.stop();
    const total = m.report(FIRST_LOAD_BUDGET.accueil);
    expect(intro).toBeLessThanOrEqual(FIRST_LOAD_BUDGET.intro);
    // « haute » : mesuré, pas encore borné (plafond à proposer à l'utilisateur sur ce chiffre)
    if (tier === 'standard') expect(total).toBeLessThanOrEqual(FIRST_LOAD_BUDGET.accueil);
  });
}
