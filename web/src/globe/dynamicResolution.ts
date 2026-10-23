export interface DprOptions { min: number; max: number; step: number; slowMs: number; fastMs: number; window: number }

/** Bornes de la prop `dpr` du Canvas (R3F) : la densité de l'écran, ramenée entre 1 et 2,5. */
export const DPR_RANGE: [number, number] = [1, 2.5];

/**
 * Les deux niveaux (spec zoom §5) : densité de 1,25 à celle de l'écran (2,5 au plus), par pas de 0,25 ; vise 60 images/s :
 * une fenêtre dont la médiane passe 18 ms (moins de 55 images/s) fait baisser la densité, la cadence d'un écran à 60 Hz
 * (16,7 ms) jamais. Choix de l'utilisateur du 23/10, après une partie qui « lague » sur téléphone : plafond 2,5 (3 avant :
 * les photos y étaient déjà agrandies, mesure du 21/10) et 60 images/s (45 avant, seuil de 22 ms). Avant le 21/10 : de
 * 0,75 à 2 — un téléphone était toujours agrandi, jusqu'à quatre fois sous charge. Un écran de densité 1 reste à 1.
 */
export const dprOptions = (devicePixelRatio: number): DprOptions => {
  const max = Math.min(DPR_RANGE[1], Math.max(DPR_RANGE[0], devicePixelRatio));
  return { min: Math.min(1.25, max), max, step: 0.25, slowMs: 18, fastMs: 14, window: 30 };
};

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
  /** Fenêtres lentes consécutives déjà au plancher : le repli de qualité s'y règle (spec zoom §5 bis). */
  let slowAtFloor = 0;
  let lastMedian: number | null = null;
  const times: number[] = [];
  const backoff = new Map<number, number>(), retryAt = new Map<number, number>();
  return {
    get dpr() { return dpr; },
    get slowWindowsAtFloor() { return slowAtFloor; },
    get lastMedianMs() { return lastMedian; },
    update(frameMs: number, nowMs?: number): number {
      clock = nowMs ?? clock + frameMs;
      times.push(frameMs);
      if (times.length < o.window) return dpr;
      const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]!;
      times.length = 0;
      lastMedian = median;
      displayMs = Math.min(displayMs, median);
      if (median > o.slowMs) {
        const failed = dpr;
        dpr = Math.max(o.min, dpr - o.step);
        slowAtFloor = dpr === failed ? slowAtFloor + 1 : 0;   // déjà au plancher : la densité ne peut plus rien
        if (dpr !== failed) {
          const wait = (backoff.get(failed) ?? FIRST_BACKOFF_MS / 2) * 2;
          backoff.set(failed, wait);
          retryAt.set(failed, clock + wait);
        }
      } else {
        slowAtFloor = 0;
        if (median < o.fastMs || median <= displayMs * AT_DISPLAY_RATE) {
          const next = Math.min(o.max, dpr + o.step);
          if (clock >= (retryAt.get(next) ?? 0)) dpr = next;
        }
      }
      return dpr;
    },
  };
}
