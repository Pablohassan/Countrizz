import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Manifeste } from '../src/intro/videos';

/**
 * Fichiers que les specs lisent sur le disque (public/) et que le site sert : ils doivent être les mêmes. Le manifeste
 * des vidéos et les ancres des questions en sont : intro.spec.ts contrôle les questions d'après eux.
 */
const SHARED = ['data/countries.json', 'data/imagery.json', 'data/borders.json', 'video/videos.json', 'intro/ancres.json'] as const;
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/**
 * Préparation des e2e sur un site déployé : les pages de test existent, et le site sert les données de ce dépôt (sinon les
 * specs compareraient l'écran à d'autres contours). Lève une erreur qui dit quoi faire.
 */
export async function checkDeployed(baseURL: string, root = 'public'): Promise<void> {
  for (const page of ['probe.html', 'calibrate.html']) {
    const r = await fetch(new URL(page, baseURL));
    if (!r.ok) throw new Error(`${baseURL}${page} : HTTP ${r.status} — la version déployée n'a pas les pages de test (déployer une image construite depuis ce dépôt)`);
  }
  for (const file of SHARED) {
    const r = await fetch(new URL(file, baseURL));
    if (!r.ok) throw new Error(`${baseURL}${file} : HTTP ${r.status}`);
    const remote = sha(new Uint8Array(await r.arrayBuffer()));
    const local = sha(readFileSync(path.join(root, file)));
    if (remote !== local) throw new Error(`${file} : le site ${baseURL} ne sert pas la version de ce dépôt — déployer d'abord, ou E2E_BASE_URL=http://localhost:5174 pour le serveur local`);
  }
  await checkVideos(baseURL, root);
}

/**
 * Les vidéos de l'intro (manifeste de ce dépôt) : servies entières en `video/mp4`, à leur taille, et par plages d'octets
 * (Safari les exige, spec intro vidéo §4) — HEAD, puis les deux premiers octets.
 */
export async function checkVideos(baseURL: string, root = 'public'): Promise<void> {
  const m = JSON.parse(readFileSync(path.join(root, 'video/videos.json'), 'utf8')) as Manifeste;
  for (const v of m.variantes) {
    const url = new URL(v.src.slice(1), baseURL);
    const h = await fetch(url, { method: 'HEAD' });
    const type = h.headers.get('content-type') ?? '', plages = h.headers.get('accept-ranges') ?? '', octets = Number(h.headers.get('content-length'));
    if (h.status !== 200 || !type.startsWith('video/mp4') || plages !== 'bytes' || octets !== v.octets) {
      throw new Error(`${url} : HEAD ${h.status}, « ${type} », accept-ranges « ${plages} », ${octets} octets (attendu : 200, video/mp4, bytes, ${v.octets}) — déployer l'image qui porte les vidéos de ce dépôt`);
    }
    const r = await fetch(url, { headers: { range: 'bytes=0-1' } });
    await r.arrayBuffer();
    if (r.status !== 206 || r.headers.get('content-range') !== `bytes 0-1/${v.octets}`) {
      throw new Error(`${url} : plage bytes=0-1 → HTTP ${r.status}, content-range « ${r.headers.get('content-range')} » (attendu : 206, bytes 0-1/${v.octets})`);
    }
  }
}

export default async function globalSetup(): Promise<void> {
  const target = process.env.E2E_BASE_URL ?? 'https://countrizz.fr/';
  if (!target.includes('localhost')) await checkDeployed(target.endsWith('/') ? target : `${target}/`);
}
