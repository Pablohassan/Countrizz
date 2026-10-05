// Reprise après coupure : chaque banc se charge-t-il sans erreur, et rend-il l'avion ? (lecture seule)
import { createRequire } from 'node:module';
const require = createRequire('/Users/rusmirsadikovic/projetsperso/countriz/countrizz/web/package.json');
const { chromium } = require('@playwright/test');
const OUT = '/private/tmp/claude-501/-Users-rusmirsadikovic-projetsperso-countriz-countrizz/e34a42b7-ba8d-4856-b4cd-8f39e1367ba3/scratchpad/avion';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const k of ['papier', 'cartoon', 'origami']) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url()));
  await p.goto(`http://localhost:5199/h/avion-${k}.html?t=0.5`);
  let ready = true;
  try { await p.waitForSelector('canvas[data-ready]', { timeout: 60_000 }); } catch { ready = false; }
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/reprise-${k}.png` });
  console.log(k, '| prêt :', ready, '| erreurs :', errs.length ? errs.join(' ; ') : 'aucune');
  await p.close();
}
await b.close();
