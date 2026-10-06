// Contrôle des patchs image (hors dépôt) contre l'index versionné web/public/data/imagery.json :
// chaque pays × chaque taille doit exister avec la taille et le sha256 attendus, et rien d'autre ne doit traîner.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const nomPatch = (cca3, taille) => `${cca3.toLowerCase()}-${taille}.ktx2`;

export function verifierPatchs(dossierImg, index) {
  const erreurs = [];
  const attendus = new Set();
  for (const [cca3, pays] of Object.entries(index.countries)) {
    for (const taille of index.sizes) {
      const nom = nomPatch(cca3, taille);
      attendus.add(nom);
      const meta = pays.files?.[String(taille)];
      const chemin = join(dossierImg, nom);
      if (!meta) { erreurs.push(`${nom} : absent de imagery.json`); continue; }
      if (!existsSync(chemin)) { erreurs.push(`${nom} : fichier manquant`); continue; }
      const octets = readFileSync(chemin);
      if (octets.length !== meta.bytes) erreurs.push(`${nom} : ${octets.length} octets au lieu de ${meta.bytes}`);
      if (createHash('sha256').update(octets).digest('hex') !== meta.sha256) erreurs.push(`${nom} : sha256 différent`);
    }
  }
  for (const f of existsSync(dossierImg) ? readdirSync(dossierImg) : []) if (!attendus.has(f)) erreurs.push(`${f} : fichier en trop`);
  return { attendus: attendus.size, erreurs };
}
