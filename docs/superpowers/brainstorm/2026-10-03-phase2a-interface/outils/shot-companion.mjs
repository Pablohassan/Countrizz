import { createRequire } from 'node:module';
const require = createRequire('/Users/rusmirsadikovic/projetsperso/countriz/countrizz/web/package.json');
const { chromium } = require('@playwright/test');
const [url, out, w, h] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(w || 1400), height: Number(h || 1000) } });
await p.goto(url); await p.waitForTimeout(1500);
await p.screenshot({ path: out, fullPage: true });
await b.close();
