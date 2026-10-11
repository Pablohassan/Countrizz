/**
 * Décisions pures du lanceur de Blender (`scripts/intro/blender.ts`, spec intro vidéo §2.4) : lecture de la demande,
 * arguments de Blender, instants témoins, garde du disque, fraîcheur des entrées, périphérique annoncé par Cycles.
 */
import { CADRAGES, INTRO, IPS_MAITRE, type Cadrage } from '../../../src/intro/temps';

export type Mode = 'temoins' | 'apercu' | 'rendu' | 'sprite';
const MODES: readonly Mode[] = ['temoins', 'apercu', 'rendu', 'sprite'];

export interface Demande {
  mode: Mode;
  /** Vide pour le sprite (une seule passe, sans clés). */
  cadrages: Cadrage[];
  /** Numéros d'image (1 → t = 0) ; vide : toutes. */
  images: number[];
  /** Définition en % (remplace celle du mode dans commun.py). */
  echelle?: number;
  echantillons?: number;
  /** Efface les images déjà rendues de ce mode (sinon reprise). */
  neuf: boolean;
}

/** Espace libre exigé avant un rendu complet : ~12,8 Go de PNG pour les deux cadrages (recon fabrique), plus la marge. */
export const DISQUE_MIN_RENDU = 15e9;

/** Image n ↔ t = (n − 1) / 120 s (rendre.py, anim.py). */
export const imageA = (t: number): number => Math.round(t * IPS_MAITRE) + 1;

/**
 * Instants témoins, rendus à pleine qualité pour mesurer le temps par image et juger la matière (planche, Task 6). Les
 * instants sans constante dans temps.ts suivent timeline.ts : logo complet entre la dernière lettre (7,48 s) et le rezoom
 * (8,8 s) ; frontière à mi-déroulé (11,5 → 13,0 s) ; drapeau grandi (13,0 → 13,45 s).
 */
export const TEMOINS: readonly { nom: string; t: number }[] = [
  { nom: 'chute', t: INTRO.CHUTE + INTRO.D_CHUTE / 2 },
  { nom: 'impact', t: INTRO.CHUTE + INTRO.D_CHUTE + 0.08 },
  { nom: 'logo', t: 8.2 },
  { nom: 'frontiere', t: 12.2 },
  { nom: 'drapeau', t: 14.0 },
  { nom: 'titre', t: INTRO.ACCUEIL + 0.8 },
  { nom: 'fin', t: INTRO.FIN },
];

function entier(nom: string, v: string | undefined): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`--${nom} : entier positif attendu, reçu « ${v} »`);
  return n;
}

/** `temoins|apercu|rendu|sprite [--cadrage portrait|paysage] [--images 1,600] [--echelle 25] [--echantillons 32] [--neuf]`. */
export function lireDemande(argv: string[]): Demande {
  const [mode, ...reste] = argv;
  if (!MODES.includes(mode as Mode)) throw new Error(`mode « ${mode} » inconnu : ${MODES.join(', ')}`);
  const d: Demande = { mode: mode as Mode, cadrages: Object.keys(CADRAGES) as Cadrage[], images: [], neuf: false };
  for (let i = 0; i < reste.length; i++) {
    const opt = reste[i], val = reste[i + 1];
    if (opt === '--neuf') { d.neuf = true; continue; }
    i++;
    if (opt === '--cadrage') {
      if (!(val! in CADRAGES)) throw new Error(`cadrage « ${val} » inconnu : ${Object.keys(CADRAGES).join(', ')}`);
      d.cadrages = [val as Cadrage];
    } else if (opt === '--images') d.images = val!.split(',').map((x) => entier('images', x));
    else if (opt === '--echelle') d.echelle = entier('echelle', val);
    else if (opt === '--echantillons') d.echantillons = entier('echantillons', val);
    else throw new Error(`option « ${opt} » inconnue`);
  }
  if (d.mode === 'temoins' && d.images.length === 0) d.images = TEMOINS.map((x) => imageA(x.t));
  if (d.mode === 'sprite') d.cadrages = [];
  return d;
}

/** Ligne de commande de Blender : sans préférences, code de sortie 1 si Python lève, journal de Cycles (périphérique). */
export function argumentsBlender(d: Demande, cadrage: Cadrage | null, rendrePy: string, cache: string): string[] {
  return [
    '-b', '--factory-startup', '--python-exit-code', '1', '--debug-cycles', '-P', rendrePy, '--',
    '--mode', d.mode, ...(cadrage ? ['--cadrage', cadrage] : []), '--cache', cache,
    ...(d.images.length ? ['--images', d.images.join(',')] : []),
    ...(d.echelle ? ['--echelle', String(d.echelle)] : []),
    ...(d.echantillons ? ['--echantillons', String(d.echantillons)] : []),
    ...(d.neuf ? ['--neuf'] : []),
  ];
}

/** Message de refus si le disque manque de place pour un rendu complet, sinon null. */
export function refusDisque(libresOctets: number, mode: Mode): string | null {
  if (mode !== 'rendu' || libresOctets >= DISQUE_MIN_RENDU) return null;
  return `${(libresOctets / 1e9).toFixed(1)} Go libres : il en faut 15 Go pour un rendu complet (PNG des deux cadrages)`;
}

/** Message si `cible` (date en ms, null si absente) est plus vieille qu'une de ses sources, sinon null. */
export function perime(cible: number | null, nom: string, sources: { chemin: string; mtimeMs: number }[]): string | null {
  if (cible === null) return `${nom} absent`;
  const neuve = sources.find((s) => s.mtimeMs > cible);
  return neuve ? `${nom} plus vieux que ${neuve.chemin}` : null;
}

/** « Path tracing on: … (Metal) » (journal de --debug-cycles) → 'metal' ; un autre périphérique → 'autre'. */
export function peripherique(ligne: string): 'metal' | 'autre' | null {
  if (!ligne.includes('Path tracing on:')) return null;
  return ligne.includes('(Metal)') ? 'metal' : 'autre';
}
