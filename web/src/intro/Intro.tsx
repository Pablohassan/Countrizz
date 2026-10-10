import { useEffect, useRef } from 'react';
import type { Messages } from '../i18n';
import { createIntroScene, type IntroScene } from './scene';
import { INTRO, frameAt, type Viewport } from './timeline';
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
  /** 16,8 s : l'accueil se monte. */
  onHome(): void;
  /** 19,6 s : le globe reprend son rendu, le calque de l'intro s'efface. */
  onFade(): void;
  /** Fin (ou abandon) : l'intro peut être démontée. */
  onDone(): void;
}

/**
 * Intro en pâte à modeler (spec `2026-10-10-countrizz-intro-pate-accueil-design.md`) : un calque par-dessus le globe,
 * son canvas, ses étoiles en billes, son titre. Tout passe par une horloge en stop motion (12 i/s) ; elle attend ses
 * textures avant la chute (2 s) et le globe avant le fondu (19,6 s).
 */
export function Intro({ m, globeReady, onHome, onFade, onDone }: Props) {
  const layer = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), title = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLDivElement>(null), stars = useRef<HTMLDivElement>(null);
  const ready = useRef(globeReady);
  ready.current = globeReady;
  const skip = useRef(false);
  const cb = useRef({ onHome, onFade, onDone });
  cb.current = { onHome, onFade, onDone };

  useEffect(() => {
    let alive = true, scene: IntroScene | null = null, raf = 0, last = performance.now(), t = 0, step = -1;
    let home = false, fade = false, done = false;
    const frozen = hooks() ? new URLSearchParams(location.search).get('introT') : null;
    if (hooks()) window.__intro = { t: 0, frames: 0, ready: false, skipped: false };
    const vp = (): Viewport => ({ width: innerWidth, height: innerHeight });
    const finish = () => { if (done) return; done = true; cb.current.onHome(); cb.current.onFade(); cb.current.onDone(); };
    const giveUp = setTimeout(() => { if (!scene) finish(); }, INTRO_GIVE_UP_MS);

    // étoiles en billes, toujours les mêmes (graine fixe)
    const billes: { el: HTMLElement; debut: number; phase: number }[] = [];
    { let g = 12345; const a = () => (g = (g * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 46; i++) {
        const el = document.createElement('i'), r = 1.5 + a() * 3.5;
        el.style.cssText = `left:${a() * 100}%;top:${a() * 100}%;width:${r}px;height:${r}px`;
        stars.current!.appendChild(el); billes.push({ el, debut: 0.2 + a() * 1.4, phase: a() * 6 });
      } }

    createIntroScene(canvas.current!).then((s) => {
      if (!alive) { s.dispose(); return; }
      scene = s;
      scene.resize(vp(), Math.min(3, devicePixelRatio || 1));
      if (window.__intro) window.__intro.ready = true;
    }, (e: unknown) => { console.warn('intro abandonnée :', e); finish(); });

    const onResize = () => scene?.resize(vp(), Math.min(3, devicePixelRatio || 1));
    addEventListener('resize', onResize);

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.25, (now - last) / 1000);   // un téléphone lent ralentit l'intro plutôt que de sauter des phases
      last = now;
      if (frozen !== null) t = Number(frozen);
      else if (skip.current) t = INTRO.FIN;
      else t += dt;
      // attentes : les textures de la pâte avant la chute, le globe avant le fondu
      if (!scene) t = Math.min(t, INTRO.CHUTE - 0.05);
      if (!ready.current) t = Math.min(t, INTRO.FONDU - 0.001);
      // les seuils se jugent sur le temps exact : « Passer » pose t = FIN, que l'arrondi à l'image ferait retomber à 21,1667
      if (!home && t >= INTRO.ACCUEIL) { home = true; cb.current.onHome(); }
      if (!fade && t >= INTRO.FONDU) { fade = true; cb.current.onFade(); }
      if (!done && t >= INTRO.FIN && frozen === null) { done = true; cb.current.onDone(); return; }
      const n = Math.floor(t * INTRO.IPS);
      if (n === step && frozen === null) return;
      step = n;
      const tq = frozen !== null ? t : n / INTRO.IPS, f = frameAt(tq, vp());
      // DOM, dans la même horloge que la pâte
      for (const b of billes) {
        const u = (tq - b.debut) / 0.35;
        b.el.style.opacity = String(Math.max(0, Math.min(1, u)) * (0.55 + 0.35 * Math.sin(b.phase + tq * 2.1)));
        b.el.style.transform = `scale(${u <= 0 ? 0 : Math.min(1.3, 1 + 0.3 * Math.sin(Math.min(1, u) * Math.PI))})`;
      }
      title.current!.style.opacity = String(f.title.opacity);
      title.current!.style.transform = `translate(${f.title.x}px, ${f.title.y}px)`;
      layer.current!.style.opacity = String(f.layerOpacity);
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
    };
  }, []);

  return (
    <div className="intro" ref={layer} aria-hidden="false">
      <div className="intro-etoiles" ref={stars} />
      <canvas className="intro-canvas" ref={canvas} aria-label="Countrizz : une Terre en pâte à modeler" />
      <div className="intro-titre" ref={title}>Countrizz</div>
      <div className="intro-vignette" ref={label}><b>France</b><span>Paris</span></div>
      <button type="button" className="intro-passer" onClick={() => { skip.current = true; }}>{m.intro.skip}</button>
    </div>
  );
}
