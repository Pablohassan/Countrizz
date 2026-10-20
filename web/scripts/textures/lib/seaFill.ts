/**
 * Mer de Blue Marble (spec océan §1.1, 20/10) : l'océan d'EOxCloudless est un bleu uniforme ombré par le relief du fond
 * (les bancs des Bahamas y sont bleu foncé) ; Blue Marble porte la vraie couleur de la mer, lagons compris. Mélange par le
 * masque de mer `sea` (0 = terre, 255 = mer, bord adouci) ; images RVB de même taille.
 */
export function seaFill(day: Uint8Array, bm: Uint8Array, sea: Uint8Array): Uint8Array {
  const out = new Uint8Array(day.length);
  for (let p = 0; p < sea.length; p++) {
    const w = sea[p]! / 255;
    for (let k = 0; k < 3; k++) out[p * 3 + k] = Math.round(day[p * 3 + k]! * (1 - w) + bm[p * 3 + k]! * w);
  }
  return out;
}
