/**
 * Mer de Blue Marble dans les photos de pays (spec océan §1.1) : image équirectangulaire RVB (ligne 0 au nord, colonne 0
 * à −180°) lue en bilinéaire, longitudes raccordées à l'antiméridien.
 */
export function equirectSampler(rgb: Uint8Array, w: number, h: number) {
  return (lon: number, lat: number): [number, number, number] => {
    const fx = (((lon + 180) / 360) * w - 0.5 + w) % w, fy = Math.min(h - 1, Math.max(0, ((90 - lat) / 180) * h - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = (x0 + 1) % w, y1 = Math.min(h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    const c = (x: number, y: number, k: number) => rgb[(y * w + x) * 3 + k]!;
    const out: [number, number, number] = [0, 0, 0];
    for (let k = 0; k < 3; k++) out[k] = Math.round((c(x0, y0, k) * (1 - tx) + c(x1, y0, k) * tx) * (1 - ty) + (c(x0, y1, k) * (1 - tx) + c(x1, y1, k) * tx) * ty);
    return out;
  };
}

/** Couleur d'un texel : la photo sur terre, Blue Marble en mer, mêlées à la côte selon la part de terre `land` (0 → 1). */
export function seaColor(photo: [number, number, number], bm: [number, number, number], land: number): [number, number, number] {
  return [0, 1, 2].map((k) => Math.round(photo[k]! * land + bm[k]! * (1 - land))) as [number, number, number];
}
