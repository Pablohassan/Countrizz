export interface DprOptions { min: number; max: number; step: number; slowMs: number; fastMs: number; window: number }

/** Niveau « standard » : densité de 0,75 à min(devicePixelRatio, 2), par pas de 0,25 ; vise 45 images/s au moins. */
export const dprOptions = (devicePixelRatio: number): DprOptions =>
  ({ min: 0.75, max: Math.min(2, Math.max(1, devicePixelRatio)), step: 0.25, slowMs: 22, fastMs: 14, window: 30 });

/** Une fenêtre « à la cadence de l'écran » : médiane à 10 % près de la meilleure médiane vue. */
const AT_DISPLAY_RATE = 1.1;
/** Première attente (ms) avant de retenter une densité qui s'est montrée lente ; doublée à chaque nouvel échec. */
const FIRST_BACKOFF_MS = 2000;

/**
 * Résolution dynamique (spec §4.1 et §6.6) : par fenêtres de `window` frames, la MÉDIANE de l'intervalle entre images
 * (une frame aberrante — onglet revenu, compilation d'un shader — ne compte pas) fait baisser la densité d'un pas
 * au-dessus de `slowMs`. Elle la fait remonter quand l'affichage suit : sous `fastMs`, ou à la cadence de l'écran — la
 * meilleure médiane vue, car sous la synchro verticale l'intervalle ne descend jamais sous 16,7 ms à 60 Hz. Une densité
 * qui s'est montrée lente n'est retentée qu'après une attente qui double à chaque échec (pas d'oscillation), comptée sur
 * l'horloge `nowMs` (par défaut : la somme des temps de frame).
 */
export function createDprGovernor(o: DprOptions) {
  let dpr = o.max;
  let displayMs = Infinity;
  let clock = 0;
  const times: number[] = [];
  const backoff = new Map<number, number>(), retryAt = new Map<number, number>();
  return {
    get dpr() { return dpr; },
    update(frameMs: number, nowMs?: number): number {
      clock = nowMs ?? clock + frameMs;
      times.push(frameMs);
      if (times.length < o.window) return dpr;
      const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]!;
      times.length = 0;
      displayMs = Math.min(displayMs, median);
      if (median > o.slowMs) {
        const failed = dpr;
        dpr = Math.max(o.min, dpr - o.step);
        if (dpr !== failed) {
          const wait = (backoff.get(failed) ?? FIRST_BACKOFF_MS / 2) * 2;
          backoff.set(failed, wait);
          retryAt.set(failed, clock + wait);
        }
      } else if (median < o.fastMs || median <= displayMs * AT_DISPLAY_RATE) {
        const next = Math.min(o.max, dpr + o.step);
        if (clock >= (retryAt.get(next) ?? 0)) dpr = next;
      }
      return dpr;
    },
  };
}
