/**
 * Altitude GEBCO_2026 (spec océan §2.2) : grille équirectangulaire en mètres (Int16, ligne 0 au nord), réduite par
 * moyenne de surface à `w × h`, puis codée sur 8 bits de 0 à `maxM` mètres. La mer (masque `land` à 0) vaut 0 : le
 * relief ne creuse pas l'océan.
 */
export function encodeElevation(src: Int16Array, sw: number, sh: number, w: number, h: number, maxM: number, land: Uint8Array): Uint8Array {
  const out = new Uint8Array(w * h);
  const fx = sw / w, fy = sh / h;
  for (let y = 0; y < h; y++) {
    const y0 = y * fy, y1 = y0 + fy;
    for (let x = 0; x < w; x++) {
      if (!land[y * w + x]) continue;
      const x0 = x * fx, x1 = x0 + fx;
      let sum = 0, area = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const a = wy * (Math.min(x1, sx + 1) - Math.max(x0, sx));
          sum += Math.max(0, src[sy * sw + sx]!) * a;
          area += a;
        }
      }
      out[y * w + x] = Math.round((Math.min(maxM, sum / area) / maxM) * 255);
    }
  }
  return out;
}
