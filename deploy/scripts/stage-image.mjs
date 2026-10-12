// Prépare .image-staging/ pour deploy/web/Dockerfile : site/ (dist sans les patchs image ni les vidéos), video/ (vidéos de
// l'intro et leur manifeste), puis img-<taille>/ par résolution (un calque Docker chacun, < 150 Mo). Refuse de continuer si
// un patch manque ou diffère de imagery.json, ou si les vidéos ne tiennent pas dans un calque.
// Usage : node deploy/scripts/stage-image.mjs [--dist web/dist] [--imagery web/public/data/imagery.json] [--out .image-staging]
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { verifierPatchs } from './patchs.mjs';

const arg = (nom, defaut) => { const i = process.argv.indexOf(nom); return i > 0 ? process.argv[i + 1] : defaut; };
const dist = arg('--dist', 'web/dist');
const index = JSON.parse(readFileSync(arg('--imagery', 'web/public/data/imagery.json'), 'utf8'));
const out = arg('--out', '.image-staging');
const img = join(dist, 'data/patches/img');
const video = join(dist, 'video');
/** Les envois de calques de plus de 150 Mo échouent. */
const CALQUE_MAX = 150_000_000;

const { attendus, erreurs } = verifierPatchs(img, index);
if (erreurs.length) {
  console.error(`Patchs image : ${erreurs.length} problème(s) sur ${attendus} fichiers attendus :\n  ${erreurs.slice(0, 20).join('\n  ')}`);
  process.exit(1);
}
const videos = existsSync(video) ? readdirSync(video) : [];
const octetsVideo = videos.reduce((s, f) => s + statSync(join(video, f)).size, 0);
if (octetsVideo >= CALQUE_MAX) {
  console.error(`Vidéos de l'intro : ${octetsVideo} octets, au-delà d'un calque (${CALQUE_MAX}) : les répartir sur deux calques.`);
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
cpSync(dist, join(out, 'site'), { recursive: true, filter: (src) => !src.startsWith(img) && !src.startsWith(video) });
// les vidéos de l'intro : leur propre calque (elles ne changent qu'avec un nouveau rendu)
mkdirSync(join(out, 'video'), { recursive: true });
for (const f of videos) copyFileSync(join(video, f), join(out, 'video', f));
console.log(`video : ${videos.length} fichiers, ${octetsVideo} octets`);
for (const taille of index.sizes) {
  const d = join(out, `img-${taille}`);
  mkdirSync(d, { recursive: true });
  for (const f of readdirSync(img).filter((n) => n.endsWith(`-${taille}.ktx2`))) copyFileSync(join(img, f), join(d, f));
  const total = readdirSync(d).reduce((s, f) => s + statSync(join(d, f)).size, 0);
  console.log(`img-${taille} : ${readdirSync(d).length} fichiers, ${total} octets`);
}
console.log(`Patchs image vérifiés : ${attendus} fichiers conformes à imagery.json.`);
