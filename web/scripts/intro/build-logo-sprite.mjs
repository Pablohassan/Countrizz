// La petite Terre du titre C🌍untrizz : 24 vues de la Terre en pâte (un tour, 15° par vue), rendues par l'intro elle-même
// (`?introSprite=<degrés>`, crochet de dev) sur le GPU de la machine, assemblées en une bande WebP transparente.
// Usage : serveur de dev lancé (npm run dev -- --port 5180), puis `node scripts/intro/build-logo-sprite.mjs [url]`.
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.argv[2] ?? 'http://localhost:5180/';
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/intro/logo-terre.webp');
const N = 24, TAILLE = 128, VUE = 400;
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: VUE, height: VUE }, deviceScaleFactor: 1 });
const images = [];
for (let i = 0; i < N; i++) {
  await p.goto(`${base}?introSprite=${(i * 360) / N}`);
  await p.waitForFunction(() => window.__intro?.ready === true && window.__intro.frames > 3, null, { timeout: 120_000 });
  await p.evaluate(() => {
    for (const s of ['.intro-logo', '.intro-passer', '.intro-fantome', '.accueil', 'footer', '[role=alert]']) document.querySelectorAll(s).forEach((e) => { e.style.display = 'none'; });
    for (const e of [document.documentElement, document.body, document.getElementById('root')]) e.style.background = 'transparent';
  });
  await p.waitForTimeout(300);
  // la Terre (rayon 0,45 × 400 = 180 px, reliefs compris ≈ 196) au centre
  const png = await p.screenshot({ omitBackground: true, clip: { x: 2, y: 2, width: VUE - 4, height: VUE - 4 } });
  images.push(await sharp(png).resize(TAILLE, TAILLE).png().toBuffer());
  console.log(`vue ${i + 1}/${N}`);
}
await b.close();
await sharp({ create: { width: TAILLE * N, height: TAILLE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(images.map((input, i) => ({ input, left: i * TAILLE, top: 0 })))
  .webp({ quality: 88, alphaQuality: 90 }).toFile(out);
console.log(out);
