import { BULLES, BULLES_RANGE, CADRAGES, type Bulle, type Cadrage } from '../../../src/intro/temps';
import { NUIT } from './encodage';

/**
 * Aperçu à juger avec ses bulles (spec intro vidéo §3.3 : le rythme des bulles se juge sur la prévisualisation, l'intro
 * peut gagner ≈ 1 s). Les vraies bulles sont du HTML (Task 10) : ici une esquisse posée sur la vidéo, à l'ancre de
 * l'instant d'apparition, la question puis la réponse. Pas un livrable.
 */

/** Une bulle dans l'aperçu : texte (null = drapeau tricolore), fenêtre d'affichage (s). */
export interface BulleApercu { bulle: Bulle; texte: string | null; de: number; a: number }

const QUESTIONS: Record<Bulle, string> = { capitale: 'Capitale ?', pays: 'Pays ?', drapeau: 'Drapeau ?' };
const REPONSES: Record<Bulle, string | null> = { capitale: 'Paris', pays: 'France', drapeau: null };

/** Les six bulles : chaque question de son apparition à son retournement, puis la réponse jusqu'au rangement. */
export function bullesApercu(): BulleApercu[] {
  return (Object.keys(BULLES) as Bulle[]).flatMap((b) => [
    { bulle: b, texte: QUESTIONS[b], de: BULLES[b].apparait, a: BULLES[b].retourne },
    { bulle: b, texte: REPONSES[b], de: BULLES[b].retourne, a: BULLES_RANGE },
  ]);
}

/**
 * Bulle en SVG à l'échelle `e` (px vidéo par px CSS, `REFERENCES[cadrage].echelle`) : cartouche crème cerné de nuit,
 * texte en 20 px CSS (Arial Black), queue en bas à gauche ; `pointe` = bout de la queue, à poser sur l'ancre.
 */
export function bulleSvg(texte: string | null, e: number): { svg: string; pointe: [number, number] } {
  const H0 = 44 * e, H = H0 + 14 * e;
  const W = texte === null ? 72 * e : (24 + 0.72 * 20 * texte.length) * e;
  const contenu = texte === null
    ? ['#2b55c9', '#fff8ec', '#e8413a'].map((c, i) => `<rect x="${(18 + 12 * i) * e}" y="${10 * e}" width="${12 * e}" height="${24 * e}" fill="${c}"/>`).join('')
    : `<text x="${W / 2}" y="${H0 / 2 + 7 * e}" font-size="${20 * e}" text-anchor="middle" font-family="Arial Black" fill="${NUIT}">${texte}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(W)}" height="${Math.ceil(H + 3 * e)}">`
    + `<path d="M${14 * e} ${H0 - 2 * e} L${8 * e} ${H} L${30 * e} ${H0 - 2 * e} Z" fill="#fff8e7" stroke="${NUIT}" stroke-width="${3 * e}" stroke-linejoin="round"/>`
    + `<rect x="${1.5 * e}" y="${1.5 * e}" width="${W - 3 * e}" height="${H0 - 3 * e}" rx="${12 * e}" fill="#fff8e7" stroke="${NUIT}" stroke-width="${3 * e}"/>`
    + `${contenu}</svg>`;
  return { svg, pointe: [8 * e, H] };
}

/** Coin haut-gauche (px vidéo) de chaque bulle et sa fenêtre, dans l'ordre des entrées ffmpeg 2, 3, … */
export interface PoseBulle { x: number; y: number; de: number; a: number }

/**
 * Graphe de l'aperçu à juger : nuit, une image sur deux (60 i/s), cadrage plein, puis chaque bulle superposée pendant
 * sa fenêtre [de, a[ ; HEVC Main 8 bits (lu par QuickTime).
 */
export function grapheApercu(c: Cadrage, poses: PoseBulle[]): string {
  const { width, height } = CADRAGES[c];
  const etapes = [`[1][0]overlay=format=gbrp:shortest=1,fps=60,scale=w=${width}:h=${height}:flags=lanczos[v0]`];
  poses.forEach((p, i) => etapes.push(
    `[v${i}][${i + 2}]overlay=format=gbrp:x=${Math.round(p.x)}:y=${Math.round(p.y)}:enable='gte(t,${p.de})*lt(t,${p.a})'[v${i + 1}]`));
  etapes.push(`[v${poses.length}]scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,`
    + 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv');
  return etapes.join(';');
}
