import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CADRAGES } from '../../../src/intro/temps';

/**
 * Temps de rendu mesuré dans les journaux du lanceur (`.cache/journal-<mode>-<cadrage>.log`, sortie complète de
 * `Blender -b`, un passage après l'autre), et règle des échantillons du rendu final (spec intro vidéo §2.4 et §9 : la
 * qualité se règle sur la mesure, pas l'inverse ; décision D9 du plan). Chaque passage commence par une ligne
 * `=== <date ISO> <commande>` ; chaque image enregistrée écrit une ligne horodatée depuis le lancement de Blender :
 *   `00:24.509  render           | Saved: '/…/frames/temoins/portrait/f_0429.png'`
 */

/** Le dernier passage d'un journal (tout le texte s'il n'a pas d'en-tête `=== `). */
export function dernierPassage(journal: string): string {
  const i = journal.lastIndexOf('\n=== ');
  return i >= 0 ? journal.slice(i + 1) : journal;
}

/** Horodatage (s depuis le lancement) et chemin de chaque image enregistrée, dans l'ordre du journal. */
export function enregistrements(journal: string): { s: number; chemin: string }[] {
  const out: { s: number; chemin: string }[] = [];
  for (const ligne of journal.split('\n')) {
    const m = /^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\s+render\s+\|\s+Saved: '(.+)'\s*$/.exec(ligne);
    if (m) out.push({ s: Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]), chemin: m[4]! });
  }
  return out;
}

export interface Mesure { moyenne: number; mediane: number; ecarts: number }

/**
 * Secondes par image pour chaque dossier (le cadrage) : écarts entre deux enregistrements successifs du même dossier.
 * La première image d'un dossier n'a pas d'écart : elle porte le chargement des noyaux et la construction de la scène,
 * que le rendu final ne paie qu'une fois.
 */
export function tempsParImage(journal: string): Record<string, Mesure> {
  const parDossier = new Map<string, number[]>();
  for (const { s, chemin } of enregistrements(journal)) {
    const d = path.basename(path.dirname(chemin));
    parDossier.set(d, [...(parDossier.get(d) ?? []), s]);
  }
  const out: Record<string, Mesure> = {};
  for (const [d, temps] of parDossier) {
    const e = temps.slice(1).map((s, i) => s - temps[i]!).sort((a, b) => a - b);
    if (e.length === 0) continue;
    out[d] = { moyenne: e.reduce((a, b) => a + b, 0) / e.length, mediane: e[Math.floor(e.length / 2)]!, ecarts: e.length };
  }
  return out;
}

/** Mesures de chaque cadrage d'un mode, d'après le dernier passage de `<cache>/journal-<mode>-<cadrage>.log`. */
export function lireMesures(cache: string, mode: string): Record<string, Mesure> {
  const out: Record<string, Mesure> = {};
  for (const c of Object.keys(CADRAGES)) {
    const f = path.join(cache, `journal-${mode}-${c}.log`);
    if (existsSync(f)) Object.assign(out, tempsParImage(dernierPassage(readFileSync(f, 'utf8'))));
  }
  return out;
}

/**
 * Durée du rendu final des deux cadrages : `heures = images × (s_portrait + s_paysage) / 3600`, avec les MOYENNES des
 * témoins (les instants lourds y sont nombreux : estimation prudente). Au-delà de `cibleH`, échantillons proposés par
 * proportion, arrondis au multiple de 16 inférieur (au moins 16) : `S' = 16 × ⌊S × cibleH / heures / 16⌋`. La part fixe
 * d'une image (débruitage, synchronisation, enregistrement) ne diminue pas avec S : `S'` se vérifie en rendant de
 * nouveau les témoins.
 */
export function estimation(
  sParImage: number[], images: number, echantillons: number, cibleH = 10,
): { heures: number; echantillons: number } {
  const heures = (images * sParImage.reduce((a, b) => a + b, 0)) / 3600;
  if (heures <= cibleH) return { heures, echantillons };
  return { heures, echantillons: Math.max(16, 16 * Math.floor((echantillons * cibleH) / heures / 16)) };
}
