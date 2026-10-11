// Géométrie des deux titres « C🌍untrizz » de la vidéo (src/intro/cadrages.ts), en px de la vidéo : Chromium (Playwright)
// mesure une page qui reprend les règles CSS du site avec la vraie police Chango. Le titre de l'accueil vient de
// src/ui/home.css lu tel quel ; le logo du milieu, des règles d'intro.css du 10/10 recopiées ci-dessous (le lecteur
// vidéo les retire du site, la vidéo les garde). Animations coupées : les lettres sont mesurées au repos.
// Usage (dans web/) : `npx tsx scripts/intro/mesurer-titres.ts` → JSON sur la sortie standard, à recopier dans TITRES.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REFERENCES, type Titre } from '../../src/intro/cadrages';
import { CADRAGES, LOGO_LETTRES, type Cadrage } from '../../src/intro/temps';

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGINE = 'http://titres.countrizz';

/** Logo du milieu : intro.css du 10/10, l. 2 et 7-11 (copie exacte). */
const LOGO_CSS = `
.intro { position: absolute; inset: 0; overflow: hidden; font-family: var(--cartoon); pointer-events: none; }
.intro-logo { position: absolute; left: 0; right: 0; top: 50%; transform: translateY(-50%); text-align: center; white-space: nowrap; color: var(--jaune);
  font-size: min(13.5vw, 7vh);   /* « C🌍untrizz » tient dans un téléphone de 390 px */ letter-spacing: 1px; text-shadow: var(--ombre-titre); pointer-events: none; }
.intro-logo-l { display: inline-block; opacity: 0; }
.intro-logo-o { position: relative; display: inline-block; color: transparent; text-shadow: none; }
.intro-logo-terre { position: absolute; left: 50%; top: 58%; width: 0.66em; height: 0.66em; transform: translate(-50%, -50%); }
`;
// le style de base de la page (index.html : marges, hauteur de #root), tel quel
const BASE_CSS = /<style>([\s\S]*?)<\/style>/.exec(readFileSync(path.join(web, 'index.html'), 'utf8'))![1]!;
const lettres = (classe: string) => LOGO_LETTRES.slice(1).map((l) => `<span class="${classe}">${l}</span>`).join('');
// même arbre que le site : #root > .intro > .intro-logo (Intro.tsx) et #root > .accueil > h1 (Home.tsx, LogoTitle.tsx)
const PAGE = `<!doctype html><html lang="fr"><head><meta charset="UTF-8">
<link rel="stylesheet" href="/ui/theme.css"><link rel="stylesheet" href="/ui/home.css">
<style>${BASE_CSS}${LOGO_CSS}*, *::before, *::after { animation: none !important; transition: none !important; }</style></head>
<body><div id="root">
<div class="intro"><div class="intro-logo"><span class="intro-logo-l">${LOGO_LETTRES[0]}</span><span class="intro-logo-o">o<i class="intro-logo-terre"></i></span>${lettres('intro-logo-l')}</div></div>
<div class="accueil"><h1 class="accueil-titre logo-titre"><span class="logo-l">${LOGO_LETTRES[0]}</span><span class="logo-o">o<i class="logo-terre"></i></span>${lettres('logo-l')}</h1></div>
</div></body></html>`;
const FICHIERS: Record<string, { fichier: string; type: string }> = {
  '/ui/theme.css': { fichier: 'src/ui/theme.css', type: 'text/css' },
  '/ui/home.css': { fichier: 'src/ui/home.css', type: 'text/css' },
  '/fonts/chango-latin.woff2': { fichier: 'public/fonts/chango-latin.woff2', type: 'font/woff2' },
  '/fonts/chango-latin-ext.woff2': { fichier: 'public/fonts/chango-latin-ext.woff2', type: 'font/woff2' },
};

// mesure dans la page : du texte, pas une fonction (tsx y glisserait `__name`, inconnu de la page : ReferenceError)
const MESURE = `(() => {
  const boite = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; };
  const titre = (racine, lettre, terre) => {
    const el = document.querySelector(racine), o = boite(el.querySelector(terre));
    return { o: { x: o.x, y: o.y, r: o.w / 2 }, police: parseFloat(getComputedStyle(el).fontSize),
      lettres: [...el.querySelectorAll(lettre)].map((l) => { const b = boite(l); return { x: b.x, y: b.y }; }) };
  };
  return { logo: titre('.intro-logo', '.intro-logo-l', '.intro-logo-terre'), titre: titre('.accueil-titre', '.logo-l', '.logo-terre') };
})()`;

const arrondi = (v: number) => Math.round(v * 100) / 100;
/** px CSS de l'écran de référence → px de la vidéo : la vidéo le couvre en largeur, calée en haut (ou 1:1). */
function versVideo(t: Titre, e: number): Titre {
  const pt = (p: { x: number; y: number }) => ({ x: arrondi(p.x * e), y: arrondi(p.y * e) });
  return { o: { ...pt(t.o), r: arrondi(t.o.r * e) }, police: arrondi(t.police * e), lettres: t.lettres.map(pt) };
}

const navigateur = await chromium.launch();
const sortie = {} as Record<Cadrage, { logo: Titre; titre: Titre }>;
try {
  for (const cadrage of ['portrait', 'paysage'] as const) {
    const ref = REFERENCES[cadrage], video = CADRAGES[cadrage];
    // garde : l'écran de référence a exactement la largeur de la vidéo et tient dans sa hauteur (pas de décalage)
    if (Math.abs(ref.width * ref.echelle - video.width) > 1e-9 || ref.height * ref.echelle > video.height + 1e-9) {
      throw new Error(`REFERENCES.${cadrage} ne couvre pas la vidéo ${video.width}×${video.height}`);
    }
    const page = await navigateur.newPage({ viewport: { width: ref.width, height: ref.height } });
    await page.route(`${ORIGINE}/**`, (route) => {
      const chemin = new URL(route.request().url()).pathname, f = FICHIERS[chemin];
      if (chemin === '/') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: PAGE });
      if (f) return route.fulfill({ contentType: f.type, body: readFileSync(path.join(web, f.fichier)) });
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto(`${ORIGINE}/`);
    const police = await page.evaluate("document.fonts.load('54px Chango', 'Countrizz').then((f) => f.map((x) => x.family + ':' + x.status))") as string[];
    if (police.length === 0 || police.some((p) => !p.endsWith(':loaded'))) throw new Error(`police Chango non chargée : ${JSON.stringify(police)}`);
    const m = await page.evaluate(MESURE) as { logo: Titre; titre: Titre };
    if (m.logo.lettres.length !== 8 || m.titre.lettres.length !== 8) throw new Error('8 lettres attendues par titre');
    sortie[cadrage] = { logo: versVideo(m.logo, ref.echelle), titre: versVideo(m.titre, ref.echelle) };
    console.error(`${cadrage} : écran ${ref.width}×${ref.height} → vidéo ${video.width}×${video.height}, police ${police.join(', ')}`);
    await page.close();
  }
} finally {
  await navigateur.close();
}
console.log(JSON.stringify(sortie, null, 2));
