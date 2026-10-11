/**
 * Avancement d'un rendu Blender lancé en arrière-plan (`npm run intro:apercu` ou `intro:rendu`) : images écrites par
 * cadrage et temps restant, estimé avec les secondes par image du dernier passage de `.cache/journal-<mode>-<cadrage>.log`
 * (`lib/mesure.ts`) ; pour le rendu final, un cadrage pas encore commencé prend la mesure des témoins (mêmes réglages).
 * Usage : `npm run intro:avancement -- apercu|rendu`.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireMesures } from './lib/mesure';
import { IMAGES_MAITRE } from './lib/temoins';

const CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), '.cache');
const mode = process.argv[2];
if (mode !== 'apercu' && mode !== 'rendu') throw new Error('usage : npm run intro:avancement -- apercu|rendu');

const ici = lireMesures(CACHE, mode), temoins = mode === 'rendu' ? lireMesures(CACHE, 'temoins') : {};
let reste = 0, inconnu = false;
for (const c of ['portrait', 'paysage'] as const) {
  const d = path.join(CACHE, 'frames', mode, c);
  const faites = existsSync(d) ? readdirSync(d).filter((f) => /^f_\d{4}\.png$/.test(f)).length : 0;
  const s = ici[c]?.moyenne ?? temoins[c]?.moyenne;
  if (s === undefined) inconnu ||= faites < IMAGES_MAITRE;
  else reste += (IMAGES_MAITRE - faites) * s;
  const mesure = s === undefined ? '' : `, ${s.toFixed(2)} s/image${ici[c] ? '' : ' (témoins)'}`;
  console.log(`${c} : ${faites}/${IMAGES_MAITRE} images${mesure}`);
}
console.log(`reste ≈ ${(reste / 3600).toFixed(1)} h${inconnu ? ' + un cadrage sans mesure' : ''}`);
