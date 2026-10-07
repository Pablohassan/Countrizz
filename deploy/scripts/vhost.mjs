// Vhost countrizz.fr du proxy .60 (gabarit mecapilote.fr) adapté au site, décisions de l'utilisateur du 08/10/2026 :
// - option (c) : le bloc HTTPS ne force plus de cache (les locations images / css-js / polices et leurs add_header
//   disparaissent) ; le Cache-Control du pod (deploy/web/nginx.conf) passe tel quel et, faute d'add_header local,
//   les en-têtes de sécurité du serveur restent sur ces fichiers (dette 40) ;
// - proxy_max_temp_file_size 0 dans le location / du bloc HTTPS : les gros KTX2 ne passent pas par des fichiers
//   temporaires sur la carte SD du proxy (dette 13).
// Tout le reste est conservé à l'octet près. Un vhost qui ne ressemble pas au gabarit attendu est REFUSÉ.
//   Usage : node deploy/scripts/vhost.mjs < vhost-actuel > vhost-nouveau
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HTTPS = 'listen 443 ssl http2;';
const LOCATION_SITE = '    location / {\n        proxy_pass http://192.168.1.101;\n        include snippets/proxy-params.conf;\n';
const TEMP = '        proxy_max_temp_file_size 0;   # gros KTX2 relayés sans fichier temporaire sur la carte SD (dette 13)\n';
const NOTE = "    # Cache : celui du pod (deploy/web/nginx.conf), relayé tel quel ; aucun add_header ici (dette 40).\n";

const compte = (texte, motif) => texte.split(motif).length - 1;

export function vhostCountrizz(actuel) {
  if (compte(actuel, HTTPS) !== 1) throw new Error(`vhost inattendu : « ${HTTPS} » doit apparaître une fois`);
  const coupe = actuel.indexOf(HTTPS);
  const http = actuel.slice(0, coupe);
  let https = actuel.slice(coupe);
  if (compte(https, LOCATION_SITE) !== 1) throw new Error('vhost inattendu : location / du bloc HTTPS vers 192.168.1.101 introuvable ou multiple');
  // Locations de cache du gabarit (expressions régulières sur les extensions), sans accolade interne.
  https = https.replace(/\n\n    location ~\*[^{\n]*\{[^}]*\}/g, '');
  if (!https.includes(TEMP)) https = https.replace(LOCATION_SITE, LOCATION_SITE + TEMP);
  if (!https.includes(NOTE)) https = https.replace(LOCATION_SITE, NOTE + LOCATION_SITE);
  if (/^\s*add_header|^\s*location ~\*/m.test(https)) throw new Error('vhost inattendu : il reste un add_header ou une location de cache');
  return http + https;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(vhostCountrizz(readFileSync(0, 'utf8')));
