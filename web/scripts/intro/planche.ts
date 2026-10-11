/**
 * Planche contact des images témoins (spec intro vidéo §2.4 et §3 : la planche est validée par l'utilisateur avant la
 * prévisualisation). Pour chaque cadrage, les PNG de `.cache/frames/temoins/<cadrage>/` posés sur la nuit (comme à
 * l'encodage), réduits au tiers, l'instant écrit dessous. Sur les images où des bulles sont ouvertes, un cercle marque
 * l'ancre exportée (`public/intro/ancres.json`) : la bulle pointera là, elle doit tomber sur le point, la frontière, le
 * haut du mât. En tête : le temps de rendu par image lu dans les journaux des témoins (dernier passage de
 * `.cache/journal-temoins-<cadrage>.log`), l'estimation du rendu final des deux cadrages (`lib/mesure.ts`) et la place
 * qu'il prendra (taille moyenne d'un PNG témoin × images).
 * Usage : `npm run intro:temoins`, puis `npm run intro:planche -- --echantillons <échantillons du rendu final>`.
 * Sorties : `.cache/planche-portrait.png`, `.cache/planche-paysage.png`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import sharp, { type OverlayOptions } from 'sharp';
import { BULLES, BULLES_RANGE, CADRAGES, type Bulle, type Cadrage } from '../../src/intro/temps';
import { estimation, lireMesures } from './lib/mesure';
import type { Ancres } from './export-keys';
import { ancreTemoin, IMAGES_MAITRE, instantDe, legende } from './lib/temoins';

sharp.cache(false);
const ICI = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(ICI, '.cache');
const ANCRES = path.resolve(ICI, '../../public/intro/ancres.json');
const NUIT = '#16173a';
const REDUCTION = 3, COLONNES: Record<Cadrage, number> = { portrait: 6, paysage: 4 };
const MARGE = 16, LEGENDE = 36, ENTETE = 64;
const INITIALES: Record<Bulle, string> = { capitale: 'C', pays: 'P', drapeau: 'D' };

const { values: opts } = parseArgs({ options: { echantillons: { type: 'string' } } });
const echantillons = opts.echantillons === undefined ? undefined : Number(opts.echantillons);
const virgule = (x: number) => x.toFixed(1).replace('.', ',');
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const temoins = (cadrage: Cadrage) => {
  const d = path.join(CACHE, 'frames', 'temoins', cadrage);
  return existsSync(d) ? readdirSync(d).filter((f) => /^f_\d{4}\.png$/.test(f)).map((f) => path.join(d, f)).sort() : [];
};

const mesures = lireMesures(CACHE, 'temoins');
const ancres = existsSync(ANCRES) ? (JSON.parse(readFileSync(ANCRES, 'utf8')) as Ancres) : null;

// Place des PNG du rendu final : taille moyenne d'un témoin (rendu aux mêmes réglages) × images, pour chaque cadrage.
const go = (['portrait', 'paysage'] as const).reduce((s, c) => {
  const f = temoins(c);
  return s + (f.length ? (IMAGES_MAITRE * f.reduce((n, x) => n + statSync(x).size, 0)) / f.length / 1e9 : 0);
}, 0);
let resume = 'journaux des témoins absents ou incomplets : pas de mesure';
if (mesures.portrait && mesures.paysage) {
  const e = estimation([mesures.portrait.moyenne, mesures.paysage.moyenne], IMAGES_MAITRE, echantillons ?? 0);
  resume = `rendu final ≈ ${virgule(e.heures)} h pour ${IMAGES_MAITRE} images × 2 cadrages`;
  if (echantillons !== undefined) {
    resume += ` à ${echantillons} échantillons`
      + (e.echantillons === echantillons ? ' (≤ 10 h)' : ` → ${e.echantillons} échantillons proposés`);
  }
}
resume += ` ; PNG ≈ ${virgule(go)} Go`;
console.log(resume);

for (const cadrage of ['portrait', 'paysage'] as const) {
  const fichiers = temoins(cadrage);
  if (fichiers.length === 0) { console.log(`${cadrage} : aucune image témoin`); continue; }
  const { width, height } = CADRAGES[cadrage];
  const w = Math.round(width / REDUCTION), h = Math.round(height / REDUCTION);
  const col = COLONNES[cadrage], lignes = Math.ceil(fichiers.length / col);
  const W = MARGE + col * (w + MARGE), H = ENTETE + lignes * (h + LEGENDE + MARGE);
  const m = mesures[cadrage];
  const titre = `Témoins ${cadrage} — ${fichiers.length} images`
    + (m ? ` — ${virgule(m.moyenne)} s/image en moyenne (médiane ${virgule(m.mediane)}, ${m.ecarts} écarts)` : '');
  const textes = [
    `<text x="${MARGE}" y="28" font-size="24" fill="#fff">${xml(titre)}</text>`,
    `<text x="${MARGE}" y="54" font-size="18" fill="#bbb">${xml(resume)}</text>`,
  ];
  const vignettes: OverlayOptions[] = [];
  for (const [i, fichier] of fichiers.entries()) {
    const n = Number(path.basename(fichier).slice(2, 6));
    const x = MARGE + (i % col) * (w + MARGE), y = ENTETE + Math.floor(i / col) * (h + LEGENDE + MARGE);
    const input = await sharp(fichier).flatten({ background: NUIT }).resize(w, h).png().toBuffer();
    vignettes.push({ input, left: x, top: y });
    textes.push(`<text x="${x}" y="${y + h + 26}" font-size="20" fill="#fff">${xml(legende(n))}</text>`);
    const t = instantDe(n);
    for (const b of Object.keys(BULLES) as Bulle[]) {
      const p = ancres && t >= BULLES[b].apparait && t < BULLES_RANGE ? ancreTemoin(ancres, cadrage, b, t) : null;
      if (!p) continue;
      const ax = x + p[0] / REDUCTION, ay = y + p[1] / REDUCTION;
      textes.push(`<circle cx="${ax}" cy="${ay}" r="14" fill="none" stroke="#ff3df2" stroke-width="3"/>`,
        `<circle cx="${ax}" cy="${ay}" r="2.5" fill="#ff3df2"/>`,
        `<text x="${ax + 17}" y="${ay - 10}" font-size="18" font-weight="bold" fill="#ff3df2">${INITIALES[b]}</text>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">`
    + `${textes.join('')}</svg>`;
  const sortie = path.join(CACHE, `planche-${cadrage}.png`);
  await sharp({ create: { width: W, height: H, channels: 3, background: '#2b2b2b' } })
    .composite([...vignettes, { input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(sortie);
  console.log(`${sortie} : ${fichiers.length} images${m ? `, ${virgule(m.moyenne)} s/image` : ''}`);
}
