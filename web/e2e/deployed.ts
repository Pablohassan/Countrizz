import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Fichiers que les specs lisent sur le disque (public/data) et que le site sert : ils doivent être les mêmes. */
const SHARED = ['data/countries.json', 'data/imagery.json', 'data/borders.json'] as const;
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
}

export default async function globalSetup(): Promise<void> {
  const target = process.env.E2E_BASE_URL ?? 'https://countrizz.fr/';
  if (!target.includes('localhost')) await checkDeployed(target.endsWith('/') ? target : `${target}/`);
}
