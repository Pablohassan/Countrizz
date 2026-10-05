// Position à l'écran (vue « lever de Terre » d'acc-16.png) de capitales et de cœurs de pays. Lecture seule.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const require = createRequire('/Users/rusmirsadikovic/projetsperso/countriz/countrizz/web/package.json');
const { chromium } = require('@playwright/test');
const countries = JSON.parse(readFileSync('/Users/rusmirsadikovic/projetsperso/countriz/countrizz/web/public/data/countries.json', 'utf8'));
// Coordonnées de capitales (approximatives, pour la maquette seulement : le jeu n'en a pas encore).
const CAPS = { FRA: [2.35, 48.86], ESP: [-3.70, 40.42], ITA: [12.50, 41.90], DEU: [13.40, 52.52], GBR: [-0.13, 51.51], PRT: [-9.14, 38.72],
  MAR: [-6.84, 34.02], DZA: [3.06, 36.75], TUN: [10.18, 36.81], EGY: [31.24, 30.04], SEN: [-17.44, 14.69], NER: [2.11, 13.51], MLI: [-8.0, 12.64],
  NGA: [7.49, 9.06], GRC: [23.73, 37.98], TUR: [32.86, 39.93], POL: [21.01, 52.23], SWE: [18.07, 59.33], NOR: [10.75, 59.91], UKR: [30.52, 50.45],
  SDN: [32.53, 15.50], LBY: [13.19, 32.89], MRT: [-15.98, 18.09], TCD: [15.04, 12.13], ISL: [-21.94, 64.15], IRL: [-6.26, 53.35], FIN: [24.94, 60.17] };
const codes = Object.keys(CAPS);
const recs = codes.map((c) => countries.find((r) => r.cca3 === c));
const D = 2.6, c0 = [10, 20];
const rad = (d) => (d * Math.PI) / 180;
function facing([lng, lat]) {
  const cosd = Math.sin(rad(lat)) * Math.sin(rad(c0[1])) + Math.cos(rad(lat)) * Math.cos(rad(c0[1])) * Math.cos(rad(lng - c0[0]));
  return (D * cosd - 1) / Math.sqrt(D * D - 2 * D * cosd + 1);
}
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader'] });
const p = await b.newPage({ viewport: { width: 780, height: 1688 } });
await p.goto('http://localhost:5180/probe.html?mode=game&w=780&h=1688&borders&post&at=10,20&alt=1.6&clouds=1');
await p.waitForFunction(() => window.__probe !== undefined, null, { timeout: 180_000 });
const pts = [...codes.map((c) => CAPS[c]), ...recs.map((r) => r.beacon)];
const px = await p.evaluate((pts) => window.__probe.project(pts), pts);
await b.close();
const out = codes.map((c, i) => {
  const r = recs[i], cap = px[i], heart = px[i + codes.length];
  const css = (q) => (q ? [+(q[0] / 2).toFixed(1), +(q[1] / 2 + 400).toFixed(1)] : null);
  return { cca3: c, pays: r.name, capitale: r.capital, drapeau: `/files/${c.toLowerCase()}.svg`,
    capitaleXY: css(cap), capitaleFacing: +facing(CAPS[c]).toFixed(3), coeurXY: css(heart), coeurFacing: +facing(r.beacon).toFixed(3) };
});
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
for (const o of out) console.log(o.cca3, o.pays, '|', o.capitale, o.capitaleXY, o.capitaleFacing, '| coeur', o.coeurXY, o.coeurFacing);
