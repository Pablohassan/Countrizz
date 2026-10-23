/**
 * Encodage de l'intro (spec intro vidéo §2.5) : des PNG RGBA 8 bits rendus par Blender, fond transparent
 * (`.cache/frames/<source>/<cadrage>/f_0001.png…`, 120 i/s), aux 10 vidéos du lecteur, aux deux affiches et au
 * manifeste `videos.json` :
 *  - la nuit `#16173a` est posée ici, exacte (graphe et réglages : `lib/encodage.ts`) ;
 *  - AV1 10 bits (libsvtav1) et HEVC Main (libx265, étiquette hvc1 pour Safari), 60 et 120 i/s, `+faststart` ;
 *  - contrôles : nombre de PNG AVANT d'encoder (image2 s'arrête en silence au premier PNG manquant), puis pour chaque
 *    vidéo ffprobe (codec, format, taille, cadence, nombre d'images, étiquettes de couleur), `moov` avant `mdat`, fond
 *    décodé à ± 3 de (22, 23, 58) ; la chaîne de codec du manifeste est lue dans le fichier (`lib/mp4.ts`) ;
 *  - affiches : la première image sur la nuit, en WebP sans perte (sharp : ffmpeg n'a pas d'encodeur WebP).
 * `--sprite` assemble les 24 vues de la petite Terre du titre (`npm run intro:sprite` : `.cache/frames/sprite/f_0001.png`
 * … `f_0024.png`, 128 × 128, vue i ↔ angle (i − 1)·15°) en `public/intro/logo-terre.webp` (3072 × 128, q88, alpha 90 :
 * même chemin, même disposition qu'avant).
 * `--bulles` fait de l'aperçu (`.cache/frames/apercu/`) une vidéo à juger, bulles esquissées à leurs ancres
 * (`lib/apercu.ts`) : `.cache/video-apercu/apercu-<cadrage>-bulles.mp4`, HEVC 60 i/s lu par QuickTime.
 * `--plafonds` fige les plafonds d'octets du test de budget depuis `public/video/videos.json` dans
 * `e2e-budget/plafonds-video.json` (règle : `plafond` de `lib/encodage.ts`) ; à lancer exprès, jamais à chaque encodage.
 * Usage : `npm run intro:encode -- --source apercu|rendu [--variantes portrait-plein-60-hevc,…]`, et/ou `--sprite`,
 * `--bulles`, `--plafonds`.
 * Sorties : `rendu` → `public/video/` (vidéos, `videos.json`) et `public/intro/` (affiches) ; `apercu` →
 * `scripts/intro/.cache/video-apercu/` (rien dans `public/`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { REFERENCES } from '../../src/intro/cadrages';
import { BULLES, CADRAGES, type Cadrage } from '../../src/intro/temps';
import { idVariante, type Manifeste } from '../../src/intro/videos';
import {
  argsFfmpeg, controlerFond, controlerSonde, imagesAttendues, manifeste, nomFichier, nomImage, NUIT, plafond,
  pointsDeFond, REGLAGES, SORTIES, verdictDebit, type Sonde, type Sortie,
} from './lib/encodage';
import { bullesApercu, bulleSvg, grapheApercu, type PoseBulle } from './lib/apercu';
import { chaineCodec, ordreDeTete } from './lib/mp4';
import type { Ancres } from './export-keys';
import { ancreTemoin, IMAGES_MAITRE } from './lib/temoins';

sharp.cache(false);
const ICI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(ICI, '../..');
const CACHE = path.join(ICI, '.cache');
/** Vues de la petite Terre : SPRITE_VUES de scripts/intro/blender/scene.py (96 depuis le 23/10 : 24 images/s). */
const SPRITE = { vues: 96, cote: 128 };

const { values: opts } = parseArgs({
  options: {
    source: { type: 'string' }, variantes: { type: 'string' }, sprite: { type: 'boolean' }, bulles: { type: 'boolean' },
    plafonds: { type: 'boolean' },
  },
});
const source = opts.source;
if (source !== undefined && source !== 'apercu' && source !== 'rendu') throw new Error('--source apercu|rendu');
if (source === undefined && !opts.sprite && !opts.bulles && !opts.plafonds) {
  throw new Error('usage : --source apercu|rendu [--variantes …] [--sprite] [--bulles] [--plafonds]');
}

/** Refuse un dossier où il manque une image, où une image est vide (rendu interrompu), ou qui en a de trop. */
function verifierImages(dossier: string, n: number): void {
  if (!existsSync(dossier)) throw new Error(`${dossier} absent : lancer le rendu d'abord`);
  const presentes = new Set(readdirSync(dossier).filter((f) => /^f_\d{4}\.png$/.test(f)));
  const manquantes: number[] = [], vides: number[] = [];
  for (let i = 1; i <= n; i++) {
    if (!presentes.has(nomImage(i))) manquantes.push(i);
    else if (statSync(path.join(dossier, nomImage(i))).size === 0) vides.push(i);
  }
  const liste = (l: number[]) => `${l.slice(0, 10).join(', ')}${l.length > 10 ? ` … (${l.length})` : ''}`;
  if (manquantes.length > 0) throw new Error(`${dossier} : ${manquantes.length} image(s) manquante(s) sur ${n} : ${liste(manquantes)}`);
  if (vides.length > 0) throw new Error(`${dossier} : image(s) vide(s) : ${liste(vides)} — relancer le rendu (reprise)`);
  if (presentes.size !== n) throw new Error(`${dossier} : ${presentes.size} images pour ${n} attendues`);
}

function lancer(cmd: string, args: string[], journal: string): void {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 << 20 });
  writeFileSync(journal, r.stderr ?? '');
  if (r.status !== 0) throw new Error(`${cmd} (code ${r.status}) — journal : ${journal}\n${(r.stderr ?? '').trim().split('\n').slice(-5).join('\n')}`);
}

function sonder(fichier: string): Sonde {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=codec_name,codec_tag_string,width,height,pix_fmt,r_frame_rate,nb_frames,color_range,color_space,color_primaries,color_transfer,bit_rate',
    '-of', 'json', fichier], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe ${fichier} : ${r.stderr}`);
  return (JSON.parse(r.stdout) as { streams: Sonde[] }).streams[0]!;
}

/** Première image décodée en rgb24, conversion exacte (sans `accurate_rnd`, swscale décale le fond de 3 à 4). */
function premiereImage(fichier: string): Buffer {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', fichier, '-frames:v', '1', '-vf',
    'scale=in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=rgb24',
    '-f', 'rawvideo', '-'], { maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`décodage de ${fichier} : ${r.stderr}`);
  return r.stdout;
}

async function encoder(source: 'apercu' | 'rendu', choix: Sortie[]): Promise<void> {
  const sortieVideo = source === 'rendu' ? path.join(WEB, 'public/video') : path.join(CACHE, 'video-apercu');
  const sortieAffiche = source === 'rendu' ? path.join(WEB, 'public/intro') : sortieVideo;
  const journaux = path.join(CACHE, 'journaux-encode', source);
  mkdirSync(sortieVideo, { recursive: true });
  mkdirSync(journaux, { recursive: true });

  // 1. Contrôle préalable des deux cadrages, avant la première minute d'encodage.
  const cadrages = [...new Set(choix.map((s) => s.cadrage))];
  const entrees = {} as Record<Cadrage, { dossier: string; width: number; height: number; fond: [number, number][] }>;
  for (const c of cadrages) {
    const dossier = path.join(CACHE, 'frames', source, c);
    verifierImages(dossier, IMAGES_MAITRE);
    const { data, info } = await sharp(path.join(dossier, nomImage(1))).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
    if (source === 'rendu' && (info.width !== CADRAGES[c].width || info.height !== CADRAGES[c].height)) {
      throw new Error(`${c} : images ${info.width}×${info.height}, ${CADRAGES[c].width}×${CADRAGES[c].height} attendues`);
    }
    const fond = pointsDeFond(new Uint8Array(data), info.width, info.height);
    if (fond.length === 0) throw new Error(`${c} : aucun fond transparent sur la première image, contrôle du fond impossible`);
    entrees[c] = { dossier, width: info.width, height: info.height, fond };
    console.log(`${c} : ${IMAGES_MAITRE} images ${info.width}×${info.height}, ${fond.length} points de fond`);
  }

  // 2. Vidéos, chacune contrôlée dès sa sortie.
  const erreurs: string[] = [];
  for (const s of choix) {
    const id = idVariante(s), e = entrees[s.cadrage];
    const fichier = path.join(sortieVideo, nomFichier(s));
    const t0 = Date.now();
    lancer('ffmpeg', argsFfmpeg(s, e, fichier), path.join(journaux, `${id}.log`));
    const octets = readFileSync(fichier);
    const tete = ordreDeTete(octets);
    const sonde = sonder(fichier);
    const echelle = s.width / e.width;
    const points = e.fond.map(([x, y]) => [Math.round(x * echelle), Math.round(y * echelle)] as [number, number]);
    const ecarts = [
      ...controlerSonde(s, sonde, imagesAttendues(s.ips)),
      ...(tete.indexOf('moov') >= 0 && tete.indexOf('moov') < tete.indexOf('mdat') ? [] : [`boîtes de tête : ${tete.join(', ')}`]),
      ...controlerFond(premiereImage(fichier), s.width, points).slice(0, 5).map((p) => `fond ${p}`),
    ];
    const codecs = chaineCodec(octets);
    const kbps = Number(sonde.bit_rate) / 1000;
    console.log(`${id.padEnd(24)} ${String(octets.length).padStart(10)} o  ${kbps.toFixed(0).padStart(5)} kb/s  `
      + `${verdictDebit(kbps, REGLAGES[id]!).padEnd(7)} ${codecs.padEnd(18)} ${((Date.now() - t0) / 1000).toFixed(0)} s`
      + `${ecarts.length ? `  ÉCARTS : ${ecarts.join(' ; ')}` : ''}`);
    erreurs.push(...ecarts.map((x) => `${id} : ${x}`));
  }

  // 3. Affiches : la première image sur la nuit, sans perte (le fond reste exact).
  for (const c of cadrages) {
    const fichier = path.join(sortieAffiche, `affiche-${c}.webp`);
    await sharp(path.join(entrees[c].dossier, nomImage(1))).flatten({ background: NUIT }).webp({ lossless: true }).toFile(fichier);
    console.log(`affiche ${c} : ${statSync(fichier).size} o`);
  }

  // 4. Manifeste : toutes les vidéos présentes dans le dossier (un ré-encodage partiel garde les autres), octets et
  //    chaîne de codec relus dans chaque fichier.
  const presentes = SORTIES.filter((s) => existsSync(path.join(sortieVideo, nomFichier(s)))).map((s) => {
    const octets = readFileSync(path.join(sortieVideo, nomFichier(s)));
    return { s, octets: octets.length, codecs: chaineCodec(octets) };
  });
  const json = path.join(sortieVideo, 'videos.json');
  writeFileSync(json, `${JSON.stringify(manifeste(presentes), null, 2)}\n`);
  console.log(`${json} : ${presentes.length} variantes, ${presentes.reduce((n, p) => n + p.octets, 0)} o`);
  if (erreurs.length > 0) throw new Error(`${erreurs.length} écart(s) :\n${erreurs.join('\n')}`);
}

/** Les vues de la petite Terre, côte à côte (vue i = angle i·360°/SPRITE.vues). */
async function assemblerSprite(): Promise<void> {
  const dossier = path.join(CACHE, 'frames', 'sprite');
  verifierImages(dossier, SPRITE.vues);
  const vues: Buffer[] = [];
  for (let i = 1; i <= SPRITE.vues; i++) {
    const f = path.join(dossier, nomImage(i));
    const m = await sharp(f).metadata();
    if (m.width !== SPRITE.cote || m.height !== SPRITE.cote || m.channels !== 4) throw new Error(`${f} : ${m.width}×${m.height}×${m.channels}, ${SPRITE.cote}×${SPRITE.cote}×4 attendu`);
    vues.push(readFileSync(f));
  }
  const fichier = path.join(WEB, 'public/intro/logo-terre.webp');
  await sharp({ create: { width: SPRITE.cote * SPRITE.vues, height: SPRITE.cote, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(vues.map((input, i) => ({ input, left: i * SPRITE.cote, top: 0 })))
    .webp({ quality: 88, alphaQuality: 90 }).toFile(fichier);
  console.log(`${fichier} : ${statSync(fichier).size} o`);
}

/** L'aperçu avec ses bulles, par cadrage ; chaque bulle reste à l'ancre de son apparition. */
async function apercuBulles(): Promise<void> {
  const ancres = JSON.parse(readFileSync(path.join(WEB, 'public/intro/ancres.json'), 'utf8')) as Ancres;
  const sortie = path.join(CACHE, 'video-apercu'), journaux = path.join(CACHE, 'journaux-encode', 'apercu');
  mkdirSync(sortie, { recursive: true });
  mkdirSync(journaux, { recursive: true });
  for (const c of ['portrait', 'paysage'] as const) {
    const dossier = path.join(CACHE, 'frames', 'apercu', c);
    verifierImages(dossier, IMAGES_MAITRE);
    const { width, height } = await sharp(path.join(dossier, nomImage(1))).metadata();
    const entrees: string[] = [], poses: PoseBulle[] = [];
    for (const [i, b] of bullesApercu().entries()) {
      const ancre = ancreTemoin(ancres, c, b.bulle, BULLES[b.bulle].apparait);
      if (!ancre) throw new Error(`${c} : pas d'ancre « ${b.bulle} » à ${BULLES[b.bulle].apparait} s dans ancres.json`);
      const { svg, pointe } = bulleSvg(b.texte, REFERENCES[c].echelle);
      const png = path.join(sortie, `bulle-${c}-${i}.png`);
      await sharp(Buffer.from(svg)).png().toFile(png);
      entrees.push('-i', png);
      poses.push({ x: ancre[0] - pointe[0], y: ancre[1] - pointe[1], de: b.de, a: b.a });
    }
    const fichier = path.join(sortie, `apercu-${c}-bulles.mp4`);
    lancer('ffmpeg', [
      '-hide_banner', '-y', '-framerate', '120', '-start_number', '1', '-i', path.join(dossier, 'f_%04d.png'),
      '-f', 'lavfi', '-i', `color=c=0x${NUIT.slice(1)}:s=${width}x${height}:r=120,format=gbrp`, ...entrees,
      '-filter_complex', grapheApercu(c, poses),
      '-c:v', 'libx265', '-preset', 'medium', '-crf', '24', '-tag:v', 'hvc1', '-x265-params', 'log-level=error',
      '-movflags', '+faststart', '-an', fichier,
    ], path.join(journaux, `bulles-${c}.log`));
    console.log(`${fichier} : ${statSync(fichier).size} o`);
  }
}

/** Plafonds d'octets du budget (Task 11), depuis le manifeste ; refuse un manifeste qui ne dit plus la taille des fichiers. */
function figerPlafonds(): void {
  const m = JSON.parse(readFileSync(path.join(WEB, 'public/video/videos.json'), 'utf8')) as Manifeste;
  const faux = m.variantes.filter((v) => statSync(path.join(WEB, 'public', v.src)).size !== v.octets).map((v) => v.src);
  if (faux.length > 0) throw new Error(`videos.json périmé (${faux.join(', ')}) : relancer l'encodage`);
  const plafonds = Object.fromEntries(m.variantes.map((v) => [v.src, plafond(v.octets)]));
  const regle = `octets du ${new Date().toISOString().slice(0, 10)} arrondis au Mo supérieur (10^6), + 10 %`;
  const fichier = path.join(WEB, 'e2e-budget/plafonds-video.json');
  writeFileSync(fichier, `${JSON.stringify({ version: 1, regle, plafonds }, null, 2)}\n`);
  for (const v of m.variantes) console.log(`${v.src.padEnd(40)} ${String(v.octets).padStart(10)} o → plafond ${plafonds[v.src]}`);
  console.log(fichier);
}

if (source !== undefined) {
  const ids = opts.variantes?.split(',').map((x) => x.trim()).filter(Boolean);
  const inconnus = (ids ?? []).filter((id) => !SORTIES.some((s) => idVariante(s) === id));
  if (inconnus.length > 0) throw new Error(`variantes inconnues : ${inconnus.join(', ')} (connues : ${SORTIES.map(idVariante).join(', ')})`);
  await encoder(source, ids ? SORTIES.filter((s) => ids.includes(idVariante(s))) : SORTIES);
}
if (opts.sprite) await assemblerSprite();
if (opts.bulles) await apercuBulles();
if (opts.plafonds) figerPlafonds();
