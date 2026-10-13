import path from 'node:path';
import { CADRAGES, INTRO, IPS_MAITRE, type Cadrage } from '../../../src/intro/temps';
import { idVariante, type Codec, type Ips, type Manifeste, type Taille } from '../../../src/intro/videos';
import { IMAGES_MAITRE } from './temoins';

/**
 * Ce que la fabrique encode (spec intro vidéo §2.5, décisions D2 et D7 du plan) : 10 vidéos, réglages de débit, graphe
 * ffmpeg, contrôles et manifeste. Fonctions pures : `encode.ts` les exécute.
 */

/** Une vidéo à produire. */
export interface Sortie { cadrage: Cadrage; taille: Taille; ips: Ips; codec: Codec; width: number; height: number }

/** Portrait léger (D2) : 2/3 du plein, pour les décodeurs qui ne tiennent pas le niveau 5 (1080 × 2340). */
export const LEGER = { width: 720, height: 1560 } as const;

const CODECS: Codec[] = ['av1', 'hevc'];
const GABARITS: Omit<Sortie, 'codec'>[] = [
  { cadrage: 'portrait', taille: 'plein', ips: 120, ...CADRAGES.portrait },
  { cadrage: 'portrait', taille: 'plein', ips: 60, ...CADRAGES.portrait },
  { cadrage: 'portrait', taille: 'leger', ips: 60, ...LEGER },
  { cadrage: 'paysage', taille: 'plein', ips: 120, ...CADRAGES.paysage },
  { cadrage: 'paysage', taille: 'plein', ips: 60, ...CADRAGES.paysage },
];
/** Les 10 vidéos, dans l'ordre du manifeste. */
export const SORTIES: Sortie[] = GABARITS.flatMap((g) => CODECS.map((codec) => ({ ...g, codec })));

/** Nuit de l'accueil (`--nuit`), posée sous les images transparentes. */
export const NUIT = '#16173a';
export const NUIT_RGB = [22, 23, 58] as const;
/** Écart toléré sur le fond décodé (spec §8 : ± 3). */
export const FOND_TOLERANCE = 3;

export interface Reglage { crf: number; maxKbps: number }
/**
 * Débit : CRF (qualité visée) et plafond de débit crête (kb/s : `mbr` de SVT-AV1, VBV de x265).
 * Plafond : un lien 4G médiocre de 8 Mb/s, dont la moitié pour la vidéo (l'autre au globe, qui se charge pendant
 * l'intro) → 4000 kb/s pour toutes les variantes. CRF de départ : AV1 10 bits 30, HEVC 22 (reconnaissance ffmpeg).
 * Règle de réglage, appliquée une fois sur le rendu final (Task 8) d'après le débit moyen mesuré `d` (ffprobe) :
 *  - d > 0,9 × maxKbps : le plafond mord, la qualité est bornée par le lien visé ; on garde, revue à l'œil ;
 *  - d < 0,5 × maxKbps : de la marge, CRF − 2 (meilleure qualité) et ré-encodage de cette variante ;
 *  - sinon : on garde.
 * `encode.ts` affiche ce verdict pour chaque vidéo (`verdictDebit`).
 */
export const REGLAGES: Record<string, Reglage> = {
  'portrait-plein-120-av1': { crf: 28, maxKbps: 4000 },
  'portrait-plein-120-hevc': { crf: 20, maxKbps: 4000 },
  'portrait-plein-60-av1': { crf: 28, maxKbps: 4000 },
  'portrait-plein-60-hevc': { crf: 20, maxKbps: 4000 },
  'portrait-leger-60-av1': { crf: 28, maxKbps: 4000 },
  'portrait-leger-60-hevc': { crf: 20, maxKbps: 4000 },
  'paysage-plein-120-av1': { crf: 28, maxKbps: 4000 },
  'paysage-plein-120-hevc': { crf: 20, maxKbps: 4000 },
  'paysage-plein-60-av1': { crf: 28, maxKbps: 4000 },
  'paysage-plein-60-hevc': { crf: 20, maxKbps: 4000 },
};

export function verdictDebit(kbps: number, r: Reglage): 'plafond' | 'marge' | 'ok' {
  return kbps > 0.9 * r.maxKbps ? 'plafond' : kbps < 0.5 * r.maxKbps ? 'marge' : 'ok';
}

/**
 * Images d'une vidéo encodée depuis `n` images maîtres. `fps=60` garde une image sur deux à partir de la première ;
 * quand `n` est impair, la dernière (instant `FIN`, 1/120 s après l'avant-dernière gardée) tombe. Mesuré : 241 → 120,
 * 2377 → 1188.
 */
export function imagesAttendues(ips: Ips, n = IMAGES_MAITRE): number {
  return ips === IPS_MAITRE ? n : Math.floor(n / 2);
}

export function nomFichier(s: Pick<Sortie, 'cadrage' | 'taille' | 'ips' | 'codec'>): string {
  return `intro-${s.cadrage}${s.taille === 'leger' ? '-leger' : ''}-${s.ips}.${s.codec}.mp4`;
}

export function nomImage(n: number): string {
  return `f_${String(n).padStart(4, '0')}.png`;
}

/**
 * Arguments ffmpeg d'une vidéo. Entrée : les PNG `f_0001.png…` de `dossier` (taille `width × height`), à 120 i/s.
 * Graphe vérifié (reconnaissance ffmpeg) : nuit `color` forcée en gbrp, sinon elle n'est pas exacte ; superposition
 * en gbrp et en alpha droit (celui des PNG de Blender 5.0.1 : bord d'une sphère rouge lu (255, 0, 0) sous α 76 à 207) ;
 * une image sur deux par `fps=60` (jamais `select` sans `-r`) ; conversion bt709 limitée, mise à l'échelle comprise ;
 * puis `setparams`, sans lequel ffmpeg 8 perd primaires et transfert dans le fichier.
 */
export function argsFfmpeg(s: Sortie, e: { dossier: string; width: number; height: number }, fichier: string): string[] {
  const r = REGLAGES[idVariante(s)];
  if (!r) throw new Error(`pas de réglage pour ${idVariante(s)}`);
  const cadence = s.ips === IPS_MAITRE ? '' : `,fps=${s.ips}`;
  const format = s.codec === 'av1' ? 'yuv420p10le' : 'yuv420p';
  const graphe = `[1][0]overlay=format=gbrp:shortest=1${cadence},`
    + `scale=w=${s.width}:h=${s.height}:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt709:out_range=tv,`
    + `format=${format},setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv`;
  const gop = String(2 * s.ips);   // une image clé toutes les 2 s (`?introT=` s'y place vite)
  const codec = s.codec === 'av1'
    ? ['-c:v', 'libsvtav1', '-preset', '5', '-crf', String(r.crf), '-g', gop, '-svtav1-params', `mbr=${r.maxKbps}`]
    : ['-c:v', 'libx265', '-preset', 'slow', '-crf', String(r.crf), '-g', gop, '-tag:v', 'hvc1',
      '-x265-params', `log-level=error:vbv-maxrate=${r.maxKbps}:vbv-bufsize=${2 * r.maxKbps}`];
  return [
    '-hide_banner', '-y',
    '-framerate', String(IPS_MAITRE), '-start_number', '1', '-i', path.join(e.dossier, 'f_%04d.png'),
    '-f', 'lavfi', '-i', `color=c=0x${NUIT.slice(1)}:s=${e.width}x${e.height}:r=${IPS_MAITRE},format=gbrp`,
    '-filter_complex', graphe,
    ...codec,
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', '-an', fichier,
  ];
}

/** Ce que ffprobe dit du flux vidéo (`-show_entries stream=…`). */
export interface Sonde {
  codec_name: string; codec_tag_string: string; width: number; height: number; pix_fmt: string;
  r_frame_rate: string; nb_frames: string; color_range?: string; color_space?: string;
  color_primaries?: string; color_transfer?: string; bit_rate: string;
}

/** Écarts entre une vidéo encodée et ce qui est attendu ; vide = conforme. */
export function controlerSonde(s: Sortie, p: Sonde, images: number): string[] {
  const attendu: [string, string | number, string | number][] = [
    ['codec', p.codec_name, s.codec === 'av1' ? 'av1' : 'hevc'],
    ['étiquette', p.codec_tag_string, s.codec === 'av1' ? 'av01' : 'hvc1'],
    ['format', p.pix_fmt, s.codec === 'av1' ? 'yuv420p10le' : 'yuv420p'],
    ['largeur', p.width, s.width],
    ['hauteur', p.height, s.height],
    ['cadence', p.r_frame_rate, `${s.ips}/1`],
    ['images', Number(p.nb_frames), images],
    ['plage', p.color_range ?? '(absente)', 'tv'],
    ['matrice', p.color_space ?? '(absente)', 'bt709'],
    ['primaires', p.color_primaries ?? '(absentes)', 'bt709'],
    ['transfert', p.color_transfer ?? '(absent)', 'bt709'],
  ];
  return attendu.filter(([, lu, voulu]) => lu !== voulu).map(([nom, lu, voulu]) => `${nom} : ${lu} au lieu de ${voulu}`);
}

/**
 * Points de fond pour le contrôle de couleur : sur une grille de pas `pas`, ceux dont le carré de côté 2·marge + 1 est
 * entièrement transparent sur l'image source (le sous-échantillonnage de la chrominance ne mêle rien d'autre).
 */
export function pointsDeFond(alpha: Uint8Array, width: number, height: number, pas = 60, marge = 16): [number, number][] {
  const out: [number, number][] = [];
  for (let y = marge; y < height - marge; y += pas) {
    for (let x = marge; x < width - marge; x += pas) {
      let vide = true;
      for (let j = y - marge; vide && j <= y + marge; j++) {
        for (let i = x - marge; i <= x + marge; i++) if (alpha[j * width + i] !== 0) { vide = false; break; }
      }
      if (vide) out.push([x, y]);
    }
  }
  return out;
}

/** Écarts du fond décodé (rgb24, `width` px par ligne) à la nuit, aux points donnés. */
export function controlerFond(rgb: Uint8Array, width: number, points: [number, number][]): string[] {
  const ecarts: string[] = [];
  for (const [x, y] of points) {
    const o = (y * width + x) * 3;
    const lu = [rgb[o]!, rgb[o + 1]!, rgb[o + 2]!];
    if (lu.some((v, k) => Math.abs(v - NUIT_RGB[k]!) > FOND_TOLERANCE)) ecarts.push(`(${x}, ${y}) : ${lu.join(',')}`);
  }
  return ecarts;
}

/**
 * Plafond d'octets d'une vidéo pour le test de budget (spec §7 : fixé après mesure) : la taille mesurée arrondie au Mo
 * supérieur (10⁶ octets), plus 10 %. Un ré-encodage qui grossit au-delà fait échouer le budget : on décide alors.
 */
export function plafond(octets: number): number {
  return Math.round(Math.ceil(octets / 1e6) * 1e6 * 1.1);
}

/** Le manifeste du lecteur ; `type` vient de la chaîne de codec lue dans chaque fichier. */
export function manifeste(faites: { s: Sortie; octets: number; codecs: string }[]): Manifeste {
  return {
    version: 1,
    duree: INTRO.FIN,
    affiches: { portrait: '/intro/affiche-portrait.webp', paysage: '/intro/affiche-paysage.webp' },
    variantes: faites.map(({ s, octets, codecs }) => ({
      cadrage: s.cadrage, taille: s.taille, ips: s.ips, codec: s.codec,
      src: `/video/${nomFichier(s)}`, type: `video/mp4; codecs="${codecs}"`,
      width: s.width, height: s.height, octets,
    })),
  };
}
