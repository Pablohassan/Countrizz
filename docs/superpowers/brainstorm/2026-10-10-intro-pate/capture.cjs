// Capture d'images figées de l'intro v3 : node capture-v3.cjs <dossier web> <dossier sortie> t1 t2 ...
const { chromium } = require(process.argv[2] + '/node_modules/@playwright/test');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 390, height: 908 }, deviceScaleFactor: 2 });
  const logs = []; p.on('console', (m) => { if (m.type() !== 'log') logs.push(m.type() + ': ' + m.text()); }); p.on('pageerror', (e) => logs.push('ERREUR ' + e.message));
  for (const t of process.argv.slice(4)) {
    await p.goto('http://localhost:8766/intro-pate.html?t=' + t);
    await p.waitForFunction(() => window.__image >= 1, null, { timeout: 180000 });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.locator('#scene').screenshot({ path: process.argv[3] + '/t' + String(t).replace('.', '_') + '.png' });
    console.log('image', t);
  }
  console.log(logs.slice(0, 10).join('\n') || 'aucun avertissement');
  await b.close();
})();
