import { useEffect, useState } from 'react';
import { measureLines, type MeasureState } from './fallback';
import { frameWindow, reportQuery, windowLine } from './frameReport';

/** Le GPU de l'appareil (fabricant/architecture), lu une fois ; types WebGPU absents du projet. */
type GpuNav = { gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string } } | null> } };

/**
 * Encart `?mesure` (spec zoom §5 bis) : pour les essais de l'utilisateur sur ses téléphones. Coin bas gauche, au-dessus du
 * jeu, sans capter le doigt (les réponses restent jouables) ; relu deux fois par seconde. Toutes les 2 s, la fenêtre
 * d'images écoulée (frameReport.ts) s'affiche et part à `/__mesure` sur ce même site, dont le journal garde la requête : la
 * mesure d'un vrai téléphone se lit sans capture d'écran (23/10). Rien n'est envoyé sans `?mesure`.
 */
export function MeasureOverlay({ read }: { read(): MeasureState | null }) {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    let gpu = '?', longTasks = 0, longMs = 0, tick = 0, last: string | null = null;
    (navigator as unknown as GpuNav).gpu?.requestAdapter().then((a) => { if (a?.info) gpu = `${a.info.vendor || '?'}/${a.info.architecture || '?'}`; }, () => {});
    let tasks: PerformanceObserver | null = null;
    try {
      tasks = new PerformanceObserver((l) => { for (const e of l.getEntries()) { longTasks++; longMs += e.duration; } });
      tasks.observe({ type: 'longtask' });
    } catch { tasks = null; }   // pas de tâches longues hors Chromium
    const id = setInterval(() => {
      const m = read();
      if (m?.log && ++tick % 4 === 0) {
        const w = frameWindow(m.log.intervals.splice(0), m.log.js.splice(0));
        if (w) {
          last = windowLine(w);
          const q = reportQuery(w, m, { t: performance.now() / 1000, longTasks, longMs, gpu, vue: document.querySelector('.accueil') ? 'accueil' : 'jeu', w: innerWidth, h: innerHeight, ecran: devicePixelRatio });
          fetch(`/__mesure?${q}`, { cache: 'no-store', keepalive: true }).catch(() => {});
          longTasks = 0; longMs = 0;
        }
      }
      setLines(m ? [...measureLines(m), ...(last ? [last] : [])] : []);
    }, 500);
    return () => { clearInterval(id); tasks?.disconnect(); };
  }, [read]);
  if (!lines.length) return null;
  return (
    <div className="mesure" aria-hidden="true" style={{ position: 'absolute', left: 8, bottom: 8, zIndex: 50, pointerEvents: 'none', padding: '6px 8px', background: '#000000b3', color: '#e8f0ff', font: '11px/1.35 ui-monospace, monospace', borderRadius: 6, whiteSpace: 'pre' }}>
      {lines.join('\n')}
    </div>
  );
}
