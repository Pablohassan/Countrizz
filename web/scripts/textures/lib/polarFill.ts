/** Au-delà de 58–62° de latitude, un blanc plat (≥ 240–252 sur les trois canaux) est l'absence de donnée de Sentinel-2. */
export const POLAR = { fromLat: 58, toLat: 62, whiteFrom: 240, whiteTo: 252 } as const;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Jour équirectangulaire RVB (`width × height`, ligne 0 au nord) : les glaces polaires que Sentinel-2 rend en blanc plat
 * (Groenland, Antarctique) prennent la glace ombrée de Blue Marble ; la neige des montagnes et toute terre colorée
 * restent celles de Sentinel-2.
 */
export function polarFill(s2: Uint8Array, bm: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(s2.length);
  for (let y = 0; y < height; y++) {
    const wl = smooth(POLAR.fromLat, POLAR.toLat, Math.abs(90 - ((y + 0.5) / height) * 180));
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const w = wl === 0 ? 0 : wl * smooth(POLAR.whiteFrom, POLAR.whiteTo, Math.min(s2[i]!, s2[i + 1]!, s2[i + 2]!));
      for (let k = 0; k < 3; k++) out[i + k] = Math.round(s2[i + k]! * (1 - w) + bm[i + k]! * w);
    }
  }
  return out;
}
