export interface DprOptions { min: number; max: number; step: number; slowMs: number; fastMs: number; window: number }

/** Niveau « standard » : densité de 0,75 à min(devicePixelRatio, 2), par pas de 0,25 ; vise 45 à 70 images/s. */
export const dprOptions = (devicePixelRatio: number): DprOptions =>
  ({ min: 0.75, max: Math.min(2, Math.max(1, devicePixelRatio)), step: 0.25, slowMs: 22, fastMs: 14, window: 30 });

/**
 * Résolution dynamique (spec §4.1 et §6.6) : par fenêtres de `window` frames, la MÉDIANE du temps de frame (une frame
 * aberrante — onglet revenu, compilation d'un shader — ne compte pas) fait baisser la densité d'un pas au-dessus de
 * `slowMs`, la fait remonter sous `fastMs`, et la laisse entre les deux (pas d'oscillation).
 */
export function createDprGovernor(o: DprOptions) {
  let dpr = o.max;
  const times: number[] = [];
  return {
    get dpr() { return dpr; },
    update(frameMs: number): number {
      times.push(frameMs);
      if (times.length < o.window) return dpr;
      const median = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]!;
      times.length = 0;
      if (median > o.slowMs) dpr = Math.max(o.min, dpr - o.step);
      else if (median < o.fastMs) dpr = Math.min(o.max, dpr + o.step);
      return dpr;
    },
  };
}
