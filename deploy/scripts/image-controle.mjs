// Contrôles de l'image poussée, avant tout déploiement (usage Politika : manifeste en linux/arm64 ; règle du parc :
// images Docker Hub PUBLIQUES, tirées sans imagePullSecrets par les nœuds).
//   node deploy/scripts/image-controle.mjs <étiquette>
// 1. linux/arm64 présent (docker buildx imagetools inspect, avec les identifiants du Mac) ;
// 2. manifeste lisible SANS identifiants (HEAD anonyme, comme un nœud : 200 si publique, 401 si privée ou absente).
//    Un HEAD ne compte pas comme un tirage dans les limites de Docker Hub.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DEPOT = 'pablohassan/countrizz-web';

/** Plateformes d'après `imagetools inspect --format '{{json .Image}}'` : une image seule, ou un index par plateforme. */
export function plateformes(image) {
  if (image && typeof image.architecture === 'string') return [`${image.os}/${image.architecture}`];
  return Object.entries(image ?? {})
    .filter(([, v]) => v && typeof v.architecture === 'string')
    .map(([, v]) => `${v.os}/${v.architecture}`);
}

async function lisibleSansIdentifiants(etiquette) {
  const jeton = await fetch(`https://auth.docker.io/token?service=registry.docker.io&scope=repository:${DEPOT}:pull`);
  if (!jeton.ok) throw new Error(`jeton anonyme Docker Hub : HTTP ${jeton.status}`);
  const { token } = await jeton.json();
  const r = await fetch(`https://registry-1.docker.io/v2/${DEPOT}/manifests/${etiquette}`, {
    method: 'HEAD',
    headers: { Authorization: `Bearer ${token}`, Accept: [
      'application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json',
      'application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json'].join(', ') },
  });
  return r.status;
}

async function main(etiquette) {
  if (!etiquette) throw new Error('usage : image-controle.mjs <étiquette>');
  const image = JSON.parse(execFileSync('docker', ['buildx', 'imagetools', 'inspect', `${DEPOT}:${etiquette}`, '--format', '{{json .Image}}'], { encoding: 'utf8' }));
  const p = plateformes(image);
  if (!p.includes('linux/arm64')) throw new Error(`pas de linux/arm64 dans l'image (plateformes : ${p.join(', ') || 'aucune'})`);
  console.log(`ok   linux/arm64 (${p.join(', ')})`);
  const statut = await lisibleSansIdentifiants(etiquette);
  if (statut !== 200) throw new Error(`manifeste illisible sans identifiants (HTTP ${statut}) : dépôt privé ou étiquette absente — les nœuds ne pourraient pas tirer l'image`);
  console.log('ok   publique : lisible sans identifiants, comme par les nœuds');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch((e) => { console.error(`ÉCHEC : ${e.message}`); process.exit(1); });
}
