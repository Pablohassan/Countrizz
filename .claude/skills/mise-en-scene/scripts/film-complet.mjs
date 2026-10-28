// Film de tout l'enchaînement de Countrizz au format Pixel 9 (412 × 915, densité 2,625, tactile), en WebGL (le canvas
// WebGPU n'apparaît pas à la capture sous macOS) : intro → fondu → accueil → Jouer → mode → 3-2-1 → questions → fin →
// scores → accueil. Chaque image affichée (screencast CDP) et un journal horodaté des changements d'écran ; puis une
// planche par passage (−0,6 s à +2,2 s) et un storyboard (une image toutes les 0,5 s).
// Le canvas du globe (WebGPU comme WebGL) n'apparaît à la capture qu'en rendu logiciel (SwiftShader, args des e2e) : densité
// 1, cadence basse ; chaque image montre la scène à son instant réel, les à-coups ne se mesurent PAS ici (perf : pacing).
// Usage : node film-complet.mjs <url> <dossier>   (serveur de dev : npm run dev -- --port 5174)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
const racine = execSync('git rev-parse --show-toplevel').toString().trim();
const require = createRequire(`${racine}/web/package.json`);
const { chromium } = require('@playwright/test');
const sharp = require('sharp');
const [base = 'http://localhost:5174/', out = new URL('./film/', import.meta.url).pathname] = process.argv.slice(2);
fs.rmSync(out, { recursive: true, force: true });
for (const d of ['images', 'planches']) fs.mkdirSync(out + d, { recursive: true });
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-vulkan=swiftshader'] });
const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'fr-FR', serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  localStorage.setItem('countrizz:e2e', '1');
  const w = window; w.__journal = []; let last = '';
  const f = () => {
    const g = w.__game?.state, i = w.__intro;
    const intro = document.querySelector('.intro') ? (document.querySelector('.intro--fondu') ? 'fondu' : (i && i.t >= 17 ? 'intro-fin' : 'intro')) : '';
    const k = `${intro || 'jeu'}|${g?.screen ?? '-'}`;
    if (k !== last) { w.__journal.push({ ms: Date.now(), etat: k, introT: i?.t ?? null }); last = k; }
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
});
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
const frames = [];
cdp.on('Page.screencastFrame', async (fr) => {
  frames.push({ ms: fr.metadata.timestamp * 1000, data: fr.data });
  await cdp.send('Page.screencastFrameAck', { sessionId: fr.sessionId }).catch(() => {});
});
const actions = [];
const act = async (nom, fn) => { actions.push({ ms: Date.now(), nom }); await fn(); };
await p.goto(`${base}?webgl&partie=12000&graine=42`);
await p.waitForFunction(() => window.__intro?.ready === true, null, { timeout: 120000 });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 });
await p.waitForFunction(() => !document.querySelector('.intro'), null, { timeout: 180000 });
await p.waitForTimeout(3500);
await act('clic Jouer', () => p.getByRole('button', { name: /^Jouer/ }).click());
await p.waitForTimeout(1800);
await act('clic Pays', () => p.locator('.mode-bouton', { hasText: /Pays/ }).click());
// questions : on répond après 1,4 s, jusqu'à la fin
for (let n = 0; n < 30; n++) {
  const s = await p.waitForFunction(() => ['question', 'end'].includes(window.__game?.state.screen ?? '') ? window.__game.state.screen : null, null, { timeout: 60000 }).then((h) => h.jsonValue());
  if (s === 'end') break;
  await p.waitForTimeout(1400);
  if ((await p.evaluate(() => window.__game?.state.screen)) !== 'question') continue;
  await act(`réponse ${n + 1}`, () => p.locator('.reponse').nth(n % 4).click({ timeout: 5000 }).catch(() => {}));
  await p.waitForFunction(() => window.__game?.state.screen !== 'question', null, { timeout: 30000 }).catch(() => {});
}
await p.waitForTimeout(3000);
await act('clic Scores', () => p.getByRole('button', { name: /Scores/ }).first().click().catch(() => {}));
await p.waitForTimeout(2000);
await act('clic Retour', () => p.getByRole('button', { name: /Retour/ }).first().click().catch(() => {}));
await p.waitForTimeout(3000);
await cdp.send('Page.stopScreencast');
const journal = await p.evaluate(() => window.__journal);
await b.close();

const t0 = frames[0].ms;
frames.forEach((f, i) => { f.nom = `${String(i).padStart(4, '0')}-${((f.ms - t0) / 1000).toFixed(2)}s.jpg`; fs.writeFileSync(out + 'images/' + f.nom, Buffer.from(f.data, 'base64')); });
const rel = (ms) => ((ms - t0) / 1000).toFixed(2);
const evenements = [...journal.map((e) => ({ ms: e.ms, nom: `état ${e.etat}${e.introT != null ? ` (vidéo ${e.introT.toFixed(1)} s)` : ''}` })), ...actions].filter((e) => e.ms >= t0).sort((a, c) => a.ms - c.ms);
fs.writeFileSync(out + 'journal.txt', evenements.map((e) => `${rel(e.ms).padStart(7)} s  ${e.nom}`).join('\n') + '\n');
// trous : aucune image nouvelle pendant > 100 ms (le globe tourne toujours : un trou est un gel)
const trous = frames.slice(1).map((f, i) => [f.ms - frames[i].ms, frames[i].ms]).filter(([g]) => g > 100);
fs.writeFileSync(out + 'trous.txt', trous.map(([g, at]) => `${rel(at)} s : ${Math.round(g)} ms sans image`).join('\n') + '\n');

const W = 206, H = 458;
const lab = (t) => Buffer.from(`<svg width="${W}" height="20"><rect width="${W}" height="20" fill="#000"/><text x="3" y="14" font-family="Helvetica" font-size="12" fill="#ff0">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`);
const planche = async (nom, choix) => {
  const cols = Math.min(6, choix.length), rows = Math.ceil(choix.length / cols);
  const comp = [];
  for (const [i, c] of choix.entries()) {
    const x = (i % cols) * W, y = Math.floor(i / cols) * (H + 20);
    comp.push({ input: lab(c.titre), left: x, top: y }, { input: await sharp(out + 'images/' + c.f.nom).resize(W, H).toBuffer(), left: x, top: y + 20 });
  }
  await sharp({ create: { width: cols * W, height: rows * (H + 20), channels: 3, background: '#222' } }).composite(comp).jpeg({ quality: 82 }).toFile(out + 'planches/' + nom + '.jpg');
};
const proche = (ms) => frames.reduce((a, f) => (Math.abs(f.ms - ms) < Math.abs(a.ms - ms) ? f : a));
let k = 0;
for (const e of evenements) {
  const pas = [-600, -200, 0, 150, 300, 500, 750, 1000, 1400, 1800, 2200, 2800];
  const choix = pas.map((d) => ({ f: proche(e.ms + d), titre: `${d >= 0 ? '+' : ''}${d} ms` }));
  await planche(`${String(++k).padStart(2, '0')}-${rel(e.ms)}s-${e.nom.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40)}`, choix);
}
const story = [];
for (let ms = t0; ms <= frames.at(-1).ms; ms += 500) story.push({ f: proche(ms), titre: `${rel(ms)} s` });
for (let i = 0; i < story.length; i += 24) await planche(`storyboard-${String(i / 24 + 1).padStart(2, '0')}`, story.slice(i, i + 24));
console.log(`${frames.length} images en ${rel(frames.at(-1).ms)} s ; ${evenements.length} événements ; ${trous.length} trous > 100 ms ; planches dans ${out}planches`);
