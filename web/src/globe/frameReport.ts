import type { MeasureState } from './fallback';

/**
 * Une fenêtre d'images vue par `?mesure` (analyse du manque de fluidité sur téléphone, 23/10) : intervalles entre images
 * (ms), à-coups, et temps de calcul de l'image sur le fil principal (du début de la boucle à l'envoi au GPU). Calcul long :
 * le processeur freine ; calcul court et intervalles longs : le GPU.
 */
export interface FrameWindow { n: number; med: number; p90: number; max: number; over25: number; over50: number; jsMed: number; jsMax: number }

const at = (sorted: number[], f: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))]!;

export function frameWindow(intervals: readonly number[], js: readonly number[]): FrameWindow | null {
  if (!intervals.length) return null;
  const s = [...intervals].sort((a, b) => a - b), c = [...js].sort((a, b) => a - b);
  return {
    n: s.length, med: at(s, 0.5), p90: at(s, 0.9), max: s[s.length - 1]!,
    over25: s.filter((x) => x > 25).length, over50: s.filter((x) => x > 50).length,
    jsMed: c.length ? at(c, 0.5) : 0, jsMax: c.length ? c[c.length - 1]! : 0,
  };
}

/** Ce que l'encart ne lit pas du globe : instant (s), tâches longues de la fenêtre, GPU, écran affiché, taille et densité de l'écran. */
export interface ReportExtra { t: number; longTasks: number; longMs: number; gpu: string; vue: string; w: number; h: number; ecran: number }

/** Paramètres du rapport envoyé à `/__mesure` (journal de nginx ; spec zoom §5 bis, encart). */
export function reportQuery(w: FrameWindow, m: MeasureState, x: ReportExtra): string {
  return new URLSearchParams({
    v: '1', t: String(Math.round(x.t)), vue: x.vue,
    n: String(w.n), med: w.med.toFixed(1), p90: w.p90.toFixed(1), max: String(Math.round(w.max)), a25: String(w.over25), a50: String(w.over50),
    js: w.jsMed.toFixed(1), jsmax: String(Math.round(w.jsMax)), lt: String(x.longTasks), ltms: String(Math.round(x.longMs)),
    dpr: String(m.dpr), tier: m.tier, deg: m.degradation, traa: m.traa ? '1' : '0', be: m.backend, tex: String(m.maxTexture2D), gpu: x.gpu,
    w: String(x.w), h: String(x.h), ecran: String(x.ecran),
  }).toString();
}

const num = (x: number, digits: number) => x.toFixed(digits).replace('.', ',');

/** Ligne de l'encart. */
export const windowLine = (w: FrameWindow): string =>
  `Images : ${num(w.med, 1)} ms (p90 ${num(w.p90, 1)} ; max ${Math.round(w.max)}) ; à-coups ${w.over25} ; calcul ${num(w.jsMed, 1)} ms`;
