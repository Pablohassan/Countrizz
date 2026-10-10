/**
 * Raccord au 180ᵉ méridien : la couverture nuageuse de Blue Marble ne se raccorde pas d'elle-même (écart moyen 11,04
 * entre les deux colonnes du bord, contre 4,9 à 7,4 entre colonnes voisines, mesuré le 10/10). Sur une bande de 2·B
 * colonnes à cheval sur le bord, fondu entre le côté droit prolongé en miroir et le côté gauche prolongé en miroir.
 */
export function seamless(img: Buffer, w: number, h: number, B: number): Buffer {
  const out = Buffer.from(img);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let k = 0; k < 2 * B; k++) {
      const s = (k + 0.5) / (2 * B), ss = s * s * (3 - 2 * s);
      const right = k < B ? img[row + w - B + k]! : img[row + w - 1 - (k - B)]!;
      const left = k >= B ? img[row + k - B]! : img[row + (B - 1 - k)]!;
      out[row + ((w - B + k) % w)] = Math.round(right * (1 - ss) + left * ss);
    }
  }
  return out;
}
