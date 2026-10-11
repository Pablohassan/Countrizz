/**
 * Sources de la scène Blender de l'intro (spec `2026-10-11-countrizz-intro-video-blender-design.md` §2.3), depuis les
 * caches de `npm run geodata:fetch` et `npm run textures:fetch`, dans `scripts/intro/.cache/sources/` (ignoré par git) :
 *  - `monde.png` : la peinture « pâte » du monde, 8192 × 4096, RGB 8 bits (22,8 px/°, non réduite) ;
 *  - `europe.png` : l'Europe et le Maghreb (`INTRO_EUROPE`) à 60 px/°, la définition des sources ;
 *  - `hauteur.png` : la hauteur du relief, 8192 × 4096, gris 16 bits (v / 65535 · `hauteurMax`, rayons terrestres) ;
 *  - `relief-fin.png` : le relief fin de l'Europe à 60 px/°, gris 16 bits (v / 65535 = ½ + ½ · tanh(détail / `reliefFinS`)) ;
 *  - `sources.json` : `{ hauteurMax, reliefFinS, europe }` ;
 *  - `france.json` : la frontière de la France métropolitaine, `[lng, lat][]` ;
 *  - `frontiere.json` : le boudin de la frontière, 2601 points `[x, y, z]` du repère three (lib/terre.ts) ;
 *  - `reperes.json` : `{ paris, frontiereMilieu }`, points `[x, y, z]` du repère three sur la surface déplacée.
 * Images équirectangulaires : ligne 0 au nord de la boîte, colonne 0 à l'ouest. Usage : `npm run intro:sources`.
 */
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { INTRO_EUROPE, MONDE, france, hauteur, lirePays, peindre, reliefFin } from './lib/peinture';
import { HAUTEUR_MAX, courbeFrontiere, hauteurA, pointsFrontiere, reperes, type Gris16 } from './lib/terre';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '.cache/sources');
const MW = 8192, MH = 4096;   // monde et hauteur : 22,8 px/°
const PX_DEG = 60;            // Europe et relief fin : la définition des sources (GEBCO, Blue Marble)
const E = INTRO_EUROPE, EW = (E.lng1 - E.lng0) * PX_DEG, EH = (E.lat1 - E.lat0) * PX_DEG;

mkdirSync(OUT, { recursive: true });
const pays = lirePays();
await (await peindre(pays, MONDE, MW, MH)).png().toFile(path.join(OUT, 'monde.png'));
await (await peindre(pays, E, EW, EH)).png().toFile(path.join(OUT, 'europe.png'));
const fin = await reliefFin(E, EW, EH);
await fin.img.png().toFile(path.join(OUT, 'relief-fin.png'));
console.log(`relief fin : échelle de codage ${fin.S.toFixed(5)} (rayons terrestres)`);
const h: Gris16 = { w: MW, h: MH, d: await hauteur(pays, MW, MH) };
await sharp(h.d, { raw: { width: MW, height: MH, channels: 1 } }).toColourspace('grey16').png().toFile(path.join(OUT, 'hauteur.png'));
const fra = france(pays);
const points = pointsFrontiere(courbeFrontiere(fra, (lng, lat) => hauteurA(h, lng, lat)));
writeFileSync(path.join(OUT, 'sources.json'), JSON.stringify({ hauteurMax: HAUTEUR_MAX, reliefFinS: fin.S, europe: { ...E } }));
writeFileSync(path.join(OUT, 'france.json'), JSON.stringify(fra));
writeFileSync(path.join(OUT, 'frontiere.json'), JSON.stringify(points));
writeFileSync(path.join(OUT, 'reperes.json'), JSON.stringify(reperes(points, (lng, lat) => hauteurA(h, lng, lat))));
for (const f of ['monde.png', 'europe.png', 'relief-fin.png', 'hauteur.png', 'sources.json', 'france.json', 'frontiere.json', 'reperes.json']) {
  const p = path.join(OUT, f), m = f.endsWith('.png') ? await sharp(p).metadata() : null;
  console.log(`${f}${m ? ` ${m.width}×${m.height} ${m.channels} canal(aux) ${m.depth}` : ''} ${statSync(p).size} octets`);
}
