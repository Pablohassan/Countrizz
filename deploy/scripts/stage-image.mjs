// Prépare .image-staging/ pour deploy/web/Dockerfile : site/ (dist sans les patchs image ni les vidéos), video/ (vidéos de
// l'intro et leur manifeste), puis img-<taille>-<k>/ : les photos de chaque taille réparties sur des calques Docker de moins
// de 150 Mo (CALQUES ; un COPY chacun dans le Dockerfile). Refuse de continuer si un patch manque ou diffère de
// imagery.json, ou si les vidéos ne tiennent pas dans un calque.
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
/** Calques par taille de photos (Dockerfile : un COPY par calque) ; 2048 : 156 120 067 octets estimés le 15/10, au-delà d'un calque. */
const CALQUES = { 1024: 1, 2048: 2 };
for (const taille of index.sizes) {
  const n = CALQUES[taille];
  if (!n) { console.error(`Taille ${taille} sans calque prévu (CALQUES, Dockerfile).`); process.exit(1); }
  const dossiers = Array.from({ length: n }, (_, k) => join(out, `img-${taille}-${k}`));
  for (const d of dossiers) mkdirSync(d, { recursive: true });
  const octets = new Array(n).fill(0);
  let k = 0;
  for (const f of readdirSync(img).filter((nom) => nom.endsWith(`-${taille}.ktx2`)).sort()) {
    const s = statSync(join(img, f)).size;
    if (octets[k] + s >= CALQUE_MAX) k++;
    if (k >= n) { console.error(`Photos ${taille} : au-delà de ${n} calques de ${CALQUE_MAX} octets ; en ajouter un (CALQUES, Dockerfile).`); process.exit(1); }
    copyFileSync(join(img, f), join(dossiers[k], f));
    octets[k] += s;
  }
  dossiers.forEach((d, i) => console.log(`img-${taille}-${i} : ${readdirSync(d).length} fichiers, ${octets[i]} octets`));
}
console.log(`Patchs image vérifiés : ${attendus} fichiers conformes à imagery.json.`);
