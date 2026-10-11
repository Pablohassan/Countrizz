/**
 * Lanceur de la scène Blender de l'intro (spec intro vidéo §2.4, §2.7) :
 *   npm run intro:temoins  — les instants témoins à pleine qualité (temps par image, matière) ;
 *   npm run intro:apercu   — toute l'intro en basse qualité (rythme) ;
 *   npm run intro:rendu    — le rendu final des deux cadrages (refusé sous 15 Go libres) ;
 *   npm run intro:sprite   — les 24 vues de la petite Terre du titre (sans clés).
 * Options après « -- » : --cadrage portrait|paysage (les deux sinon), --images 1,600, --echelle 25, --echantillons 32,
 * --neuf (efface les images déjà rendues ; sinon le rendu reprend où il s'était arrêté).
 * Vérifie que les sources (`npm run intro:sources`) et les clés (`npm run intro:keys`) sont à jour, lance
 * `Blender -b --factory-startup -P scripts/intro/blender/rendre.py -- …` cadrage par cadrage, garde tout son journal dans
 * `.cache/journal-<mode>-<cadrage>.log` et s'arrête si Cycles ne calcule pas sur le GPU (Metal).
 */
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, statfsSync, statSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { Cadrage } from '../../src/intro/temps';
import { argumentsBlender, lireDemande, perime, peripherique, refusDisque, type Demande } from './lib/lanceur';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(ICI, '../..');
const CACHE = path.join(ICI, '.cache');
const RENDRE = path.join(ICI, 'blender', 'rendre.py');
const BLENDER = process.env.BLENDER ?? '/Applications/Blender.app/Contents/MacOS/Blender';

const date = (f: string): number | null => (existsSync(f) ? statSync(f).mtimeMs : null);
/** Dates des fichiers (chemins depuis web/) qui existent : ceux qui fabriquent une entrée. */
const dates = (...fichiers: string[]) =>
  fichiers.map((f) => path.join(WEB, f)).filter((f) => existsSync(f)).map((f) => ({ chemin: path.relative(WEB, f), mtimeMs: statSync(f).mtimeMs }));

function verifierEntrees(d: Demande): void {
  const erreurs: string[] = [];
  const s = perime(date(path.join(CACHE, 'sources', 'sources.json')), 'sources/sources.json',
    dates('scripts/intro/sources.ts', 'scripts/intro/lib/peinture.ts', 'scripts/intro/lib/terre.ts'));
  if (s) erreurs.push(`${s} — lancer npm run intro:sources`);
  for (const c of d.cadrages) {
    const k = perime(date(path.join(CACHE, `keys-${c}.json`)), `keys-${c}.json`, dates('src/intro/temps.ts', 'src/intro/timeline.ts',
      'src/intro/cadrages.ts', 'scripts/intro/export-keys.ts', 'scripts/intro/lib/axes.ts', 'scripts/intro/lib/terre.ts',
      'scripts/intro/.cache/sources/reperes.json', 'scripts/intro/.cache/sources/frontiere.json'));
    if (k) erreurs.push(`${k} — lancer npm run intro:keys`);
  }
  if (erreurs.length) throw new Error(erreurs.join('\n'));
}

/** Un passage de Blender pour un cadrage (null : le sprite) ; rejette si Blender échoue ou si Cycles n'est pas sur le GPU. */
function lancer(d: Demande, c: Cadrage | null): Promise<void> {
  const nomJournal = path.join(CACHE, `journal-${d.mode}${c ? `-${c}` : ''}.log`);
  const args = argumentsBlender(d, c, RENDRE, CACHE);
  const journal = createWriteStream(nomJournal, { flags: 'a' });
  journal.write(`\n=== ${new Date().toISOString()} ${BLENDER} ${args.join(' ')}\n`);
  const p = spawn(BLENDER, args, { cwd: WEB, stdio: ['ignore', 'pipe', 'pipe'] });
  let metal = false, horsGpu = '', rendues = 0;
  for (const flux of [p.stdout, p.stderr]) {
    createInterface({ input: flux }).on('line', (l) => {
      journal.write(l + '\n');
      const per = peripherique(l);
      if (per === 'metal' && !metal) { metal = true; console.log(l.trim()); }
      if (per === 'autre' && !horsGpu) { horsGpu = l.trim(); p.kill(); }
      if (l.startsWith('[rendre] f_')) rendues++;
      if (l.startsWith('[rendre]') || /Error|Traceback/.test(l)) console.log(l);
    });
  }
  return new Promise((ok, echec) => {
    p.on('error', echec);
    p.on('close', (code) => {
      journal.end();
      if (horsGpu) echec(new Error(`Cycles hors du GPU : ${horsGpu}`));
      else if (code !== 0) echec(new Error(`Blender a rendu le code ${code} — journal : ${nomJournal}`));
      else if (rendues > 0 && !metal) echec(new Error(`aucune ligne « Path tracing on: … (Metal) » — journal : ${nomJournal}`));
      else ok();
    });
  });
}

async function main(): Promise<void> {
  const d = lireDemande(process.argv.slice(2));
  mkdirSync(CACHE, { recursive: true });
  const { bavail, bsize } = statfsSync(CACHE);
  const refus = refusDisque(bavail * bsize, d.mode);
  if (refus) throw new Error(refus);
  verifierEntrees(d);
  for (const c of d.mode === 'sprite' ? [null] : d.cadrages) {
    const t0 = Date.now();
    await lancer(d, c);
    console.log(`[blender] ${d.mode}${c ? ` ${c}` : ''} : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
}

main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
