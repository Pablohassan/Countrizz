import { useEffect, useRef } from 'react';
import type { Messages } from '../i18n';
import { createIntroScene, type IntroScene } from './scene';
import { INTRO, LOGO_LETTRES, defaultTargets, frameAt, logoAngleAt, rebond, spriteFrame, type Target, type Targets, type Viewport } from './timeline';
import { LogoTitle } from '../ui/LogoTitle';
import './intro.css';

/** Crochets de test (dev, ou drapeau des e2e posé par Playwright) : `?introT=13` fige l'intro à 13 s. */
const E2E_FLAG = 'countrizz:e2e';
const hooks = (): boolean => { try { return import.meta.env.DEV || localStorage.getItem(E2E_FLAG) === '1'; } catch { return import.meta.env.DEV; } };
declare global { interface Window { __intro?: { t: number; frames: number; ready: boolean; skipped: boolean } } }

/** Sans ses textures au bout de 8 s, l'intro est abandonnée : accueil direct sur le globe (spec intro §4). */
export const INTRO_GIVE_UP_MS = 8000;

interface Props {
  m: Messages;
  /** Le vrai globe est prêt : le fondu peut partir. */
  globeReady: boolean;
  /** 16,2 s : l'accueil se monte. */
  onHome(): void;
  /** 17,4 s : le globe reprend son rendu, le fond de nuit s'efface. */
  onFade(): void;
  /** Fin (ou abandon) : l'intro peut être démontée ; `angle` : celui de la Terre, pour la petite Terre du titre. */
  onDone(angle: number | null): void;
}

/**
 * Intro en pâte à modeler (spec `2026-10-10-countrizz-intro-pate-accueil-design.md`, déroulé du 10/10 : double dézoom) :
 * un calque par-dessus le globe, son fond de nuit, son canvas, le logo C🌍untrizz du milieu. Tout passe par une horloge
 * en stop motion (12 i/s) ; elle attend ses textures avant la chute et le globe avant le fondu. Les deux « o » où se
 * loge la Terre sont mesurés dans la page : le logo du milieu, et un double invisible du titre de l'accueil.
 */
export function Intro({ m, globeReady, onHome, onFade, onDone }: Props) {
  const fond = useRef<HTMLDivElement>(null), logo = useRef<HTMLDivElement>(null), fantome = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null), stars = useRef<HTMLDivElement>(null);
  const ready = useRef(globeReady);
  ready.current = globeReady;
  const skip = useRef(false);
  const cb = useRef({ onHome, onFade, onDone });
  cb.current = { onHome, onFade, onDone };

  useEffect(() => {
    let alive = true, scene: IntroScene | null = null, raf = 0, last = performance.now(), t = 0, step = -1;
    let home = false, fade = false, done = false;
    const sprite = hooks() ? new URLSearchParams(location.search).get('introSprite') : null;   // fabrication de la petite Terre du titre
    const frozen = hooks() ? new URLSearchParams(location.search).get('introT') ?? (sprite !== null ? '7' : null) : null;
    if (hooks()) window.__intro = { t: 0, frames: 0, ready: false, skipped: false };
    const vp = (): Viewport => ({ width: innerWidth, height: innerHeight });
    // un canvas à chaque montage : en StrictMode (dev), le premier renderer détruit le sien (perte du contexte)
    const cv = document.createElement('canvas');
    cv.className = 'intro-canvas';
    cv.setAttribute('aria-label', 'Countrizz : une Terre en pâte à modeler');
    fond.current!.after(cv);   // au-dessus du fond de nuit (qui s'efface), sous le logo
    const canvas = { current: cv };
    const coarse = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
    // stop motion à 12 i/s : une densité de 2 suffit ; ombre plus légère sur téléphone (mémoire)
    const ratio = () => Math.min(2, devicePixelRatio || 1);
    const finish = () => { if (done) return; done = true; cb.current.onHome(); cb.current.onFade(); cb.current.onDone(null); };
    // les deux « o » : centre et rayon de la petite Terre (px CSS), mesurés sur les marqueurs posés dans les « o »
    const mesure = (el: Element | null | undefined): Target | null => {
      const r = el?.getBoundingClientRect();
      return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 } : null;
    };
    const cibles = (): Targets => {
      const d = defaultTargets(vp());
      return { logo: mesure(logo.current?.querySelector('.intro-logo-terre')) ?? d.logo, titre: mesure(fantome.current?.querySelector('.logo-terre')) ?? d.titre };
    };
    let c = cibles();
    void document.fonts?.ready.then(() => { c = cibles(); });
    const giveUp = setTimeout(() => { if (!scene) finish(); }, INTRO_GIVE_UP_MS);

    // étoiles en billes, toujours les mêmes (graine fixe)
    const billes: { el: HTMLElement; debut: number; phase: number }[] = [];
    { let g = 12345; const a = () => (g = (g * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 46; i++) {
        const el = document.createElement('i'), r = 1.5 + a() * 3.5;
        el.style.cssText = `left:${a() * 100}%;top:${a() * 100}%;width:${r}px;height:${r}px`;
        stars.current!.appendChild(el); billes.push({ el, debut: 0.2 + a() * 1.4, phase: a() * 6 });
      } }

    createIntroScene(canvas.current!, '/', { shadowSize: coarse ? 2048 : 4096 }).then((s) => {
      if (!alive) { s.dispose(); return; }
      scene = s;
      scene.resize(vp(), ratio());
      if (window.__intro) window.__intro.ready = true;
    }, (e: unknown) => { console.warn('intro abandonnée :', e); finish(); });

    const onResize = () => { scene?.resize(vp(), ratio()); c = cibles(); };
    addEventListener('resize', onResize);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.25, (now - last) / 1000);   // un téléphone lent ralentit l'intro plutôt que de sauter des phases
      last = now;
      if (frozen !== null) t = Number(frozen);
      else if (skip.current && !scene) { finish(); return; }   // « Passer » pendant le chargement de la pâte : accueil direct
      else if (skip.current) t = INTRO.FIN;
      else t += dt;
      // attentes : les textures de la pâte avant la chute, le globe avant le fondu
      if (!scene) t = Math.min(t, INTRO.CHUTE - 0.05);
      if (!ready.current) t = Math.min(t, INTRO.FONDU - 0.001);
      // les seuils se jugent sur le temps exact : « Passer » pose t = FIN, que l'arrondi à l'image ferait retomber à 21,1667
      if (!home && t >= INTRO.ACCUEIL) { home = true; cb.current.onHome(); }
      if (!fade && t >= INTRO.FONDU) { fade = true; cb.current.onFade(); }
      if (!done && t >= INTRO.FIN && frozen === null) { done = true; cb.current.onDone(logoAngleAt(INTRO.FIN)); return; }
      // en attente (pâte ou globe), le temps ne bouge plus mais la pâte frémit toujours, au rythme du stop motion
      const attente = (!scene && t >= INTRO.CHUTE - 0.05) || (!ready.current && t >= INTRO.FONDU - 0.001);
      const n = attente ? -1 - Math.floor((now / 1000) * INTRO.IPS) : Math.floor(t * INTRO.IPS);
      if (n === step && frozen === null) return;
      step = n;
      const tq = frozen !== null || attente ? t : n / INTRO.IPS, f = sprite !== null ? spriteFrame((Number(sprite) * Math.PI) / 180, vp()) : frameAt(tq, vp(), c);
      // DOM, dans la même horloge que la pâte
      for (const b of billes) {
        const u = (tq - b.debut) / 0.35;
        b.el.style.opacity = String(Math.max(0, Math.min(1, u)) * (0.55 + 0.35 * Math.sin(b.phase + tq * 2.1)));
        b.el.style.transform = `scale(${u <= 0 ? 0 : Math.min(1.3, 1 + 0.3 * Math.sin(Math.min(1, u) * Math.PI))})`;
      }
      // le logo du milieu : « C » arrive de la gauche, « untrizz » lettre après lettre ; tout s'envole au rezoom
      logo.current!.querySelectorAll<HTMLElement>('.intro-logo-l').forEach((el, i) => {
        const p = f.logo.letters[i] ?? 0, k = rebond(p, 2.2), out = f.logo.out;
        const dx = i === 0 ? -80 * (1 - k) - 260 * out : (60 + 25 * i) * out, dy = i === 0 ? 0 : 30 * (1 - k);
        el.style.opacity = String(Math.min(1, p * 3) * (1 - out));
        el.style.transform = `translate(${dx}px, ${dy}px) scale(${i === 0 ? 1 : Math.max(0.01, k)}) rotate(${i === 0 ? 0 : (1 - k) * (i % 2 ? 12 : -12)}deg)`;
      });
      fond.current!.style.opacity = String(f.backdrop);
      canvas.current!.style.filter = f.blur > 0.3 ? `blur(${f.blur.toFixed(1)}px)` : 'none';
      canvas.current!.style.opacity = String(scene ? f.opacity : 0);
      if (scene) {
        const top = scene.render(f, tq, vp(), frozen === null);
        if (top && f.label.opacity > 0) {
          label.current!.style.opacity = String(f.label.opacity);
          label.current!.style.transform = `translate(${top[0] - 34}px, ${top[1] - 30}px) translateY(-100%) rotate(-4deg) scale(${f.label.scale})`;
        } else label.current!.style.opacity = '0';
      }
      if (window.__intro) { window.__intro.t = tq; window.__intro.frames++; window.__intro.skipped = skip.current; }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      clearTimeout(giveUp);
      removeEventListener('resize', onResize);
      scene?.dispose();
      cv.remove();
      for (const b of billes) b.el.remove();
    };
  }, []);

  return (
    <div className="intro">
      <div className="intro-fond" ref={fond}><div className="intro-etoiles" ref={stars} /></div>
      <div className="intro-logo" ref={logo} aria-label="Countrizz">
        <span className="intro-logo-l">{LOGO_LETTRES[0]}</span>
        <span className="intro-logo-o" aria-hidden="true">o<i className="intro-logo-terre" /></span>
        {LOGO_LETTRES.slice(1).map((l, i) => <span key={i} className="intro-logo-l" aria-hidden="true">{l}</span>)}
      </div>
      {/* double invisible du titre de l'accueil : sa petite Terre donne la cible du second dézoom */}
      <div className="intro-fantome" ref={fantome} aria-hidden="true"><LogoTitle angle={null} visible={false} /></div>
      <div className="intro-vignette" ref={label}><b>France</b><span>Paris</span></div>
      <button type="button" className="intro-passer" onClick={() => { skip.current = true; }}>{m.intro.skip}</button>
    </div>
  );
}
