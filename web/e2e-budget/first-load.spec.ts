import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import type { ImageryIndex } from '../src/data/imagery';

/** Octets transférés jusqu'à l'arrivée sur le premier pays (texte compté gzip, comme le servira nginx). */
export const FIRST_LOAD_BUDGET = { standard: 8_000_000 } as const;
const imagery = JSON.parse(readFileSync('public/data/imagery.json', 'utf8')) as ImageryIndex;

test('premier chargement au niveau « standard » (WebGL 2) : globe, données, premier pays', async ({ page }) => {
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
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?demo=FRA&webgl');
  await page.waitForFunction(() => window.__demo?.arrived.includes('FRA') === true, null, { timeout: 0 });
  await page.waitForLoadState('networkidle');
  page.off('response', onResponse); // ce qui arrive après le premier pays n'est pas du premier chargement
  await Promise.all(pending);
  rows.sort((a, b) => b.bytes - a.bytes);
  const total = rows.reduce((s, r) => s + r.bytes, 0);
  console.log(rows.map((r) => `${String(r.bytes).padStart(9)}  ${r.url}`).join('\n'));
  console.log(`total ${total} octets (budget ${FIRST_LOAD_BUDGET.standard})`);
  expect(total).toBeLessThanOrEqual(FIRST_LOAD_BUDGET.standard);
});
