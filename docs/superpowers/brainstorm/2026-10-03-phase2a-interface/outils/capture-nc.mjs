// Captures du globe réel (page de démo) pour servir de fond aux maquettes du compagnon visuel. Lecture seule.
import { createRequire } from 'node:module';
const require = createRequire('/Users/rusmirsadikovic/projetsperso/countriz/countrizz/web/package.json');
const { chromium } = require('@playwright/test');

const OUT = process.argv[2];
const BASE = 'http://localhost:5180';
const ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader'];
const HIDE = 'div:has(> button), footer[role=contentinfo] { display: none !important; }';

const browser = await chromium.launch({ args: ARGS });
const shots = [];

async function run(name, viewport, dpr, country) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: name.includes('tel'), isMobile: name.includes('tel') });
  const page = await ctx.newPage();
  await page.addInitScript(() => { const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms === 700 ? 600000 : ms, ...a); });
  page.on('pageerror', (e) => console.log(`[${name}] pageerror`, e.message));
  const url = country ? `${BASE}/?demo=${country}` : `${BASE}/`;
  await page.goto(url);
  await page.addStyleTag({ content: HIDE });
  if (!country) {
    await page.waitForFunction(() => window.__demo !== undefined, null, { timeout: 120_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/${name}-accueil.png` });
    shots.push(`${name}-accueil.png`);
  } else {
    await page.waitForFunction((c) => window.__demo?.arrived.includes(c), country, { timeout: 120_000 });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/${name}-q-${country}.png` });
    shots.push(`${name}-q-${country}.png`);
    
  }
  await ctx.close();
}

await run('nc-telpaysage', { width: 844, height: 390 }, 2, 'FRA');
await run('nc-bureau', { width: 1440, height: 900 }, 1, 'FRA');
await run('nc-tel', { width: 390, height: 844 }, 2, 'FRA');
await browser.close();
console.log(JSON.stringify(shots));
