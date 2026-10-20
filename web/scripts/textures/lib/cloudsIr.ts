/**
 * Nuages d'après l'infrarouge GMGSI (spec nuages §1) : couverture et hauteur du sommet tirées de l'écart de température
 * entre le sol sans nuages (le plus chaud de 14 jours à la même heure) et l'image du jour.
 */

/** Comptes « mode A » sur 8 bits → kelvins (NOAA OSPO, Conversion of GVAR Infrared Data) : X = 660 − 2T, puis 418 − T. */
export function modeAKelvin(count: number): number {
  return count <= 176 ? 330 - count / 2 : 418 - count;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Bornes de l'écart au sol clair (K) entre lesquelles la couverture monte de 0 à 1. La mer change peu de température d'un
 * jour à l'autre : les nuages bas (stratocumulus du Pérou, écart médian 7,5 K le 19/10) y montent vite ; sur terre, le
 * sol varie davantage et les cirrus du Sahara (écart médian 16 K) restent translucides.
 */
export const COVER_DT = { land: { from: 4, to: 40 }, sea: { from: 2, to: 15 }, gamma: 0.8 } as const;
/** Sommet froid compté comme nuage hors glaces (sol de référence plus chaud que `iceBelow`). */
export const COLD_TOP = { from: 265, to: 225, weight: 0.9, iceBelow: 255 } as const;
/** Gradient de l'atmosphère standard (K/km) et sommet le plus haut codé (km). */
export const LAPSE_K_PER_KM = 6.5;
export const CLOUD_TOP_MAX_KM = 16;

/** Couverture (0 → 1) d'un pixel à `t` kelvins sur un sol clair (mer ou terre) à `clear` kelvins. */
export function cloudCover(t: number, clear: number, sea: boolean): number {
  const ramp = sea ? COVER_DT.sea : COVER_DT.land;
  const byContrast = smooth(ramp.from, ramp.to, clear - t) ** COVER_DT.gamma;
  const byCold = clear > COLD_TOP.iceBelow ? smooth(COLD_TOP.from, COLD_TOP.to, t) * COLD_TOP.weight : 0;
  return Math.max(byContrast, byCold);
}

/** Hauteur du sommet en fraction de CLOUD_TOP_MAX_KM, pour un écart `dT` (K) au sol clair. */
export function cloudTop(dT: number): number {
  return Math.min(1, Math.max(0, dT / LAPSE_K_PER_KM / CLOUD_TOP_MAX_KM));
}

/** Latitudes (°) entre lesquelles les nuages de Blue Marble remplacent GMGSI (couverte jusqu'à ±72,7°). */
export const POLAR_FADE_DEG = { from: 66, to: 72 } as const;
/** Part de Blue Marble à la latitude donnée. */
export function polarWeight(latDeg: number): number {
  return smooth(POLAR_FADE_DEG.from, POLAR_FADE_DEG.to, Math.abs(latDeg));
}

/**
 * Grille GMGSI (`sw × sh`, colonne 0 à −180°, pas régulier en longitude ; lignes aux latitudes `srcLat`, décroissantes,
 * pas Mercator) → équirectangulaire `w × h` (ligne 0 au nord), bilinéaire, raccordée à l'antiméridien ; NaN hors des
 * latitudes couvertes.
 */
export function toEquirect(src: Float32Array, sw: number, sh: number, srcLat: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const top = srcLat[0]!, bottom = srcLat[sh - 1]!;
  let r = 0;
  for (let y = 0; y < h; y++) {
    const lat = 90 - ((y + 0.5) * 180) / h;
    if (lat > top || lat < bottom) { out.fill(NaN, y * w, (y + 1) * w); continue; }
    while (r < sh - 2 && srcLat[r + 1]! >= lat) r++;
    const fy = (srcLat[r]! - lat) / (srcLat[r]! - srcLat[r + 1]!);
    for (let x = 0; x < w; x++) {
      const sx = ((x + 0.5) * sw) / w;
      const x0 = Math.floor(sx) % sw, x1 = (x0 + 1) % sw, fx = sx - Math.floor(sx);
      const a = src[r * sw + x0]! * (1 - fx) + src[r * sw + x1]! * fx;
      const b = src[(r + 1) * sw + x0]! * (1 - fx) + src[(r + 1) * sw + x1]! * fx;
      out[y * w + x] = a * (1 - fy) + b * fy;
    }
  }
  return out;
}
