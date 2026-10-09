/** Générateur pseudo-aléatoire mulberry32 : même graine, même suite ; l'état est exposé pour qu'un réducteur reste pur. */
export interface Rng { next(): number; readonly state: number }

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return {
    next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    get state() { return s; },
  };
}
