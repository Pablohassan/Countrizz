import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Lang } from '../game/types';
import type { Messages } from '../i18n';
import {
  SUIVI_DEPART, angleTerre, choisirCadrage, choisirVariantes, couverture, idVariante, mesurerIntervalle, suivreLecture,
  type Capacites, type Echec, type Manifeste, type Releve, type Variante,
} from './lecteur';
import { ORDRE_QUESTIONS, POSES, etatLettre, poserMot, signes, texteQuestion, type Ancres, type Gabarit, type Mot, type Question } from './questions';
import { CADRAGES, INTRO, LOGO_ANGLE_FIN, type Cadrage } from './temps';
import './intro.css';

/**
 * Crochets de test (dev, ou drapeau des e2e posé par Playwright) : `?introT=13` place la vidéo à 13 s, en pause ;
 * `?introVariante=portrait-plein-60-av1` force la variante (Chromium headless mesure toujours 60 Hz et lit l'AV1).
 */
const E2E_FLAG = 'countrizz:e2e';
const hooks = (): boolean => { try { return import.meta.env.DEV || localStorage.getItem(E2E_FLAG) === '1'; } catch { return import.meta.env.DEV; } };
declare global {
  interface Window {
    __intro?: {
      /** Instant de la vidéo (s) qui règle les questions, l'accueil et le fondu. */
      t: number;
      /** La première image de la vidéo est affichée. */
      ready: boolean;
      skipped: boolean;
      variante: Pick<Variante, 'cadrage' | 'taille' | 'ips' | 'codec'> | null;
      echec: Echec | null;
      /** `performance.now()` à la première image (ms depuis le début de la navigation). */
      premiereImageMs: number | null;
    };
  }
}

/** Fondu de la vidéo vers le globe (s), de FONDU à FIN ; le titre de l'accueil apparaît au même rythme (LogoTitle). */
const FONDU_S = INTRO.FIN - INTRO.FONDU;

/**
 * Les questions telles que la page les a mesurées dans le calque (un `span` par signe, à la taille `POSES[cadrage].taille`,
 * px de la vidéo) : pour chaque mot, son gabarit et ses lettres dans l'ordre (blancs exclus), celui d'`etatLettre`.
 */
interface Mesure { cadrage: Cadrage; mots: { q: Question; g: Gabarit; lettres: HTMLElement[] }[] }

interface Props {
  /** Langue des questions (la vidéo est la même en français et en anglais). */
  lang: Lang;
  m: Messages;
  /** Le vrai globe est prêt : le fondu peut partir. */
  globeReady: boolean;
  /** `INTRO.ACCUEIL` : l'accueil se monte, son titre invisible (la vidéo le montre en pâte). */
  onHome(): void;
  /**
   * Le fondu part (`INTRO.FONDU`, globe prêt) : le globe reprend son rendu ; `angle` : celui de la Terre de la vidéo à cet
   * instant, d'où part la petite Terre du titre (null : accueil direct).
   */
  onFade(angle: number | null): void;
  /** Fin du fondu : l'intro peut être démontée ; `angle` : LOGO_ANGLE_FIN, ou null si elle a été abandonnée (accueil direct). */
  onDone(angle: number | null): void;
}

/**
 * Intro en vidéo précalculée (spec `2026-10-11-countrizz-intro-video-blender-design.md` §4-5) : un calque par-dessus le
 * globe ; l'affiche du cadrage tout de suite, puis la vidéo choisie (cadrage, cadence, codec : lecteur.ts), les questions
 * en HTML qui naissent de leurs objets (questions.ts), « Passer › ». Tout suit l'image affichée
 * (`requestVideoFrameCallback`, `currentTime` en repli) ; la vidéo ne se recharge jamais (rotation : seules les questions
 * se reposent). Globe pas prêt : la vidéo reste sur sa dernière image, l'accueil par-dessus. Tout échec mène à l'accueil
 * direct.
 */
export function Intro({ lang, m, globeReady, onHome, onFade, onDone }: Props) {
  const racine = useRef<HTMLDivElement>(null), video = useRef<HTMLVideoElement>(null), calque = useRef<HTMLDivElement>(null);
  const mesure = useRef<Mesure | null>(null);
  const ready = useRef(globeReady);
  ready.current = globeReady;
  const skip = useRef(false);
  const cb = useRef({ onHome, onFade, onDone });
  cb.current = { onHome, onFade, onDone };
  // le cadrage de la fenêtre au montage : celui de l'affiche, et de la vidéo choisie au même instant (elle n'en change plus)
  const [cadrage] = useState<Cadrage>(() => choisirCadrage(innerWidth, innerHeight));
  // le repère des questions : celui de la vidéo chargée (le cadrage du montage, sauf variante forcée par ?introVariante)
  const [cadrageVideo, setCadrageVideo] = useState<Cadrage>(cadrage);

  // Les questions sont mesurées dans la page (les chasses de Chango) à la langue et au cadrage de la vidéo, puis de
  // nouveau quand la police est chargée (celle de repli n'a pas les mêmes) ; la boucle les pose pour l'écran et les anime.
  useEffect(() => {
    const couche = calque.current!;
    let vivant = true;
    const mesurer = () => {
      mesure.current = {
        cadrage: cadrageVideo,
        mots: ORDRE_QUESTIONS.map((q) => {
          const mot = couche.querySelector<HTMLElement>(`[data-question="${q}"]`)!, lettres = [...mot.querySelectorAll<HTMLElement>('.intro-lettre')];
          const g: Gabarit = { largeur: mot.offsetWidth, hauteur: mot.offsetHeight,
            lettres: lettres.map((l) => ({ x: l.offsetLeft + l.offsetWidth / 2, y: l.offsetTop + l.offsetHeight / 2, w: l.offsetWidth, h: l.offsetHeight })) };
          return { q, g, lettres };
        }),
      };
    };
    mesurer();
    const textes = ORDRE_QUESTIONS.map((q) => texteQuestion(lang, q)).join('');
    document.fonts.load(`${POSES[cadrageVideo].taille}px Chango`, textes).then(() => { if (vivant) mesurer(); }, () => {});
    return () => { vivant = false; };
  }, [lang, cadrageVideo]);

  useEffect(() => {
    const v = video.current!, el = racine.current!, couche = calque.current!;
    const q = hooks() ? new URLSearchParams(location.search) : null;
    const gele = q?.has('introT') ? Number(q.get('introT')) : null, forcee = q?.get('introVariante') ?? null;
    if (q) window.__intro = { t: 0, ready: false, skipped: false, variante: null, echec: null, premiereImageMs: null };
    const rvfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    let alive = true, raf = 0, finFondu = 0, image = false, tImage = 0, saute = false, home = false, fondu = false, done = false;
    let variantes: Variante[] = [], courante: Variante | null = null, ancres: Ancres | null = null, suivi = SUIVI_DEPART;
    // les questions posées pour l'écran (taille relevée à chaque image), et la dernière image écrite
    let poses: { mot: Mot; g: Gabarit; lettres: HTMLElement[] }[] = [], posees: Mesure | null = null, ecranPose = '';
    let ecrit: { t: number; poses: typeof poses } | null = null;

    /** Accueil direct (spec §4) : l'intro disparaît d'un coup, les lettres du titre surgissent. */
    const abandonner = (echec: Echec | null) => {
      if (done || fondu) return;
      done = true;
      if (echec) console.warn('intro abandonnée :', echec);
      if (window.__intro) window.__intro.echec = echec;
      v.pause();
      if (!home) { home = true; cb.current.onHome(); }
      cb.current.onFade(null);
      cb.current.onDone(null);
    };
    const premiere = () => {
      if (image) return;
      image = true;
      el.classList.add('intro--image');   // l'affiche s'efface : la vidéo montre la même image
      if (window.__intro) { window.__intro.ready = true; window.__intro.premiereImageMs = performance.now(); }
    };
    const surImage = (_: number, meta: VideoFrameCallbackMetadata) => {
      if (!alive) return;
      tImage = meta.mediaTime;
      premiere();
      v.requestVideoFrameCallback(surImage);
    };
    // play() rejeté parce que la page n'en a pas le droit (économie d'énergie d'iOS…) : accueil direct ; les autres refus
    // (source illisible, chargement interrompu) : l'événement « error » ou le compte des 8 s décident
    const lancer = () => {
      v.play().catch((e: unknown) => { if (alive && e instanceof DOMException && e.name === 'NotAllowedError') abandonner('lecture-refusee'); });
    };
    const charger = (x: Variante) => {
      courante = x;
      if (window.__intro) window.__intro.variante = { cadrage: x.cadrage, taille: x.taille, ips: x.ips, codec: x.codec };
      v.dataset.cadrage = x.cadrage;
      setCadrageVideo(x.cadrage);   // le repère des questions suit la vidéo
      v.src = x.src;
      if (gele !== null) v.addEventListener('loadedmetadata', () => { v.currentTime = gele; }, { once: true });
      else lancer();
    };
    // une variante en erreur avant sa première image : la suivante (l'autre codec) ; sinon, ou après : accueil direct
    const surErreur = () => {
      if (!alive || done || !courante) return;
      const suivante = image ? undefined : variantes[variantes.indexOf(courante) + 1];
      if (suivante) charger(suivante); else abandonner('erreur');
    };
    const surCalage = () => { if (gele !== null) premiere(); };   // ?introT : l'image demandée est prête
    // fin du fondu : quand la vidéo a fini de s'effacer (une image lente retarde la transition CSS, pas un minuteur) ;
    // sans transition (onglet caché…), au plus tard une seconde après
    const finir = () => { if (done) return; done = true; clearTimeout(finFondu); cb.current.onDone(LOGO_ANGLE_FIN); };
    const surTransition = (e: TransitionEvent) => { if (fondu && e.target === v && e.propertyName === 'opacity') finir(); };

    const releve = (): Releve => ({ ms: performance.now(), visible: !document.hidden, temps: v.currentTime, image,
      attendue: gele === null ? !fondu && !skip.current && !v.ended : !image });
    const surVisibilite = () => {
      ({ suivi } = suivreLecture(suivi, releve()));   // l'absence de l'onglet ne compte pas dans les 8 s
      // retour sur l'onglet : la vidéo que le navigateur a suspendue repart (un refus : accueil direct)
      if (!document.hidden && courante && gele === null && !skip.current && !fondu && !done && v.paused && !v.ended) lancer();
    };

    /**
     * Les questions à l'instant t (questions.ts). Écran ou mesure changés : le calque, dans le repère de la vidéo, est
     * reposé par un seul transform (`couverture`) et les mots ramenés dans la partie visible (`poserMot`). Puis chaque
     * lettre, depuis `etatLettre`, sans lecture de mise en page ; rien avant la première image, ni sans ancres.
     */
    const dessinerQuestions = (t: number) => {
      const me = mesure.current, ecran = { width: el.clientWidth, height: el.clientHeight }, cle = `${ecran.width}×${ecran.height}`;
      if (!me || ecran.width === 0 || ecran.height === 0) return;
      if (me !== posees || cle !== ecranPose) {
        posees = me;
        ecranPose = cle;
        const k = couverture(CADRAGES[me.cadrage], ecran, me.cadrage);
        couche.style.transform = `translate(${k.x}px, ${k.y}px) scale(${k.echelle})`;
        poses = me.mots.map((x) => ({ ...x, mot: poserMot(x.q, me.cadrage, x.g, ecran) }));
      }
      const a = ancres;
      if (!a || !image || (ecrit && ecrit.t === t && ecrit.poses === poses)) return;
      ecrit = { t, poses };
      for (const { mot, g, lettres } of poses) {
        lettres.forEach((l, i) => {
          const e = etatLettre(t, mot, i, a);
          if (!e) { l.style.opacity = '0'; return; }
          l.style.opacity = String(e.opacite);
          l.style.transform = `translate(${e.x - g.lettres[i].x}px, ${e.y - g.lettres[i].y}px) rotate(${e.rot}deg) scale(${e.echelle})`;
        });
      }
    };

    const boucle = () => {
      raf = requestAnimationFrame(boucle);
      if (done) return;
      if (skip.current && !image) { abandonner(null); return; }   // « Passer » avant la première image : accueil direct
      if (skip.current && !saute) {   // « Passer » : la vidéo saute à sa dernière image (le titre en pâte), puis le fondu
        saute = true;
        v.pause();
        if (Number.isFinite(v.duration)) v.currentTime = v.duration;
      }
      if (!image && !rvfc && gele === null && v.currentTime > 0) premiere();
      const t = skip.current || v.ended ? INTRO.FIN : gele ?? (rvfc && image ? tImage : v.currentTime);
      let echec: Echec | null;
      ({ suivi, echec } = suivreLecture(suivi, releve()));
      if (echec) { abandonner(echec); return; }
      if (!home && t >= INTRO.ACCUEIL) { home = true; cb.current.onHome(); }
      if (!fondu && (gele === null || skip.current) && t >= INTRO.FONDU && ready.current) {
        fondu = true;
        el.classList.add('intro--fondu');
        cb.current.onFade(angleTerre(t));
        finFondu = window.setTimeout(finir, FONDU_S * 1000 + 1000);
      }
      dessinerQuestions(t);
      if (window.__intro) { window.__intro.t = t; window.__intro.skipped = skip.current; }
    };

    const demarrer = async () => {
      const json = <T,>(u: string) => fetch(u).then((r) => (r.ok ? (r.json() as Promise<T>) : null)).catch(() => null);
      const [manifeste, a, intervalle] = await Promise.all([json<Manifeste>('/video/videos.json'), json<Ancres>('/intro/ancres.json'), mesurerIntervalle((f) => requestAnimationFrame(f))]);
      if (!alive || done) return;
      ancres = a;   // sans ancres, la vidéo se lit sans questions
      if (!manifeste) { abandonner('erreur'); return; }
      const caps: Capacites = { canPlayType: (t) => v.canPlayType(t), decodingInfo: navigator.mediaCapabilities ? (c) => navigator.mediaCapabilities.decodingInfo(c) : undefined };
      variantes = forcee !== null ? manifeste.variantes.filter((x) => idVariante(x) === forcee) : await choisirVariantes(manifeste, cadrage, intervalle, caps);
      if (!alive || done) return;
      if (variantes.length === 0) abandonner('aucun-codec');
      else charger(variantes[0]);
    };

    v.defaultMuted = true;   // muette : lecture sans geste de l'utilisateur (iOS, Chrome)
    v.muted = true;
    v.dataset.cadrage = cadrage;
    if (rvfc && gele === null) v.requestVideoFrameCallback(surImage);   // une seule chaîne, d'une source à l'autre
    v.addEventListener('error', surErreur);
    v.addEventListener('seeked', surCalage);
    v.addEventListener('transitionend', surTransition);
    document.addEventListener('visibilitychange', surVisibilite);
    raf = requestAnimationFrame(boucle);
    void demarrer();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(finFondu);
      document.removeEventListener('visibilitychange', surVisibilite);
      v.removeEventListener('error', surErreur);
      v.removeEventListener('seeked', surCalage);
      v.removeEventListener('transitionend', surTransition);
      v.pause();
      v.removeAttribute('src');
      v.load();
      el.classList.remove('intro--image', 'intro--fondu');
    };
  }, [cadrage]);

  return (
    <div className="intro" ref={racine} style={{ '--fondu': `${FONDU_S.toFixed(2)}s` } as CSSProperties}>
      <video ref={video} className="intro-video" muted playsInline preload="auto" disablePictureInPicture disableRemotePlayback aria-label={m.intro.videoLabel} />
      <img className="intro-affiche" data-cadrage={cadrage} src={`/intro/affiche-${cadrage}.webp`} alt="" aria-hidden="true" />
      <div className="intro-questions" ref={calque} data-cadrage={cadrageVideo} aria-hidden="true"
        style={{ width: CADRAGES[cadrageVideo].width, height: CADRAGES[cadrageVideo].height, fontSize: POSES[cadrageVideo].taille }}>
        {ORDRE_QUESTIONS.map((q) => (
          <div key={q} className={`intro-question intro-question--${q}`} data-question={q}>
            {signes(texteQuestion(lang, q)).map((s, i) => <span key={i} className={s.blanc ? 'intro-blanc' : 'intro-lettre'}>{s.c}</span>)}
          </div>
        ))}
      </div>
      <button type="button" className="intro-passer" onClick={() => { skip.current = true; if (window.__intro) window.__intro.skipped = true; }}>{m.intro.skip}</button>
    </div>
  );
}
