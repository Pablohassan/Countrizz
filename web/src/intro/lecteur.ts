import { INTRO, INTRO_GIVE_UP_MS, LOGO_ANGLE_FIN, LOGO_TOUR_S, type Cadrage } from './temps';
import type { Manifeste, Variante } from './videos';

/**
 * Décisions du lecteur vidéo de l'intro (spec `2026-10-11-countrizz-intro-video-blender-design.md` §4), en fonctions
 * pures : cadrage, cadence, variante, passage du repère de la vidéo à l'écran (`object-fit: cover`), abandons. Les
 * questions qui naissent des objets de la vidéo sont dans `questions.ts` (§5). `Intro.tsx` les branche sur la page ;
 * tout ce qui décide se teste ici, sans navigateur.
 */

/** Le manifeste `/video/videos.json` et ses variantes (videos.ts, partagés avec la fabrique), repris pour Intro.tsx et les tests. */
export { idVariante, type Manifeste, type Variante } from './videos';
/** Pourquoi l'intro mène à l'accueil direct (spec §4). */
export type Echec = 'lecture-refusee' | 'pas-d-image' | 'erreur' | 'aucun-codec' | 'bloquee';

/** Fenêtre plus haute que large : portrait ; sinon paysage. */
export function choisirCadrage(w: number, h: number): Cadrage {
  return h > w ? 'portrait' : 'paysage';
}

// ---------- cadence ----------
/** Intervalle retenu sans mesure possible (onglet caché, aucune image) : un écran à 60 Hz. */
export const INTERVALLE_DEFAUT_MS = 16.7;
/** Écran à 100 Hz ou plus : le 120 i/s peut être servi (D3). */
export const SEUIL_120_MS = 10;

export function medianeIntervalle(echantillonsMs: number[]): number {
  if (echantillonsMs.length === 0) return INTERVALLE_DEFAUT_MS;
  const s = [...echantillonsMs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Intervalle médian entre deux images de l'écran (ms), mesuré par `requestAnimationFrame` pendant `maxMs` (≈ 0,15 s).
 * Onglet caché (rAF suspendu) : 16,7 au bout de `delaiMaxMs`, sans attendre davantage.
 */
export function mesurerIntervalle(raf: (cb: FrameRequestCallback) => number, maxMs = 150, horloge: () => number = () => performance.now(), delaiMaxMs = 500): Promise<number> {
  return new Promise((resolve) => {
    const debut = horloge(), ecarts: number[] = [];
    let precedente: number | null = null, fini = false;
    const finir = (ms: number) => { if (!fini) { fini = true; clearTimeout(garde); resolve(ms); } };
    const garde = setTimeout(() => finir(INTERVALLE_DEFAUT_MS), delaiMaxMs);
    const image = (ts: number) => {
      if (fini) return;
      if (precedente !== null) ecarts.push(ts - precedente);
      precedente = ts;
      if (horloge() - debut >= maxMs && ecarts.length > 0) finir(medianeIntervalle(ecarts));
      else raf(image);
    };
    raf(image);
  });
}

// ---------- variante ----------
export interface Capacites { decodingInfo?(c: MediaDecodingConfiguration): Promise<{ supported: boolean; smooth: boolean; powerEfficient: boolean }>; canPlayType(type: string): string }
interface Aptitude { supported: boolean; smooth: boolean; powerEfficient: boolean }

/** MediaCapabilities pour la variante ; absent ou en échec : `canPlayType` (lisible ou non, rien sur la fluidité). */
async function aptitude(v: Variante, duree: number, caps: Capacites): Promise<Aptitude> {
  if (caps.decodingInfo) {
    try {
      const bitrate = Math.max(1, Math.round((v.octets * 8) / duree));
      const r = await caps.decodingInfo({ type: 'file', video: { contentType: v.type, width: v.width, height: v.height, framerate: v.ips, bitrate } });
      return { supported: r.supported, smooth: r.smooth, powerEfficient: r.powerEfficient };
    } catch { /* type refusé par l'API : canPlayType */ }
  }
  return { supported: caps.canPlayType(v.type) !== '', smooth: false, powerEfficient: false };
}
const rang = (a: Aptitude) => (a.powerEfficient ? 3 : a.smooth ? 2 : a.supported ? 1 : 0);

/**
 * Les variantes à essayer, dans l'ordre (une par codec lisible) ; [] : aucun codec, accueil direct. Économe d'abord, puis
 * fluide, puis seulement lisible ; AV1 avant HEVC à égalité. La légère (portrait) remplace la pleine qui n'est ni fluide
 * ni économe (D2) ; le 120 i/s remplace le 60 seulement si l'écran dépasse 100 Hz et si son décodage est économe (D3).
 */
export async function choisirVariantes(m: Manifeste, cadrage: Cadrage, intervalleMs: number, caps: Capacites): Promise<Variante[]> {
  const trouver = (taille: Variante['taille'], ips: Variante['ips'], codec: Variante['codec']) =>
    m.variantes.find((v) => v.cadrage === cadrage && v.taille === taille && v.ips === ips && v.codec === codec);
  const choix: { v: Variante; rang: number; ordre: number }[] = [];
  for (const [ordre, codec] of (['av1', 'hevc'] as const).entries()) {
    let v = trouver('plein', 60, codec), a = v ? await aptitude(v, m.duree, caps) : null;
    const leger = trouver('leger', 60, codec);
    if (leger && (!a || (!a.smooth && !a.powerEfficient))) {
      const b = await aptitude(leger, m.duree, caps);
      if (b.supported) { v = leger; a = b; }
    }
    if (!v || !a || !a.supported) continue;
    const v120 = trouver('plein', 120, codec);
    if (intervalleMs <= SEUIL_120_MS && v.taille === 'plein' && v120) {
      const b = await aptitude(v120, m.duree, caps);
      if (b.supported && b.powerEfficient) { v = v120; a = b; }
    }
    choix.push({ v, rang: rang(a), ordre });
  }
  return choix.sort((x, y) => y.rang - x.rang || x.ordre - y.ordre).map((c) => c.v);
}

// ---------- de la vidéo à l'écran ----------
/**
 * Rognage `object-fit: cover` : la vidéo couvre l'écran, centrée en largeur ; le portrait est calé en haut
 * (`object-position: 50% 0`, D8), le paysage centré. Un point p de la vidéo (px vidéo) est à l'écran (px CSS) en
 * `(x + p₀·echelle, y + p₁·echelle)` : le calque des questions, dans le repère de la vidéo, se pose donc par un seul
 * `translate(x, y) scale(echelle)` (origine en haut à gauche), recalculé quand l'écran change.
 */
export interface Couverture { echelle: number; x: number; y: number }
export function couverture(video: { width: number; height: number }, ecran: { width: number; height: number }, cadrage: Cadrage): Couverture {
  const echelle = Math.max(ecran.width / video.width, ecran.height / video.height);
  return { echelle, x: (ecran.width - video.width * echelle) / 2, y: cadrage === 'portrait' ? 0 : (ecran.height - video.height * echelle) / 2 };
}

/** Un point de la vidéo (px vidéo) à l'écran (px CSS), sous ce rognage. */
export function versEcran(p: [number, number], video: { width: number; height: number }, ecran: { width: number; height: number }, cadrage: Cadrage): [number, number] {
  const c = couverture(video, ecran, cadrage);
  return [c.x + p[0] * c.echelle, c.y + p[1] * c.echelle];
}

// ---------- relais de la petite Terre du titre ----------
/**
 * Angle de la Terre en pâte (rad, [0, 2π[) à l'instant `t` de la vidéo, de FONDU à FIN : elle y tourne à la vitesse de
 * la petite Terre du titre (un tour en LOGO_TOUR_S) jusqu'à LOGO_ANGLE_FIN ; au-delà, la vidéo reste sur sa dernière
 * image. La petite Terre part de cet angle quand le fondu commence (D5).
 */
export function angleTerre(t: number): number {
  const a = LOGO_ANGLE_FIN - (INTRO.FIN - Math.min(t, INTRO.FIN)) * ((2 * Math.PI) / LOGO_TOUR_S);
  return ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
}

// ---------- abandons ----------
/** Ce que le lecteur relève à chaque image de l'écran, et quand l'onglet change de visibilité. */
export interface Releve {
  /** Horloge (ms). */
  ms: number;
  /** Onglet visible ; caché, rien ne compte (rAF et vidéo suspendus). */
  visible: boolean;
  /** `currentTime` de la vidéo (s). */
  temps: number;
  /** La première image est affichée. */
  image: boolean;
  /** La lecture doit avancer : ni figée par `?introT`, ni sur sa dernière image, ni dans le fondu. */
  attendue: boolean;
}
export interface Suivi { precedent: Releve | null; attenteMs: number }
export const SUIVI_DEPART: Suivi = { precedent: null, attenteMs: 0 };
/** Un écart plus long entre deux relevés visibles (page gelée, changement d'onglet manqué) ne compte que pour ce pas (ms). */
export const PAS_MAX_MS = 250;

/**
 * Attente sans progrès, comptée sur le temps où l'onglet est visible : au bout de `delaiMs`, « pas-d-image » si aucune
 * image n'est venue, « bloquee » si la lecture a calé (spec §4). Une image ou un `currentTime` qui avance remet à zéro.
 */
export function suivreLecture(s: Suivi, r: Releve, delaiMs = INTRO_GIVE_UP_MS): { suivi: Suivi; echec: Echec | null } {
  const p = s.precedent;
  const progres = p !== null && (r.temps > p.temps || (r.image && !p.image));
  let attenteMs = s.attenteMs;
  if (!r.attendue || progres) attenteMs = 0;
  else if (p && p.visible && r.visible) attenteMs += Math.min(PAS_MAX_MS, Math.max(0, r.ms - p.ms));
  return { suivi: { precedent: r, attenteMs }, echec: attenteMs >= delaiMs ? (r.image ? 'bloquee' : 'pas-d-image') : null };
}
