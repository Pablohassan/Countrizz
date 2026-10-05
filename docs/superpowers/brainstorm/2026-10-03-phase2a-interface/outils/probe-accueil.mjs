// Captures de la page de sonde (lecture seule) pour les maquettes de la révélation.
import { createRequire } from 'node:module';
const require = createRequire('/Users/rusmirsadikovic/projetsperso/countriz/countrizz/web/package.json');
const { chromium } = require('@playwright/test');
const OUT = process.argv[2];
const ARGS = ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader'];
const SHOTS = [
  ['acc-22', 'at=10,25&alt=2.2&clouds=1'],
  ['acc-46', 'at=10,25&alt=4.6&clouds=1'],
  ['acc-09', 'at=10,10&alt=0.9&clouds=1'],
];
const b = await chromium.launch({ args: ARGS });
for (const [name, st] of SHOTS) {
  const p = await b.newPage({ viewport: { width: 780, height: 1688 } });
  p.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
  await p.goto(`http://localhost:5180/probe.html?mode=game&w=780&h=1688&borders&post&${st}`);
  await p.waitForFunction(() => window.__probe !== undefined, null, { timeout: 180_000 });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${OUT}/${name}.png` });
  console.log('ok', name);
  await p.close();
}
await b.close();
